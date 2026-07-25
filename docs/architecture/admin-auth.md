# Admin auth — native Firebase session cookie, invite-only

`apps/admin` is the one authenticated surface in this repo (`apps/web` has none — see
`docs/product/scope-and-boundaries.md`). Sign-in is Firebase (Google + email/password), exchanged
for a native httpOnly session cookie the app mints and verifies itself — no NextAuth. Access is
**invite-only**: a Firebase credential alone grants nothing until it matches a pending `Invite` in
`ministry-admin*`. Design record: `tasks/specs/ICR-127-admin-firebase-auth.md`.

## Why native cookies, not NextAuth

`divinelab/toulmin-lab` (a sibling project) also does Firebase Auth + RBAC, via NextAuth's
credentials provider wrapping Firebase. ICR-127's design gate deliberately diverged in three ways:

| Toulmin-lab                                                           | `apps/admin` (this ticket)                                                                              | Why                                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| NextAuth session (JWT/DB strategy, its own cookie)                    | **Native Firebase session cookie** (`createSessionCookie`/`verifySessionCookie`, `__session`)           | One fewer framework in the loop; the Admin SDK already owns session-cookie lifecycle end to end (mint, verify, revoke).                                                        |
| Roles as Firebase **custom claims** on the token                      | **Roles resolved from Mongo** (`AdminUser.roleIds`), never the token                                    | Claims require a separate admin-SDK round trip to set and go stale until the next token refresh; a Mongo read is always current and is the same store invites already live in. |
| Auth failures as **thrown `Error`s** / NextAuth's own error surfacing | **Every outcome is a return value** — `SessionResult` discriminated union, `null`, or a typed JSON body | Matches this repo's repo-wide functional-first convention (`CLAUDE.md` § Code Conventions): no `Error` subclass for control flow anywhere in the auth path.                    |

The invite-gate **flow** (verify → look up existing user → fall back to a pending invite →
provision) is the one thing reused from toulmin-lab; its NextAuth/custom-claim/thrown-Error
_style_ was not.

## Request flow

```
Client (login-form.tsx)
  │ signInWithEmailAndPassword | signInWithPopup/signInWithRedirect
  ▼
Firebase Auth (client SDK) — issues an ID token
  │ user.getIdToken()
  ▼
POST /api/auth/session { idToken }
  │ 1. verifyIdToken(idToken, true)              — 401 invalid-token on failure
  │ 2. auth_time recency (≤ 5 min)                — 401 stale-token
  │ 3. resolveOrProvision(decoded)                — 403 { reason } on refusal, no cookie either way
  │ 4. createSessionCookie(idToken, {expiresIn})  — 200 { ok:true, preferredLocale } + Set-Cookie
  ▼
__session cookie (httpOnly) on the browser
  │ every subsequent request
  ▼
proxy.ts  (fast, local check)         →  (app)/layout.tsx  (authoritative check)
  verifySession(cookie, false)            getCurrentUser() → verifySession(cookie, true)
  redirect → /login on failure            redirect → /login | /no-access on failure
```

### `POST /api/auth/session` (`src/app/api/auth/session/route.ts`)

Body: `{ idToken: string }` (Zod). In order:

1. `getAdminAuth().verifyIdToken(idToken, true)` — verify failure ⇒ `401 { reason: "invalid-token" }`.
2. **`auth_time` recency**: `Date.now()/1000 - decoded.auth_time > 300` ⇒ `401 { reason: "stale-token" }`.
   This rejects a _verified-but-old_ cached ID token — the exchange only accepts a fresh sign-in
   event, not a token minted long ago and replayed.
3. `resolveOrProvision(decoded)` (the invite gate — see below). `{ ok:false }` ⇒
   `403 { reason: "no-invite" | "disabled" }`, **no cookie set either way**.
4. On success: `createSession(idToken)` → `Set-Cookie` with `buildSessionCookieOptions()` (see
   below) → `200 { ok: true, preferredLocale: result.user.preferredLocale }`.

Every branch returns a typed JSON body — nothing here throws past the route boundary.

### `DELETE /api/auth/session` (sign-out)

