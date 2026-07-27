# ICR-127 — Admin auth: Firebase (Google + email/password), native session cookie, invite-only, Resend reset

**Ticket:** [ICR-127](https://divinelab.atlassian.net/browse/ICR-127) · Story → commit type `feat` · Component: Ministry Admin Panel (`apps/admin`) · Priority High · **QA depth: heavy**
**Design gate decisions (locked 2026-07-24):** (1) **native Firebase session cookie** (not NextAuth); (2) mailing adapter **copied into `apps/admin`** (not a shared package); (3) **full scope in one PR**; (4) **orchestrator-resolved admin-preview QA + `productionHostDeny` hardening + a QA-infra follow-up ticket**; (5) full live sign-in happy-path verified on **post-merge staging**, Google OAuth = **manual smoke**; (6) **per-user language preference folded in** — invite-carried locale → seeded `User.preferredLocale` → applied at login → the existing `LocaleSwitcher` persists the choice account-wide (English-first mission team gets English invite + English UI).
**Baked-in (unobjected):** session lifetime **5 days**; Google accepts **any** account whose email strictly matches a pending invite; Google sign-in uses **popup with `signInWithRedirect` fallback**; **roles are always resolved from Mongo, never the token**.

---

## 1. Dependencies Check

All blockers are **Done and merged** (verified 2026-07-24):

| Dep            | Provides                                                                                                                                                                                                | Status |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| ICR-124 (#102) | `apps/admin` scaffold: lazy Firebase `admin.ts`/`client.ts`, `getAdminDb()`/`getContentDb()`, next-intl proxy, placeholder `(auth)`/`no-access` pages, `messages/*`, `.env.example`, `environment.d.ts` | ✅     |
| ICR-140        | Harness rails: `sensitivePaths` globs cover `apps/admin/src/{app,proxy.ts,service,lib/auth,lib/firebase}`, `package.json`; admin `dbNameAllow`                                                          | ✅     |
| ICR-141 (#103) | Firebase project (Google + email/password enabled), Atlas users + URIs, **admin Vercel project `idc-redentor-admin`** (git-connected, per-PR previews confirmed), Resend/env names                      | ✅     |
| ICR-166 (#106) | `MONGODB_URI` → `getAdminDb()` (`ministry-admin*`), `WEBSITE_MONGODB_URI` → `getContentDb()` (`website*`); fail-closed positive-allowlist asserts                                                       | ✅     |

**Installed library versions verified against `node_modules` `.d.ts` (per standing rule #2 — 11→12 / 13→14 are major bumps):**

- `firebase-admin@14.1.0` (`lib/auth/base-auth.d.ts`, `token-verifier.d.ts`): `createSessionCookie(idToken, {expiresIn})` (options **required**), `verifySessionCookie(cookie, checkRevoked?)`, `verifyIdToken(idToken, checkRevoked?)`, `revokeRefreshTokens(uid)`, `generatePasswordResetLink(email, actionCodeSettings?)`; `DecodedIdToken.{auth_time: number, email?: string, email_verified?: boolean}`; `SessionCookieOptions.expiresIn` is **milliseconds** (min 5 min, max 2 weeks).
- `firebase@12.16.0` (`@firebase/auth@1.13.3`): `signInWithEmailAndPassword`, `signInWithPopup`, `signInWithRedirect`, `getRedirectResult`, `GoogleAuthProvider`, `signOut`, `setPersistence`, `browserLocalPersistence`, `deleteUser`.
- **`resend` is NOT yet a dependency of `apps/admin`** — must be added (`apps/web` uses `resend ^6.4.1`).

**Reused verbatim / mirrored:** `apps/admin/src/lib/firebase/{admin,client}.ts` (lazy getters — extend `admin.ts` with a `getAdminAuth()` helper), `apps/admin/src/service/database.service.ts` (`getAdminDb`, `getContentDb`), `apps/web/src/service/mailing/{types,resend.adapter}.ts` (copied), `apps/web/src/utils/auth/secret.ts` pattern (fail-closed), the toulmin-lab invite-gate **flow** (not its NextAuth/custom-claim/thrown-Error style). **Post-merge reversal:** the toulmin-lab **orphan-Firebase-credential cleanup** was initially reused too, then deliberately removed after an expert review (PR #109) — see § 11 Open Questions and `docs/architecture/admin-auth.md` § "The `no-invite` refusal" for why it doesn't apply to this app's no-signup model and was the root of a recurring severe bug class.

---

## 2. Requirements

**R1 — Firebase Admin auth handle.** Add `getAdminAuth(): Auth` to `apps/admin/src/lib/firebase/admin.ts` returning `getAuth(getFirebaseAdminApp())` (from `firebase-admin/auth`). Lazy, build-safe (never called at import). Every server-side auth op goes through it.

**R2 — `POST /api/auth/session`.** Body Zod `{ idToken: string }`. Flow: `verifyIdToken(idToken, true)` → **recency check** `Date.now()/1000 - decoded.auth_time > 300` ⇒ `401 { reason: "stale-token" }`, no cookie → **resolve-or-provision** (R5) → on success `createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN_MS })` and `Set-Cookie` (R4), `200 { ok: true, preferredLocale }` (so the client lands post-login in the stored language — R9/R18). On `{ ok:false, reason:"no-invite" }` ⇒ `403 { reason: "no-invite" }`, **no cookie**. On verify failure ⇒ `401 { reason:"invalid-token" }`. All outcomes are **return values / typed JSON**, never thrown control flow.

**R3 — `DELETE /api/auth/session`.** Read the cookie; if present + verifiable, `revokeRefreshTokens(uid)`; **always** clear the cookie (`maxAge: 0`, same name/path). Returns `200 { ok: true }` even when no/invalid cookie (idempotent sign-out).

**R4 — Session cookie shape.** Name `__session` (Firebase-hosting-safe convention). Attributes: `httpOnly: true`, `secure: true`, `sameSite: "lax"`, `path: "/"`, `maxAge` = `SESSION_EXPIRES_IN_MS / 1000`. `SESSION_EXPIRES_IN_MS = 5 * 24 * 60 * 60 * 1000` (5 days — inside Firebase's 5 min–2 wk range). Not readable from `document.cookie` (httpOnly). A single `buildSessionCookieOptions()` helper produces the attribute object so it is unit-assertable.

**R5 — Invite-only provisioning (`resolveOrProvision`).** Given a verified `DecodedIdToken`:

1. `email = normalizeEmail(decoded.email)` (lowercase + trim); if empty ⇒ `{ ok:false, reason:"no-invite" }` (no email to match).
2. `existing = findUserByFirebaseUid(decoded.uid)`; if `existing` and `status === "active"` ⇒ `{ ok:true, user: existing }` (returning user; invite untouched). If `existing` and `disabled` ⇒ `{ ok:false, reason:"disabled" }`.
3. Else (first sign-in): `invite = findPendingInvite(email)` (status `pending`, `expiresAt > now`, `email` exact-normalized). No match ⇒ `{ ok:false, reason:"no-invite" }` (**create nothing**). Match ⇒ `createUserFromInvite({ firebaseUid, email, roleIds: invite.roleIds, preferredLocale: invite.locale })`, `acceptInvite(invite._id)`, `{ ok:true, user }`. A duplicate-key (E11000) on `firebaseUid` during the create is treated as a concurrent returning user (re-read and return it) — idempotent.

**R6 — `getCurrentUser()` (authoritative server resolver).** Reads `__session` from `await cookies()`; `verifySessionCookie(cookie, true)` (**checkRevoked: true** — the authoritative path pays the network hop); resolves `AdminUser` from `getAdminDb().collection("users")` by `firebaseUid`. Returns the discriminated union `SessionResult`. **Never reads `customClaims`/`decoded.role`/`token.role`** — `roleIds` come from Mongo only. `roleIds` are _resolved and returned_; **enforcement is ICR-128** (out of scope).

**R7 — Proxy route protection** (`apps/admin/src/proxy.ts`, async). Public (unauthenticated-allowed) locale paths: `/login`, `/reset-password`, `/no-access`. For any other `(app)` path: read `__session`; `verifySessionCookie(cookie, false)` (**checkRevoked: false** — fast local verify, no per-request network). Valid ⇒ continue to `intlMiddleware`. Absent/invalid ⇒ `NextResponse.redirect` to `/{locale}/login?callbackUrl={encoded original pathname+search}`. Preserve the existing OPTIONS + static-asset bypass and the `matcher` (which already excludes `/api`). **Belt-and-braces:** the `(app)` RSC layout still re-checks via `getCurrentUser()` (proxy is a convenience, not the gate — per the Next 16 proxy security note in the ticket).

**R8 — `(app)` layout server gate.** `apps/admin/src/app/[locale]/(app)/layout.tsx` becomes an async RSC that calls `getCurrentUser()`: `{ ok:false, reason:"no-session"|"expired"|"revoked" }` ⇒ `redirect("/{locale}/login?callbackUrl=…")`; `{ ok:false, reason:"no-user"|"disabled" }` ⇒ `redirect("/{locale}/no-access")`; `{ ok:true }` ⇒ render `<AppShell>`.

**R9 — Login page + client sign-in.** `[locale]/(auth)/login/page.tsx` (RSC shell, reads `callbackUrl` from `searchParams`) renders a `'use client'` `<LoginForm>`: Google button (`signInWithPopup`; on `auth/popup-blocked`|`auth/popup-closed-by-user` fall back to `signInWithRedirect`, handled by `getRedirectResult` on mount) + email/password form (`signInWithEmailAndPassword`). On any successful Firebase sign-in: `idToken = await user.getIdToken()` → `POST /api/auth/session { idToken }`. `200` ⇒ `router.push` to the **stored-locale** form of `callbackUrl ?? "/"` (rewrite the leading `/{locale}` segment to the `preferredLocale` returned by the route; validate `callbackUrl` is a local path — starts with `/`, not `//`). `403 no-invite` ⇒ `signOut()` + `router.push("/no-access")` — **no Firebase credential is ever deleted** (see § 11 Open Questions: a prior `cleanupOrphanFirebaseAccount`/`deleteUser(auth.currentUser)` step was removed post-merge after an expert review). Other errors ⇒ localized inline message. Minimal client state; `useActionState`/`useFormStatus` where a form action fits, otherwise controlled handlers named `handle*`.

**R10 — Password reset (admin-branded, not Firebase default).** `[locale]/(auth)/reset-password/page.tsx` (RSC shell + client email form) invokes a Server Action `requestPasswordReset(email, locale)`: `generatePasswordResetLink(email, actionCodeSettings)` (Admin SDK, `actionCodeSettings.url = ${NEXT_PUBLIC_ADMIN_BASE_URL}/{locale}/login`) → send the link via Resend using the admin-branded localized template. **Enumeration-safe:** always return `{ ok: true }` and show a generic "if the email exists…" message; catch `auth/user-not-found` and any send failure, log server-side, still return `{ ok:true }`. Firebase's own reset email is never triggered.

**R11 — Emails (Resend, bilingual).** Copy `apps/web/src/service/mailing/{types.ts, resend.adapter.ts}` into `apps/admin/src/service/mailing/`; add a slim `mailing.service.ts` (**Resend-only** — admin declares no `MAIL_PROVIDER`/SendGrid; `FROM_EMAIL` default). HTML-string templates (mirroring `apps/web/src/templates`, not React-email — no new dep) in `apps/admin/src/templates/{invite,password-reset}.template.ts`, each `(params, locale) => { subject, html, text }` built from `getTranslations({ locale, namespace })`. `sendInviteEmail({ to, inviteUrl, locale })` — **`locale` is `invite.locale`** — links to `${NEXT_PUBLIC_ADMIN_BASE_URL}/{invite.locale}/login` (so an English-first invitee gets an English email + lands on the English login); `sendPasswordResetEmail({ to, resetUrl, locale })` sends the Admin-SDK-generated link (locale = the requester's current UI locale). Both render in es-AR **and** en-US.

**R12 — Mongo indexes.** `ensureAuthIndexes()` (memoized module-level promise; `createIndex` is idempotent): `users` unique on `firebaseUid`, unique on `email`; `invites` compound on `{ email: 1, status: 1 }` (+ `expiresAt: 1`). Called lazily from the user/invite services. Uses `getAdminDb()`.

**R13 — i18n.** A full `auth.*` namespace added to **both** `apps/admin/messages/{es-AR,en-US}.json` with byte-for-byte key parity (see §8). `apps/admin/src/i18n/messages.test.ts` extended to assert parity of the new keys. Every user-facing string (pages + both email templates + **every** error state) exists in both files.

**R14 — Env.** **No new env vars** — every needed var (`MONGODB_URI`, `WEBSITE_MONGODB_URI`, `NEXT_PUBLIC_ADMIN_BASE_URL`, the six `NEXT_PUBLIC_FIREBASE_*`, the three `FIREBASE_*`, `RESEND_API_KEY`, `FROM_EMAIL`) is already declared in `apps/admin/.env.example` + `environment.d.ts` (ICR-124/141). Add a short comment block in `.env.example` clarifying which vars the auth flows consume. No secret value appears anywhere.

**R15 — QA host-deny hardening.** In `.claude/config.json`, add `idc-redentor-admin.vercel.app` and `ministerio.idcredentor.org` to `qa.env.preview.productionHostDeny` **and** `qa.env.staging.productionHostDeny`, so the orchestrator-resolved admin preview can never accidentally target admin production. Update the adjacent `*Note` prose. Must still validate against the canon schema (`divinelab:canon`).

**R16 — Docs.** New `docs/architecture/admin-auth.md`: the native session-cookie flow, the invite gate (and, post-merge, why the client never deletes a Firebase credential on a refused sign-in — see § 11), the proxy-vs-server-gate split, the deliberate divergences from toulmin-lab (native cookie not NextAuth; roles from Mongo not custom claims; return values not thrown Errors), and the QA verifiability boundary. Add it to the `CLAUDE.md` doc index.

**R17 — Functional-first.** Every auth outcome is a discriminated union / `null` / `boolean`. The **only** `class` instantiated is `new Resend()` inside the copied adapter factory. No `Error` subclass for control flow (the two DB-name `throw new Error` are pre-existing deployment-defect guards, not new).

**R18 — Per-user language preference.** Delivers "show the admin in the language the user has stored, with a UI to change it" — motivated by the English-first mission team against the es-AR default.

- **`Invite.locale: Locale`** — set by whoever creates the invite (seeded invites / tests set it explicitly). Drives the invite email + invite link (R11).
- **`User.preferredLocale: Locale`** — seeded from `invite.locale` at provisioning (R5); defaults to `i18n.defaultLocale` (`es-AR`) if the invite carries none.
- **Applied at login** — `POST /api/auth/session` returns `preferredLocale`; the login client rewrites its post-login `router.push` target to that locale (R9). This is the cross-device default (a fresh browser with no `NEXT_LOCALE` cookie still lands in the stored language after sign-in).
- **Persistent switcher** — `components/shell/locale-switcher.tsx` keeps its current URL/`NEXT_LOCALE` behavior **and** additionally calls a `setPreferredLocale(locale)` Server Action that requires a valid session (`getCurrentUser`), Zod-validates the locale against `i18n.locales`, and updates `users.preferredLocale`. **Best-effort/non-blocking:** a persistence failure never blocks the visual switch (the URL/cookie change still applies). No forced per-request locale redirect (avoids redirect loops) — the stored locale is applied at login and updated by the switcher.

---

## 3. Data Model Changes

**No Contentful model changes.** MongoDB only, in `ministry-admin*` via `getAdminDb()`.

```ts
// apps/admin/src/service/types.ts (or lib/auth/types.ts)
import type { ObjectId } from "mongodb";
import type { Locale } from "@src/i18n/config"; // "es-AR" | "en-US"

export interface AdminUser {
  _id: ObjectId;
  firebaseUid: string; // unique
  email: string; // unique, normalized lowercase
  displayName?: string;
  roleIds: string[]; // resolved from the Invite; ENFORCEMENT is ICR-128
  preferredLocale: Locale; // seeded from Invite.locale; edited via the LocaleSwitcher (R18)
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
}

export interface Invite {
  _id: ObjectId;
  email: string; // normalized lowercase
  roleIds: string[];
  locale: Locale; // invitee's language — drives the invite email + seeds preferredLocale (R18)
  status: "pending" | "accepted" | "revoked";
  expiresAt: Date;
  createdAt: Date;
  acceptedAt?: Date;
  invitedByUserId?: string; // nullable (seeded invites have none)
}

export type SessionResult =
  | { ok: true; user: AdminUser }
  | {
      ok: false;
      reason:
        | "no-session" // no cookie
        | "expired" // cookie past expiry / verify failed
        | "revoked" // refresh tokens revoked (checkRevoked:true)
        | "no-user" // valid cookie, no matching Mongo User
        | "disabled" // User exists but status = disabled
        | "no-invite";
    }; // (provisioning) authenticated but no pending invite
```

**Zod** (`invites`/`users` boundary validation) mirrors these; parse each doc read from Mongo before use (`invites` especially — untrusted-shape defense).

**Indexes (R12):** `users`: `{ firebaseUid: 1 } unique`, `{ email: 1 } unique`. `invites`: `{ email: 1, status: 1 }`, `{ expiresAt: 1 }`.

---

## 4. API Changes

### `POST /api/auth/session`

- **Request:** `{ "idToken": string }` (Zod `z.object({ idToken: z.string().min(1) })`).
- **Responses:** `200 { ok: true, preferredLocale }` + `Set-Cookie: __session=…; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=432000` · `401 { ok:false, reason:"stale-token" }` (auth_time > 5 min) · `401 { ok:false, reason:"invalid-token" }` · `403 { ok:false, reason:"no-invite" }` (no cookie) · `400` (bad body).

### `DELETE /api/auth/session`

- **Request:** none (cookie read from header).
- **Response:** `200 { ok: true }` + `Set-Cookie: __session=; Max-Age=0; Path=/` (+ `revokeRefreshTokens(uid)` when the cookie was valid). Idempotent.

### Server Action `requestPasswordReset(email: string, locale: Locale)`

- Zod-validate `email`. Always returns `{ ok: true }` (enumeration-safe). Side effect: Resend email with the Admin-SDK reset link, or a no-op + server log on `user-not-found`/send failure.

### Server Action `setPreferredLocale(locale: Locale)` (R18)

- `"use server"`. Requires a valid session: `getCurrentUser()` ⇒ if `!ok`, return `{ ok: false }` (no-op). Zod-validate `locale ∈ i18n.locales`. Updates `users.preferredLocale` for the current user's `firebaseUid`. Returns `{ ok: boolean }`. Best-effort — the `LocaleSwitcher` applies the URL/`NEXT_LOCALE` change regardless of this result.

`GET /api/auth/session` is **not** implemented (RSC use `getCurrentUser()` directly).

---

## 5. New / Modified Files

### New

| Path                                                               | Purpose                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/src/service/types.ts`                                  | `AdminUser`, `Invite`, `SessionResult` + Zod schemas                                                                                                                                                                                                                                                                               |
| `apps/admin/src/service/user.service.ts`                           | `findUserByFirebaseUid`, `createUserFromInvite` (seeds `preferredLocale`), `updatePreferredLocale` + `ensureAuthIndexes` (users)                                                                                                                                                                                                   |
| `apps/admin/src/service/invite.service.ts`                         | `findPendingInvite`, `acceptInvite` (+ invites index)                                                                                                                                                                                                                                                                              |
| `apps/admin/src/service/mailing/types.ts`                          | copied from apps/web                                                                                                                                                                                                                                                                                                               |
| `apps/admin/src/service/mailing/resend.adapter.ts`                 | copied from apps/web (`new Resend()` isolated here)                                                                                                                                                                                                                                                                                |
| `apps/admin/src/service/mailing/mailing.service.ts`                | slim Resend-only `sendEmail` + `FROM_EMAIL` default                                                                                                                                                                                                                                                                                |
| `apps/admin/src/lib/auth/session.ts`                               | `SESSION_EXPIRES_IN_MS`, `buildSessionCookieOptions()`, `createSession(idToken)`, `verifySession(cookie, checkRevoked)`, `normalizeEmail`                                                                                                                                                                                          |
| `apps/admin/src/lib/auth/provision.ts`                             | `resolveOrProvision(decoded): Promise<SessionResult>` (the invite gate, R5)                                                                                                                                                                                                                                                        |
| `apps/admin/src/lib/auth/current-user.ts`                          | `getCurrentUser(): Promise<SessionResult>` (R6)                                                                                                                                                                                                                                                                                    |
| `apps/admin/src/app/api/auth/session/route.ts`                     | `POST` + `DELETE` (R2/R3)                                                                                                                                                                                                                                                                                                          |
| `apps/admin/src/app/[locale]/(auth)/login/login-form.tsx`          | `'use client'` sign-in form (R9). No Firebase-credential deletion (removed post-merge — § 11)                                                                                                                                                                                                                                      |
| `apps/admin/src/app/[locale]/(auth)/reset-password/reset-form.tsx` | `'use client'` reset request form (R10)                                                                                                                                                                                                                                                                                            |
| `apps/admin/src/app/[locale]/(auth)/reset-password/actions.ts`     | `requestPasswordReset` server action (R10)                                                                                                                                                                                                                                                                                         |
| `apps/admin/src/components/shell/locale-actions.ts`                | `"use server"` `setPreferredLocale` (R18)                                                                                                                                                                                                                                                                                          |
| `apps/admin/src/templates/invite.template.ts`                      | bilingual invite email builder (R11)                                                                                                                                                                                                                                                                                               |
| `apps/admin/src/templates/password-reset.template.ts`              | bilingual reset email builder (R11)                                                                                                                                                                                                                                                                                                |
| `apps/admin/src/components/ui/input.tsx`                           | shared `Input` (fixup, PR #109 review) — DRYs the login/reset email+password fields; mirrors `ui/button.tsx`'s conventions. Tailwind v4 `inset-ring-*` draws the focus ring INSIDE the field (never an outer `ring-*` box-shadow, which visually encroached on neighbouring elements). A full design-system Input is ICR-18's job. |
| `docs/architecture/admin-auth.md`                                  | design doc (R16)                                                                                                                                                                                                                                                                                                                   |
| unit tests                                                         | `*.test.ts` beside session/provision/current-user/services/templates + `proxy.test.ts` additions                                                                                                                                                                                                                                   |

### Modified

| Path                                                               | Change                                                                                                                                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/package.json`                                          | add `resend` dependency; bump `@idcr/admin` via changeset                                                                                                                    |
| `apps/admin/src/lib/firebase/admin.ts`                             | add `getAdminAuth(): Auth`                                                                                                                                                   |
| `apps/admin/src/proxy.ts`                                          | async session gate + public-path allowlist + callbackUrl redirect (R7)                                                                                                       |
| `apps/admin/src/proxy.test.ts`                                     | cover redirect/allow/bypass                                                                                                                                                  |
| `apps/admin/src/app/[locale]/(app)/layout.tsx`                     | async `getCurrentUser()` gate (R8)                                                                                                                                           |
| `apps/admin/src/app/[locale]/(auth)/login/page.tsx`                | real RSC shell rendering `<LoginForm>`                                                                                                                                       |
| `apps/admin/src/app/[locale]/(auth)/reset-password/page.tsx`       | real RSC shell rendering `<ResetForm>`                                                                                                                                       |
| `apps/admin/src/app/[locale]/no-access/page.tsx`                   | localized no-access + link to the public church website / sign-out (fixup, PR #109 review — the redundant `/login` link was removed since signing out already returns there) |
| `apps/admin/src/app/[locale]/(auth)/login/login-form.tsx`          | uses the shared `Input` (fixup, PR #109 review)                                                                                                                              |
| `apps/admin/src/app/[locale]/(auth)/reset-password/reset-form.tsx` | uses the shared `Input` (fixup, PR #109 review)                                                                                                                              |
| `apps/admin/src/components/shell/locale-switcher.tsx`              | additionally persist the selection to `User.preferredLocale` via `setPreferredLocale` (R18)                                                                                  |
| `apps/admin/messages/{es-AR,en-US}.json`                           | add `auth.*` namespace (both, parity); `auth.noAccess.backToLogin` → `backToWebsite` (fixup)                                                                                 |
| `apps/admin/src/i18n/messages.test.ts`                             | assert `auth.*` parity                                                                                                                                                       |
| `apps/admin/.env.example`                                          | comment block: which vars the auth flows consume; + `NEXT_PUBLIC_WEBSITE_URL` (fixup, PR #109 review)                                                                        |
| `apps/admin/src/types/environment.d.ts`                            | + `NEXT_PUBLIC_WEBSITE_URL` (fixup, PR #109 review)                                                                                                                          |
| `.claude/config.json`                                              | `productionHostDeny` hardening (R15)                                                                                                                                         |
| `CLAUDE.md`                                                        | add `admin-auth.md` to the doc index                                                                                                                                         |
| `.changeset/*.md`                                                  | `@idcr/admin` minor (feat)                                                                                                                                                   |

---

## 6. Component Hierarchy

```
[locale]/(auth)/login/page.tsx (RSC: reads callbackUrl)
└── LoginForm ('use client')
    ├── GoogleButton        → signInWithPopup → (fallback) signInWithRedirect / getRedirectResult
    ├── EmailPasswordForm    → signInWithEmailAndPassword
    ├── error banner (localized: wrong-password, no-invite, expired, popup-*, network, generic)
    └── link → /reset-password
    · on Firebase success → getIdToken → POST /api/auth/session
    ·   200 → router.push(callbackUrl ?? "/")
    ·   403 no-invite → signOut → /no-access (no credential deletion — § 11)

[locale]/(auth)/reset-password/page.tsx (RSC)
└── ResetForm ('use client') → requestPasswordReset(email, locale) → generic success

[locale]/no-access/page.tsx (RSC, localized) → link to the public church website (NEXT_PUBLIC_WEBSITE_URL, fallback
  https://www.idcredentor.org) / sign-out (fixup, PR #109 review — replaces a redundant back-to-login link, since
  signing out already returns there)

[locale]/(app)/layout.tsx (RSC gate) → getCurrentUser()
   ok → <AppShell>{children}</AppShell> ; no-session/expired/revoked → /login ; no-user/disabled → /no-access
```

Responsive: auth pages are centered single-column (`min-h-screen items-center`), full-width form ≤ `max-w-sm`, same at all breakpoints (no distinct mobile/desktop layout beyond padding). Uses `@idcr/ui` tokens + the scaffold's shadcn `button`. The `(app)` topbar's existing `LocaleSwitcher` (unchanged UI) now also persists the selection to `User.preferredLocale` (R18).

---

## 7. Edge Cases

1. **Stale ID token** (`auth_time` > 5 min) → `401 stale-token`, no cookie. Client re-prompts sign-in.
2. **No matching invite** → `403 no-invite`, no cookie; client `signOut`s + `/no-access` — **no Firebase credential is deleted** (a prior cleanup was removed post-merge; see § 11). **No `users` write** (assert count unchanged).
3. **Expired invite** (`expiresAt <= now`) → excluded by the query → treated as no-invite.
4. **Revoked invite** (`status:"revoked"`) → excluded by the query → no-invite.
5. **Email mismatch** (invite email ≠ account email) → query keys on normalized email, no match → no-invite (strict; no aliasing).
6. **Token without email** (`decoded.email` undefined) → no-invite (nothing to match).
7. **Returning active user** (valid recent token, `User` exists) → cookie set, `200`, invite untouched.
8. **Sign-out** → `DELETE` clears cookie + `revokeRefreshTokens`; next request's `getCurrentUser` (checkRevoked:true) → `revoked` → `/login`.
9. **Expired session cookie** (> 5 d) → `verifySessionCookie` fails → proxy → `/login`.
10. **Valid cookie, User deleted/disabled after issuance** → `getCurrentUser` → `no-user`/`disabled` → `(app)` layout → `/no-access`.
11. **Google popup blocked/closed** → localized error → `signInWithRedirect` fallback; `getRedirectResult` completes on return.
12. **Wrong password / unknown user** (email/pw) → localized **generic** error (no enumeration).
13. **Reset for unknown email** → generic success; `generatePasswordResetLink` error caught + logged; no email sent, no leak.
14. **Concurrent first sign-in** → `users` unique `firebaseUid` index → E11000 caught → re-read + return existing (idempotent).
15. **DB misconfig** → `getAdminDb()` throws fail-closed (pre-existing ICR-124/166 guard).
16. **Roles from token attempt** → none exists: `getCurrentUser` reads Mongo only; grep asserts no `customClaims`/`decoded.role`/`token.role` authorization read path.
17. **callbackUrl open-redirect** → client validates it is a local path (`^/(?!/)`) before `router.push`; otherwise `/`.
18. **Invite without a locale** (legacy/omitted) → `User.preferredLocale` seeds to `i18n.defaultLocale` (es-AR).
19. **Locale-switcher persistence fails** (network/DB) → non-blocking: the URL/`NEXT_LOCALE` switch still applies; `preferredLocale` is just not updated (fixed on the next toggle).
20. **`setPreferredLocale` without a session** → no-op `{ ok:false }` (defense-in-depth; the switcher renders only inside the authenticated shell).
21. **Post-login lands in stored locale** → after `200`, an en-US user whose browser had no `NEXT_LOCALE` cookie is pushed to `/en-US/…` (not the es-AR default).

---

## 8. i18n (es-AR default + en-US)

New `auth.*` namespace (both files, exact parity). Key groups:

- `auth.login`: `title`, `subtitle`, `googleButton`, `emailLabel`, `passwordLabel`, `submit`, `forgotPassword`, `orSeparator`.
- `auth.login.errors`: `wrongPassword`, `userNotFound`, `noInvite`, `inviteExpired`, `sessionExpired`, `popupBlocked`, `popupClosed`, `network`, `tooManyRequests`, `generic`.
- `auth.resetPassword`: `title`, `subtitle`, `emailLabel`, `submit`, `successGeneric`, `backToLogin`.
- `auth.noAccess`: `title`, `description`, `backToWebsite`, `signOut`. (`backToWebsite` replaces the original
  `backToLogin` — fixup, PR #109 review: signing out already returns to `/login`, so the link now points at the
  public church website instead.)
- `auth.email.invite`: `subject`, `heading`, `greeting`, `body`, `cta`, `expiryNote`, `footer`.
- `auth.email.reset`: `subject`, `heading`, `body`, `cta`, `expiryNote`, `ignoreNote`, `footer`.

es-AR uses voseo where natural ("Ingresá", "Revisá tu correo"), correct accents. The three existing `pages.{login,resetPassword,noAccess}` keys are superseded by `auth.*` and removed (pages now read `auth.*`); `pages.comingSoon` stays for the still-placeholder `(app)` pages.

---

## 9. Testing Strategy

**Unit (Vitest, mocked firebase-admin + Mongo):**

- `session.test.ts`: `buildSessionCookieOptions()` exact attributes + 5-day maxAge; `SESSION_EXPIRES_IN_MS` inside 5min–2wk; `normalizeEmail`.
- `provision.test.ts`: all R5 branches — returning active, disabled, invite-match (creates User + accepts invite), no-invite (creates nothing), expired/revoked invite, email mismatch, missing email, E11000 idempotency.
- `current-user.test.ts`: no-session/expired/revoked/no-user/disabled/ok; asserts **no** token-role read.
- `route.test.ts`: POST 200 (Set-Cookie attrs), 401 stale-token, 401 invalid, 403 no-invite (no Set-Cookie), 400 bad body; DELETE clears + revokes + idempotent.
- `invite.service.test.ts` / `user.service.test.ts`: query shapes, normalization, index calls.
- template tests: invite + reset subject/html/text contain the localized strings for **both** locales; reset action stays enumeration-safe.
- `proxy.test.ts`: unauth `(app)` → redirect `/login?callbackUrl`; public paths bypass; valid cookie → next; asset/OPTIONS bypass preserved.
- `messages.test.ts`: `auth.*` parity both files.
- **Per-user locale (R18):** `provision` seeds `preferredLocale` from `invite.locale` (defaults es-AR when absent); `route` POST returns `preferredLocale`; `locale-actions.test.ts` — `setPreferredLocale` updates on a valid session, no-ops `{ok:false}` without a session, rejects an out-of-set locale; invite email built with `invite.locale`.

**Pre-merge QA (heavy, on the orchestrator-resolved `idc-redentor-admin` per-PR preview):** MCP browser walk of `/login`, `/reset-password`, `/no-access` in **both** locales (render + all strings present); **proxy redirect** (`GET /{locale}` `(app)` unauthenticated → `/login?callbackUrl`); `POST /api/auth/session` with missing/garbage body → 400/401 no cookie. Env-limited (Firebase live sign-in) parts come back **BLOCKED**, not FAIL (ICR-44/ICR-136 pattern).

**Post-merge staging QA:** seed a pending test `Invite` + a Firebase email/password test user in `ministry-admin-staging`; run the email/password happy-path (cookie minted, `User` created, invite `accepted`), sign-out revoke, and no-invite rejection. **Google OAuth = manual smoke** (non-automatable).

**No admin Playwright project yet** — `apiAdmin`/`e2eAdmin` are forward-declared; the companion QA-infra ticket (below) registers them.

---

## 10. Implementation Checkpoints

**CP1 — Data layer + services + mailing adapter + Firebase auth handle.**
Files: `service/types.ts` (incl. `Invite.locale`, `User.preferredLocale`, `Locale` import), `service/user.service.ts` (`createUserFromInvite` seeds `preferredLocale`, `updatePreferredLocale`), `service/invite.service.ts`, `service/mailing/{types,resend.adapter,mailing.service}.ts`, `lib/firebase/admin.ts` (+`getAdminAuth`), `package.json` (+`resend`), `.changeset/*`, unit tests (services + indexes + normalize + locale seed/default).
Verify: `pnpm --filter @idcr/admin type-check lint test`.
Commit: `feat(ICR-127): admin auth data layer, invite/user services, mailing adapter`

**CP2 — Session route + session/provision/current-user libs.**
Files: `lib/auth/{session,provision,current-user}.ts`, `app/api/auth/session/route.ts`, tests (`session`, `provision`, `current-user`, `route`). Provision seeds `preferredLocale` from `invite.locale`; POST returns `preferredLocale`.
Verify: type-check + lint + test (cookie attrs, recency 401, all provisioning branches, revoke, preferredLocale in the 200).
Commit: `feat(ICR-127): native Firebase session cookie route + invite-gated provisioning`

**CP3 — Proxy protection + (app) layout gate.**
Files: `proxy.ts`, `proxy.test.ts`, `app/[locale]/(app)/layout.tsx`.
Verify: proxy tests (redirect/allow/bypass) + type-check + lint.
Commit: `feat(ICR-127): proxy + RSC gate protecting admin (app) routes`
_(Draft PR opens after CP1 verify — step 11; CP2/CP3 push onto it.)_

**CP4 — Login page + client sign-in + no-access + login/no-access i18n.**
Files: `(auth)/login/page.tsx` + `login-form.tsx` (popup→redirect fallback, callbackUrl validation, **post-login push to the returned `preferredLocale`**; the orphan-cleanup step this checkpoint originally shipped was removed post-merge — § 11 item 6), `no-access/page.tsx`, `messages/{es-AR,en-US}.json` (`auth.login.*`, `auth.noAccess.*`).
Verify: type-check + lint + test + `pnpm --filter @idcr/admin build`.
Commit: `feat(ICR-127): admin login (Google + email/password) + no-access + auth gate`

**CP5 — Reset flow + email templates + email/reset i18n + parity test.**
Files: `(auth)/reset-password/{page.tsx,reset-form.tsx,actions.ts}`, `templates/{invite,password-reset}.template.ts` (invite email built with `invite.locale`), `messages/*` (`auth.resetPassword.*`, `auth.email.*`), `i18n/messages.test.ts`.
Verify: type-check + lint + test (template render both locales, enumeration-safe) + build.
Commit: `feat(ICR-127): Resend-branded bilingual invite + password-reset emails`

**CP6 — Per-user language preference UI (R18).**
Files: `components/shell/locale-actions.ts` (`"use server"` `setPreferredLocale`), `components/shell/locale-switcher.tsx` (persist selection to `User.preferredLocale`, non-blocking), tests (`locale-actions.test.ts`).
Verify: type-check + lint + test (session-required, invalid-locale reject, non-blocking failure) + build.
Commit: `feat(ICR-127): persist per-user admin language preference via the locale switcher`

**CP7 — QA host-deny hardening + docs + env comment.**
Files: `.claude/config.json` (R15, then re-validate via `divinelab:canon`), `docs/architecture/admin-auth.md` (incl. the per-user-locale flow), `CLAUDE.md` (doc index), `apps/admin/.env.example` (comment).
Verify: `divinelab:canon` validate + type-check/lint/test (config/docs are inert to the build).
Commit: `feat(ICR-127): harden QA host-deny for admin preview + admin-auth docs`

_(7 checkpoints — under the >8 split guard.)_

---

## 11. Open Questions / Deferred

1. **QA-infra follow-up ticket** (decided at the design gate): register `idc-redentor-admin` as a first-class QA target in `.claude/config.json` (per-app preview `vercelProject` + `apiAdmin`/`e2eAdmin` Playwright project). Filed at triage (step 15); unblocks repeatable admin e2e for ICR-128+. Recorded per the deferred-action rule.
2. **First-admin seed** (`ICR-155`, To Do) — no admin user exists yet, so the staging happy-path QA seeds its own throwaway invite+user in `ministry-admin-staging`. Not this ticket.
3. **Session lifetime 5 days** and **any-Google-account strict-email** are proposals leadership can revisit; both are single-constant changes.
4. **Invite _creation_ UI/flow** is out of scope (no trigger for the invite email in this ticket beyond seeded/test invites) — the invite email _template + send function_ are built and unit-tested here; the admin-facing "send invite" surface (where an admin will pick `invite.locale`) is a later ticket under ICR-13. Until then, seeded/test invites set `locale` explicitly.
5. **`X-Frame-Options`/CSP for `apps/admin`** — the admin app has no `config/headers.js` yet; security headers for admin are not in this ticket's scope (auth cookie flags are). Flag for a later hardening pass if not already ticketed.
6. **Client-side orphan-Firebase-credential cleanup — evaluated and deliberately NOT adopted (post-merge reversal, PR #109).** §§ R9/R16 and §§ 5–7 above originally described a `cleanupOrphanFirebaseAccount()` step, copied from `divinelab/toulmin-lab`, that deleted the just-signed-in Firebase credential on a `403 no-invite` refusal. It was removed after an expert review, for reasons that don't retroactively belong in the requirements above but must be on record: (a) it never reliably achieved its purpose — it only ever fired for someone who signed in through the admin's own `/login` page with no invite, not for a Firebase account created any other way (e.g. the public REST API); (b) toulmin-lab's premise doesn't transfer — that app has a public signup where a pre-existing account blocks re-signup, whereas `apps/admin` has no signup at all (Google auto-provisions identically on every sign-in; email/password can't create an account), so a pre-existing Firebase account for an invited address was never actually an obstacle here; (c) it was the root of a recurring, severe bug class — three separate review rounds each found a different path where the wrong, already-provisioned account got deleted; (d) it erased an audit signal for the one door into congregant PII this app has; (e) an uninvited Firebase account is inert (no `AdminUser` row, no session, no access) regardless of whether it's ever deleted. See `docs/architecture/admin-auth.md` § "The `no-invite` refusal" for the full writeup.
7. **Deferred replacement requirement — invite CREATION must handle a pre-existing Firebase account (later ticket).** The one legitimate concern the removed cleanup was reaching for — an address that already has a Firebase account being invited — must be handled server-side, at invite-creation time (the ICR-13 "send invite" surface), not at sign-in: look the email up with the Admin SDK (`getUserByEmail`) and either reuse it (set `emailVerified`, send a password-set link) or deliberately delete-and-recreate it. This replaces the removed client-side cleanup and must be tracked when the invite-creation ticket is scoped.