Reads the cookie; if present and verifiable (`verifySession(cookie, false)`),
`revokeRefreshTokens(uid)` is called **best-effort** (wrapped in try/catch — a revoke failure must
never block sign-out). The cookie is **always** cleared (`Set-Cookie` with the same attributes and
`maxAge: 0`), so the endpoint is idempotent: calling it with no cookie, or a garbage one, still
returns `200 { ok: true }`.

### Session cookie shape (`src/lib/auth/session.ts`)

| Attribute  | Value                       | Why                                                                                                                                                                                         |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name       | `__session`                 | The one cookie name Firebase Hosting's CDN forwards to the origin uncached; kept for consistency with the Admin SDK's own examples even though this app isn't served from Firebase Hosting. |
| `httpOnly` | `true`                      | Never readable from `document.cookie` — the whole point of a server-verified session.                                                                                                       |
| `secure`   | `true`                      | HTTPS only.                                                                                                                                                                                 |
| `sameSite` | `"lax"`                     | Survives top-level navigation (e.g. an email link into `/login`) without CSRF exposure on cross-site subrequests.                                                                           |
| `path`     | `"/"`                       | Sent on every route, including the API route that clears it.                                                                                                                                |
| `maxAge`   | `432000` (seconds) = 5 days | `SESSION_EXPIRES_IN_MS / 1000`. Inside the Admin SDK's allowed session-cookie range (5 min–2 weeks).                                                                                        |

`buildSessionCookieOptions()` is the single source of truth for this object — both the `Set-Cookie`
on success (`POST`) and the clearing cookie (`DELETE`, spread with `maxAge: 0`) build off it, and
it's unit-asserted in isolation (`session.test.ts`).

## `getCurrentUser` vs the proxy — two verifications, one authoritative

Next.js 16's guidance is to verify auth **inside every Server Function that needs it**, not to
trust a `proxy.ts`/middleware pass alone (middleware runs on the edge and is a convenience layer,
not a security boundary a page can rely on by itself). This app implements that with two call
sites that both wrap `verifySession`, at different trust levels:

| Call site                                                                       | `checkRevoked` | Cost                           | Role                                                                                                                                                                                                |
| ------------------------------------------------------------------------------- | :------------: | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proxy.ts` (`verifySession(cookie, false)`)                                     |    `false`     | Local cryptographic check only | **Convenience redirect.** Fast, no extra network hop, runs on every matched request. Bounces an obviously-unauthenticated request to `/login` before it reaches React.                              |
| `getCurrentUser()` (`src/lib/auth/current-user.ts`, used by `(app)/layout.tsx`) |     `true`     | Extra network call to Firebase | **The gate of record.** Catches a session **revoked** (sign-out elsewhere, admin disable) or a Mongo `User` deleted/disabled _after_ the cookie was issued — things a purely local check can't see. |

Both must independently agree the request is authenticated; neither alone is sufficient. The proxy
existing at all is a UX optimization (skip a React render round-trip for the common
already-signed-out case) — remove it and the app is still secure, just slower to bounce a stale
visitor to `/login`. Remove `getCurrentUser()`'s check from the layout, however, and the app is
**not** secure: a revoked/disabled user with a not-yet-expired cookie would still render `(app)`
content, because the proxy's `checkRevoked:false` pass would let it straight through.

`getCurrentUser()` never reads `customClaims`, `decoded.role`, or `token.role` — `roleIds` and
`preferredLocale` come from the matching Mongo `AdminUser` document only. This is enforced by
convention (see the toulmin-lab divergence table above) and is grep-checkable: no such read path
exists anywhere in `apps/admin`. **Enforcement** of `roleIds` (route/action gating by role) is out
of scope for ICR-127 — tracked as ICR-128; this ticket only resolves and returns them.

## The invite gate (`resolveOrProvision`, `src/lib/auth/provision.ts`)

Given a verified `DecodedIdToken`:

1. `email = normalizeEmail(decoded.email)` (lowercase + trim). Empty ⇒ `{ ok:false, reason:"no-invite" }`
   — nothing to match, so nothing is looked up.
2. `findUserByFirebaseUid(decoded.uid)` — a **returning** user. `active` ⇒ `{ ok:true, user }`
   (invite untouched); `disabled` ⇒ `{ ok:false, reason:"disabled" }`.
3. First sign-in (no matching `AdminUser` yet): `claimPendingInvite(email)` **atomically** finds
   and accepts a pending, unexpired invite in a single `findOneAndUpdate` (filter: pending +
   unexpired + normalized email; update: `status: "accepted"`, stamps `acceptedAt`;
   `returnDocument: "after"`). Folding the find and the accept into one Mongo operation closes a
   TOCTOU window a separate read-then-write left open: an invite revoked or expired **between** the
   two steps could otherwise still provision a user. No match can mean a genuine `no-invite`
   (expired/revoked/mismatched) — **or** a lost race: a concurrent same-uid exchange claimed this
   exact invite and provisioned the `AdminUser` a moment earlier. `resolveOrProvision` re-reads
   `findUserByFirebaseUid(decoded.uid)` before concluding `no-invite`; if the concurrent winner's
   user now exists it resolves exactly like the returning-user path (step 2 — `active` ⇒ `ok`,
   `disabled` ⇒ `{ ok:false, reason:"disabled" }`). Only when that re-read also comes back empty is
   it genuinely `{ ok:false, reason:"no-invite" }`, and **nothing is written**. Getting this re-read
   wrong is not cosmetic: the client deletes the Firebase credential on `no-invite` (see below) —
   for a lost race that credential is the WINNER's just-provisioned account (same `firebaseUid`),
   so skipping the re-read would delete it out from under them: a permanent lockout plus an
   orphaned `AdminUser` with no usable Firebase credential.

   A claimed invite creates the `AdminUser` (seeding `roleIds` and `preferredLocale` from the
   invite — see below) and returns `{ ok:true, user }`. If that create fails for any reason other
   than the duplicate-key race below, the claim is reverted via `revertInviteClaim(invite._id,
invite.acceptedAt)`: back to `status: "pending"`, `acceptedAt` unset — but the underlying
   `updateOne` is **conditional**, guarded by `{ _id, status: "accepted", acceptedAt }` (the exact
   triple this claim itself set), not `_id` alone. An `_id`-only revert would blindly overwrite
   whatever the invite's CURRENT status is; the guard means a newer transition that happened
   between the claim and this revert — e.g. an admin concurrently revoking the invite — can never
   be clobbered back to `"pending"` (which would make a revoked invite usable again). A mismatched
   filter simply matches zero documents — a safe no-op — instead of a blind revert.

A duplicate-key error (E11000) on the `users.firebaseUid` unique index during the create — two
concurrent first sign-ins racing — is treated as "someone else just provisioned this user":
re-read via `findUserByFirebaseUid` and return that, rather than surfacing the conflict. If that
internal recovery ever comes back empty (an exceedingly rare inconsistency), the error propagates
out of `resolveOrProvision` unchanged rather than reverting a claim a user may have genuinely (if
racily) already consumed.

### The `no-invite` orphan cleanup — and why `disabled` is different

When `POST /api/auth/session` returns `403 { reason: "no-invite" }`, the client
(`login-form.tsx`'s `postSession`) deletes the just-created Firebase credential
(`cleanupOrphanFirebaseAccount` → best-effort `deleteUser(auth.currentUser)`) before signing out.
This account was **never** written anywhere in Mongo — Firebase is the only place it exists — so
deleting it just prevents an orphaned, permanently-unusable sign-in-only credential from
accumulating (anyone can create a Google/email Firebase account; only a matching invite turns it
into an `AdminUser`).

**A `disabled` user's Firebase credential is never cleaned up.** That account is a real,
provisioned `AdminUser` an admin deliberately disabled (e.g. offboarding) — its `firebaseUid` is
the join key back to that Mongo document, `roleIds`, and history. Deleting the Firebase credential
would sever that link and make re-enabling the user (flipping `status` back to `active`)
impossible without the person re-registering from scratch. The client distinguishes the two by the
`reason` in the `403` body and only calls the cleanup for `"no-invite"`.

## Roles and `preferredLocale`: Mongo, never the token

Every read of `roleIds` or `preferredLocale` goes through `AdminUser` in
`getAdminDb().collection("users")`, parsed through `adminUserSchema` (Zod) — never through
`decoded.customClaims` or any other token-derived field. This is a deliberate, permanent property
of the design (see the divergence table above), not an artifact of what's implemented today:
Firebase custom claims are set via a separate Admin SDK call and only refresh on the client's next
token refresh (up to an hour stale by default), whereas a Mongo read is authoritative at request
time and is the same store the invite already lives in — one source of truth instead of two.

## Per-user language preference (`preferredLocale`)

Motivated by an English-first mission team working against the `es-AR` site default. Three points
in the lifecycle:

1. **Invite-seeded.** `Invite.locale: Locale` is set by whoever creates the invite (invite-creation
   UI is out of scope for this ticket — ICR-13 tracks it; until then, seeded/test invites set
   `locale` explicitly). On first sign-in, `resolveOrProvision` seeds
   `AdminUser.preferredLocale = invite.locale`.
   - **Legacy/seeded invites with no `locale` field** (or an invalid one) do not fail provisioning:
     `inviteSchema`'s `locale` field is `z.enum(i18n.locales).catch(i18n.defaultLocale)` (see
     `src/service/types.ts`), so a missing/bad value resolves to `i18n.defaultLocale` (`es-AR`) at
     the Zod-parse boundary in `findPendingInvite`, before `resolveOrProvision` ever sees it. (An
     `invite.locale ?? i18n.defaultLocale` fallback also exists in `provision.ts` itself as
     defense-in-depth, but the schema-level default is what actually prevents the throw — a bare
     `??` can't rescue a value Zod already rejected during `.parse()`.)
   - **`AdminUser.preferredLocale` stays a strict `z.enum(i18n.locales)`** (not tolerant) — every
     `AdminUser` document is written by this app's own code (provisioning or the locale switcher),
     never a legacy import, so there's no missing-field case to tolerate there.
2. **Login-applied.** `POST /api/auth/session`'s `200` body includes `preferredLocale`;
   `login-form.tsx` rewrites its post-login `router.push` target to that locale (stripping any
   `/{locale}` prefix already on `callbackUrl` first, so next-intl's router doesn't double it).
   This makes the stored preference the **cross-device** default — a fresh browser with no
   `NEXT_LOCALE` cookie still lands in the user's stored language right after signing in.
   `stripLocalePrefix` splits off any query string (e.g. `?tab=roles`) **before** parsing the
   leading path segment: parsing the whole string in one pass would treat `es-AR?tab=roles` as a
   single (invalid) locale token, silently skip the strip, and let the stored-locale push double
   the prefix (`/en-US/es-AR?tab=roles` — a 404).
3. **Switcher-persisted.** `components/shell/locale-switcher.tsx` keeps its existing
   URL/`NEXT_LOCALE` behavior and additionally fires `setPreferredLocale(locale)` (a `"use server"`
   action, `components/shell/locale-actions.ts`) — **non-blocking** (`void`-called; the visual
   switch already applied before the result is known). The action itself requires a valid session
   (`getCurrentUser()`; no-op `{ ok:false }` without one — defense in depth, since the switcher only
   renders inside the authenticated shell) and Zod-validates the locale against `i18n.locales`
   before writing `users.preferredLocale`.

No per-request forced-locale redirect exists (that would risk a redirect loop); the stored locale
is only ever _applied_ at login and _updated_ by the switcher.

## Emails (Resend, bilingual)

`apps/admin/src/service/mailing/{types,resend.adapter}.ts` are copied verbatim from
`apps/web`'s equivalents (the design gate chose a copy over a shared package for this ticket — see
the spec's design-gate decisions). `mailing.service.ts` is a slim, **Resend-only** wrapper (no
`MAIL_PROVIDER` switch — admin never uses SendGrid). `src/templates/{invite,password-reset}.template.ts`
build `{ subject, html, text }` from `getTranslations({ locale, namespace: "auth.email.*" })`,
rendering in **both** `es-AR` and `en-US`.

- **Invite email** locale is **`invite.locale`** (not the sender's UI locale) — an English-first
  invitee gets an English email that links to `/en-US/login`.
- **Password-reset email** locale is the requester's current UI locale (the person on
  `/reset-password` right now).
- The reset link itself comes from `getAdminAuth().generatePasswordResetLink(...)`
  (`actionCodeSettings.url` points at `${NEXT_PUBLIC_ADMIN_BASE_URL}/{locale}/login`, not Firebase's
  hosted reset page) — **Firebase's own reset email is never triggered**; only the admin-branded
  Resend template is sent.
- **Enumeration-safe by construction**: `requestPasswordReset` always returns `{ ok: true }`.
  `auth/user-not-found` from `generatePasswordResetLink` (and any send failure — including a
  throttle-store outage, e.g. Mongo down) is caught and logged server-side only — the caller can
  never distinguish "no such account" from "email sent" from "the throttle store is unavailable."
- The address is `normalizeEmail`'d (trim + lowercase) **before** the throttle acquisition and the
  reset-link generation, so `user@x.com` and `User@X.com` — the same mailbox, per Firebase — share
  one throttle claim (`reset-throttle.service.ts`) instead of each getting its own 60s cooldown.

## Functional-first, end to end

Every auth outcome in this flow is a return value:

- `SessionResult` (`src/service/types.ts`) — the discriminated union threaded through
  `resolveOrProvision`, `getCurrentUser`, and the session route.
- `verifySession(cookie, checkRevoked)` returns `DecodedIdToken | null` — never throws past its own
  try/catch.
- `requestPasswordReset` / `setPreferredLocale` return `{ ok: boolean }` (or `{ ok: true }` always,
  for the enumeration-safe reset case).
- The **only** `class` instantiated anywhere in this flow is `new Resend()`, isolated inside the
  copied `resend.adapter.ts` factory — an unavoidable third-party SDK instantiation, not a
  violation of the functional-first convention.

## QA verifiability boundary

This ticket ships with **QA depth: heavy**, but Firebase live sign-in cannot be exercised safely
pre-merge (it would mint real Google/Firebase credentials against the shared project from an
ephemeral preview). The boundary, by environment:

| Environment                                                | What's exercised                                                                                                                                                                                                                             | What's `BLOCKED` (not `FAIL`)                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Preview** (`idc-redentor-admin`'s per-PR Vercel preview) | UI render of `/login`, `/reset-password`, `/no-access` in both locales; **proxy redirect** (unauthenticated `(app)` request → `/login?callbackUrl=…`); `POST /api/auth/session` with a missing/garbage body → `400`/`401`, no cookie set.    | Any real Firebase sign-in (Google or email/password) — env-limited, per the ICR-44/ICR-136 pattern. |
| **Staging** (post-merge, `ministry-admin-staging`)         | The **live email/password happy path**: a seeded pending `Invite` + a real Firebase test user sign in, a cookie is minted, `AdminUser` is created, the invite flips to `accepted`; sign-out revokes; a non-invited account gets `no-invite`. | — (this is the environment where the real flow is proven end to end)                                |
| **Manual only**                                            | Google OAuth sign-in (popup + redirect fallback) — not automatable against a real Google account from CI/QA tooling.                                                                                                                         | —                                                                                                   |

`.claude/config.json`'s `qa.env.{preview,staging}.productionHostDeny` hard-denies both this app's
production hosts (`idc-redentor-admin.vercel.app`, `ministerio.idcredentor.org`) in every QA
environment — see the next section — so no QA run, pre- or post-merge, can ever accidentally target
live admin production. `idc-redentor-admin` is a **separate Vercel project** from the public site
(`idc-redentor-website`); its per-PR preview is the admin preview-QA target, resolved by the
orchestrator per PR rather than hardcoded.

## `.claude/config.json` hardening (R15)

`idc-redentor-admin.vercel.app` and `ministerio.idcredentor.org` were added to **both**
`qa.env.preview.productionHostDeny` and `qa.env.staging.productionHostDeny` (ICR-127) — the same
default-deny list that already blocked the public site's production hosts now also blocks the
admin app's, in every QA environment, regardless of which project's PR is being tested.

## Related docs

- `docs/architecture/admin-database.md` — the two-connection Mongo model (`getAdminDb()` /
  `getContentDb()`) `user.service.ts`/`invite.service.ts` read and write through.
- `docs/architecture/i18n.md` — the next-intl setup `preferredLocale` plugs into.
- `docs/architecture/forms-and-email.md` — `apps/web`'s mailing adapter, the source this app's
  `service/mailing/*` was copied from.
- `docs/product/scope-and-boundaries.md` § "Two products in this repo" — why `apps/admin` is
  authenticated and `apps/web` deliberately is not.
