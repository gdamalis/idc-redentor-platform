# ICR-127 — Admin Firebase Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: the `/work` implementer composes `superpowers:test-driven-development` + `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax. Read `tasks/specs/ICR-127-admin-firebase-auth.md` (the spec) alongside this plan — the spec carries the full design, edge cases, and rationale; this plan is the task-by-task execution order.

**Goal:** Build the admin panel's closed front door — Firebase sign-in (Google + email/password) exchanged for a native httpOnly session cookie, invite-only provisioning, `proxy.ts` + RSC route protection, Resend-branded bilingual invite/reset emails, and a per-user language preference.

**Architecture:** Native Firebase session cookies (no NextAuth). Roles + language resolved from Mongo (`ministry-admin*` via `getAdminDb()`), never the client token. Every auth outcome is a discriminated-union return value; the only `class` is `new Resend()`. The mailing adapter is copied into `apps/admin` (Resend-only).

**Tech Stack:** Next.js 16 (App Router, RSC, Node-runtime proxy), `firebase@12.16.0` (client), `firebase-admin@14.1.0` (server), `mongodb@6.21.0`, `resend`, `next-intl@4`, `zod`, Vitest.

## Global Constraints

- **Package manager:** `pnpm`. All verify commands scope with `--filter @idcr/admin` where possible; the root `pnpm type-check`/`lint`/`test` proxy through Turbo across the workspace.
- **Commit type:** `feat(ICR-127): …` (Story). Header ≤ 100 chars. Ship a `.changeset/*.md` bumping `@idcr/admin` **minor**.
- **Functional-first:** discriminated unions / `null` / `boolean` for outcomes. No new `class`; the only `class` instantiated is `new Resend()` in the copied adapter. No `Error` subclass for control flow.
- **TS conventions:** `interface` for object shapes, `??` over `||`, `satisfies` for validation, named exports, `handle*` handlers, lowercase-dash dirs. Strict mode.
- **Await Next runtime APIs:** `cookies()`, `headers()`, `props.params`, `props.searchParams`.
- **Secrets:** names only, never values, in any file/commit/PR. `.env*` gitignored.
- **Roles never from token:** no `customClaims`/`decoded.role`/`token.role` authorization read path anywhere in `apps/admin`.
- **Session cookie:** name `__session`; `httpOnly:true, secure:true, sameSite:"lax", path:"/"`; `expiresIn` = 5 days (`5*24*60*60*1000` ms); `maxAge` = 432000 s.
- **auth_time recency:** reject session issuance when `Date.now()/1000 - decoded.auth_time > 300`.
- **i18n:** default `es-AR`, secondary `en-US`; every user-facing string in **both** `apps/admin/messages/{es-AR,en-US}.json`; es-AR voseo with correct accents.
- **Env:** no new vars (all declared in `apps/admin/.env.example` + `environment.d.ts`). Firebase config read lazily — build must succeed with no env set.
- **Verify each checkpoint before commit-and-push:** the implementer commits **and** `git push` (the draft PR only reflects pushed commits). Copy the main checkout's `.env.local` into `apps/admin/.env.local` is already done in the worktree.

---

## File Structure (decomposition)

```
apps/admin/src/
├── lib/
│   ├── firebase/admin.ts            (+ getAdminAuth)
│   └── auth/
│       ├── email.ts                 normalizeEmail                    [CP1]
│       ├── session.ts               cookie opts, createSession, verifySession, SESSION_* [CP2]
│       ├── provision.ts             resolveOrProvision (the invite gate)                  [CP2]
│       └── current-user.ts          getCurrentUser                                         [CP2]
├── service/
│   ├── types.ts                     AdminUser, Invite, SessionResult (+ Zod)              [CP1]
│   ├── user.service.ts              find/create/updatePreferredLocale/ensureAuthIndexes   [CP1]
│   ├── invite.service.ts            findPendingInvite/acceptInvite                        [CP1]
│   └── mailing/{types,resend.adapter,mailing.service}.ts   copied Resend adapter          [CP1]
├── templates/{invite,password-reset}.template.ts   bilingual HTML builders                [CP5]
├── app/
│   ├── api/auth/session/route.ts    POST + DELETE                                          [CP2]
│   └── [locale]/
│       ├── (auth)/login/{page.tsx,login-form.tsx}                                          [CP4]
│       ├── (auth)/reset-password/{page.tsx,reset-form.tsx,actions.ts}                       [CP5]
│       ├── no-access/page.tsx                                                               [CP4]
│       └── (app)/layout.tsx         getCurrentUser gate                                      [CP3]
├── components/shell/
│   ├── locale-actions.ts            setPreferredLocale ("use server")                       [CP6]
│   └── locale-switcher.tsx          + persist                                               [CP6]
└── proxy.ts                         async session gate                                      [CP3]
docs/architecture/admin-auth.md                                                              [CP7]
.claude/config.json                 productionHostDeny hardening                             [CP7]
```

---

### Task 1 (CP1): Data layer + services + mailing adapter + Firebase auth handle

**Files:**

- Create: `apps/admin/src/service/types.ts`, `apps/admin/src/lib/auth/email.ts`, `apps/admin/src/service/user.service.ts`, `apps/admin/src/service/invite.service.ts`, `apps/admin/src/service/mailing/types.ts`, `apps/admin/src/service/mailing/resend.adapter.ts`, `apps/admin/src/service/mailing/mailing.service.ts`
- Modify: `apps/admin/src/lib/firebase/admin.ts` (add `getAdminAuth`), `apps/admin/package.json` (add `resend`)
- Test: `apps/admin/src/lib/auth/email.test.ts`, `apps/admin/src/service/user.service.test.ts`, `apps/admin/src/service/invite.service.test.ts`
- Changeset: `.changeset/icr-127-admin-auth.md`

**Interfaces — Produces:**

- `service/types.ts`: `AdminUser`, `Invite`, `SessionResult` (exactly as in spec §3) + `adminUserSchema`/`inviteSchema` (Zod).
- `lib/auth/email.ts`: `normalizeEmail(value?: string | null): string` (lowercase + trim; `""` when nullish).
- `service/invite.service.ts`: `findPendingInvite(email: string): Promise<Invite | null>`; `acceptInvite(id: ObjectId): Promise<void>`.
- `service/user.service.ts`: `findUserByFirebaseUid(uid: string): Promise<AdminUser | null>`; `createUserFromInvite(p: { firebaseUid: string; email: string; roleIds: string[]; preferredLocale: Locale }): Promise<AdminUser>`; `updatePreferredLocale(firebaseUid: string, locale: Locale): Promise<boolean>`; `ensureAuthIndexes(): Promise<void>`.
- `service/mailing/mailing.service.ts`: `sendEmail(content: EmailContent): Promise<boolean>`; re-exports `EmailContent`.
- `lib/firebase/admin.ts`: `getAdminAuth(): Auth` (from `firebase-admin/auth`).

**Consumes:** `getAdminDb()` from `@src/service/database.service`; `Locale`/`i18n` from `@src/i18n/config`; `getFirebaseAdminApp()` from `@src/lib/firebase/admin`.

- [ ] **Step 1 — add the `resend` dependency.** Edit `apps/admin/package.json` to add `"resend": "^6.4.1"` under `dependencies` (match apps/web). Run `pnpm install` at repo root. Expected: lockfile updates, install succeeds.

- [ ] **Step 2 — write `lib/auth/email.ts` test (RED).**

```ts
// apps/admin/src/lib/auth/email.test.ts
import { describe, it, expect } from "vitest";
import { normalizeEmail } from "./email";
describe("normalizeEmail", () => {
  it("lowercases and trims", () =>
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com"));
  it("returns empty string for nullish", () => {
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });
});
```

Run: `pnpm --filter @idcr/admin test src/lib/auth/email.test.ts` → FAIL (module not found).

- [ ] **Step 3 — implement `lib/auth/email.ts` (GREEN).**

```ts
export function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}
```

Run the test → PASS.

- [ ] **Step 4 — write `service/types.ts`** exactly per spec §3 (`AdminUser`, `Invite`, `SessionResult`, `Locale` import from `@src/i18n/config`) plus Zod schemas `inviteSchema`/`adminUserSchema` mirroring the interfaces (`z.object({...})`, `status: z.enum([...])`, `locale`/`preferredLocale`: `z.enum(i18n.locales)`). Type-check only (no test): `pnpm --filter @idcr/admin type-check`.

- [ ] **Step 5 — write `invite.service.ts` + `user.service.ts` tests (RED).** Mock the DB accessor:

```ts
// apps/admin/src/service/user.service.test.ts (pattern; repeat shape for invite.service.test.ts)
import { describe, it, expect, vi, beforeEach } from "vitest";
const findOne = vi.fn();
const insertOne = vi.fn();
const updateOne = vi.fn();
const createIndex = vi.fn();
vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({
    collection: () => ({ findOne, insertOne, updateOne, createIndex }),
  }),
}));
beforeEach(() => vi.clearAllMocks());
it("findUserByFirebaseUid returns the parsed user or null", async () => {
  const { findUserByFirebaseUid } = await import("./user.service");
  findOne.mockResolvedValueOnce(null);
  expect(await findUserByFirebaseUid("uid1")).toBeNull();
});
it("createUserFromInvite writes an active user seeded with roleIds + preferredLocale", async () => {
  const { createUserFromInvite } = await import("./user.service");
  insertOne.mockResolvedValueOnce({ insertedId: "x" });
  const user = await createUserFromInvite({
    firebaseUid: "uid1",
    email: "a@b.com",
    roleIds: ["r1"],
    preferredLocale: "en-US",
  });
  expect(insertOne).toHaveBeenCalledWith(
    expect.objectContaining({
      firebaseUid: "uid1",
      roleIds: ["r1"],
      preferredLocale: "en-US",
      status: "active",
    }),
  );
  expect(user.preferredLocale).toBe("en-US");
});
it("updatePreferredLocale returns true when a doc is modified", async () => {
  const { updatePreferredLocale } = await import("./user.service");
  updateOne.mockResolvedValueOnce({ matchedCount: 1 });
  expect(await updatePreferredLocale("uid1", "es-AR")).toBe(true);
});
```

For `invite.service.test.ts`: assert `findPendingInvite` queries `{ email: <normalized>, status: "pending", expiresAt: { $gt: <Date> } }` and returns `null` on no match; `acceptInvite` calls `updateOne({ _id }, { $set: { status: "accepted", acceptedAt: <Date> } })`.
Run both → FAIL.

- [ ] **Step 6 — implement `invite.service.ts` + `user.service.ts` (GREEN).** Use `getAdminDb().collection("invites"|"users")`. `ensureAuthIndexes()` = a module-level memoized promise calling `createIndex({ firebaseUid: 1 }, { unique: true })`, `createIndex({ email: 1 }, { unique: true })` on `users` and `createIndex({ email: 1, status: 1 })`, `createIndex({ expiresAt: 1 })` on `invites`; call it at the top of each write/read entrypoint. `createUserFromInvite` builds the `AdminUser` (`createdAt`/`updatedAt` = `new Date()`), `insertOne`, returns it; wrap in try/catch for E11000 → re-read via `findUserByFirebaseUid` and return that (idempotency). Parse reads through the Zod schema. Run tests → PASS.

- [ ] **Step 7 — copy the mailing adapter.** Create `service/mailing/types.ts` and `service/mailing/resend.adapter.ts` **verbatim** from `apps/web/src/service/mailing/{types,resend.adapter}.ts`. Create a slim `service/mailing/mailing.service.ts` (Resend-only, no MAIL_PROVIDER switch):

```ts
import type { EmailContent } from "./types";
import { createResendAdapter } from "./resend.adapter";
export const DEFAULT_FROM_EMAIL =
  process.env.FROM_EMAIL ?? "no-reply@notifications.idcredentor.org";
let adapter: ReturnType<typeof createResendAdapter> | null = null;
export async function sendEmail(content: EmailContent): Promise<boolean> {
  adapter ??= createResendAdapter();
  return adapter.sendEmail({
    ...content,
    from: content.from ?? DEFAULT_FROM_EMAIL,
  });
}
export type { EmailContent } from "./types";
```

Type-check.

- [ ] **Step 8 — add `getAdminAuth` to `lib/firebase/admin.ts`.**

```ts
import { getAuth } from "firebase-admin/auth";
import type { Auth } from "firebase-admin/auth";
export function getAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}
```

Type-check.

- [ ] **Step 9 — changeset.** Create `.changeset/icr-127-admin-auth.md`:

```md
---
"@idcr/admin": minor
---

Admin auth: Firebase (Google + email/password) sign-in, native session cookie, invite-only provisioning, Resend-branded bilingual invite/reset emails, and a per-user language preference.
```

- [ ] **Step 10 — verify + commit + push.** Run `pnpm --filter @idcr/admin type-check lint test`. All green. Then:

```bash
git add apps/admin/src apps/admin/package.json pnpm-lock.yaml .changeset/icr-127-admin-auth.md
git commit -m "feat(ICR-127): admin auth data layer, invite/user services, mailing adapter"
git push
```

_(The orchestrator opens the draft PR after this task's verify — plan step 11.)_

---

### Task 2 (CP2): Session route + session/provision/current-user libs

**Files:**

- Create: `apps/admin/src/lib/auth/session.ts`, `apps/admin/src/lib/auth/provision.ts`, `apps/admin/src/lib/auth/current-user.ts`, `apps/admin/src/app/api/auth/session/route.ts`
- Test: `apps/admin/src/lib/auth/{session,provision,current-user}.test.ts`, `apps/admin/src/app/api/auth/session/route.test.ts`

**Interfaces — Produces:**

- `session.ts`: `SESSION_COOKIE_NAME = "__session"`; `SESSION_EXPIRES_IN_MS = 5*24*60*60*1000`; `buildSessionCookieOptions(): { httpOnly: true; secure: true; sameSite: "lax"; path: "/"; maxAge: number }`; `createSession(idToken: string): Promise<string>` (→ session cookie value via `getAdminAuth().createSessionCookie`); `verifySession(cookie: string, checkRevoked: boolean): Promise<DecodedIdToken | null>` (null on failure).
- `provision.ts`: `resolveOrProvision(decoded: DecodedIdToken): Promise<SessionResult>`.
- `current-user.ts`: `getCurrentUser(): Promise<SessionResult>`.

**Consumes:** Task 1 (`normalizeEmail`, `findUserByFirebaseUid`, `createUserFromInvite`, `findPendingInvite`, `acceptInvite`, `getAdminAuth`, types).

- [ ] **Step 1 — `session.test.ts` (RED).** Assert `buildSessionCookieOptions()` returns exactly `{ httpOnly:true, secure:true, sameSite:"lax", path:"/", maxAge:432000 }`; `SESSION_EXPIRES_IN_MS === 432000000` and is within `[300000, 1209600000]`. Run → FAIL.

- [ ] **Step 2 — implement `session.ts` (GREEN).** Constants + `buildSessionCookieOptions()` returning the literal object `satisfies` the cookie-options shape; `createSession` = `getAdminAuth().createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN_MS })`; `verifySession` wraps `getAdminAuth().verifySessionCookie(cookie, checkRevoked)` in try/catch → `null` on throw. Run → PASS.

- [ ] **Step 3 — `provision.test.ts` (RED).** Mock `@src/service/user.service` + `@src/service/invite.service`. Cover every spec §7 branch:

```ts
// returning active user → { ok:true }; disabled → { ok:false, reason:"disabled" }
// first sign-in + matching invite → creates user (roleIds + invite.locale) + accepts invite → { ok:true }
// no invite → { ok:false, reason:"no-invite" } and createUserFromInvite NOT called
// expired/revoked invite (findPendingInvite returns null) → no-invite
// email mismatch (findPendingInvite null) → no-invite
// missing decoded.email → no-invite, no DB lookups
// invite with no locale → user seeded preferredLocale = "es-AR"
```

Run → FAIL.

- [ ] **Step 4 — implement `provision.ts` (GREEN)** exactly per spec §2 R5: normalize email → if empty `no-invite`; `findUserByFirebaseUid` → active `ok`, disabled `disabled`; else `findPendingInvite` → null `no-invite`, match → `createUserFromInvite({ ..., preferredLocale: invite.locale ?? i18n.defaultLocale })` + `acceptInvite` → `ok`. Run → PASS.

- [ ] **Step 5 — `current-user.test.ts` (RED).** Mock `next/headers` `cookies()`, `verifySession`, `findUserByFirebaseUid`. Cover: no cookie → `no-session`; verify returns null → `expired`; user missing → `no-user`; disabled → `disabled`; ok → `{ ok:true, user }`; assert **no** token-role access. Run → FAIL.

- [ ] **Step 6 — implement `current-user.ts` (GREEN).** `const store = await cookies(); const cookie = store.get(SESSION_COOKIE_NAME)?.value;` → no cookie `no-session`; `const decoded = await verifySession(cookie, true)` → null `expired` (revocation surfaces as a verify failure here → treat as `expired`; keep the `revoked` reason available for the sign-out test path); `findUserByFirebaseUid(decoded.uid)` → null `no-user`, disabled `disabled`, active `{ ok:true, user }`. Run → PASS.

- [ ] **Step 7 — `route.test.ts` (RED).** Mock `verifyIdToken`, `createSession`, `resolveOrProvision`. POST: valid + recent + provision ok → 200 body `{ ok:true, preferredLocale }` + `Set-Cookie` contains `__session=`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age=432000`; `auth_time` 6 min old → 401 `stale-token`, **no** Set-Cookie; provision `no-invite` → 403, **no** Set-Cookie; invalid token (verify throws) → 401 `invalid-token`; malformed body → 400. DELETE: valid cookie → `revokeRefreshTokens(uid)` called + Set-Cookie `Max-Age=0`; no cookie → 200 idempotent. Run → FAIL.

- [ ] **Step 8 — implement `route.ts` (GREEN).** `POST`: Zod-parse `{ idToken }` (400 on fail); `decoded = await getAdminAuth().verifyIdToken(idToken, true)` in try/catch (401 `invalid-token`); recency `if (Date.now()/1000 - decoded.auth_time > 300) return 401 stale-token`; `const result = await resolveOrProvision(decoded)`; if `!result.ok && reason==="no-invite"` → 403 (no cookie); if `!result.ok` (disabled) → 403 `disabled`; else `const cookie = await createSession(idToken)`; build `NextResponse.json({ ok:true, preferredLocale: result.user.preferredLocale })` and `response.cookies.set(SESSION_COOKIE_NAME, cookie, buildSessionCookieOptions())`. `DELETE`: read cookie; if present, `verifySession(cookie,false)` → on success `await getAdminAuth().revokeRefreshTokens(decoded.uid)` (best-effort try/catch); always `response.cookies.set(SESSION_COOKIE_NAME, "", { ...buildSessionCookieOptions(), maxAge: 0 })`; 200. Run → PASS.

- [ ] **Step 9 — verify + commit + push.** `pnpm --filter @idcr/admin type-check lint test` green.

```bash
git add apps/admin/src/lib/auth apps/admin/src/app/api
git commit -m "feat(ICR-127): native Firebase session cookie route + invite-gated provisioning"
git push
```

---

### Task 3 (CP3): Proxy protection + (app) RSC gate

**Files:**

- Modify: `apps/admin/src/proxy.ts`, `apps/admin/src/app/[locale]/(app)/layout.tsx`
- Test: `apps/admin/src/proxy.test.ts` (extend)

**Interfaces — Consumes:** `verifySession`/`SESSION_COOKIE_NAME` (Task 2), `getCurrentUser` (Task 2), `routing`/`i18n` (i18n).

- [ ] **Step 1 — extend `proxy.test.ts` (RED).** Mock `verifySession`. Assert: unauthenticated GET `/es-AR/people` → 307/308 redirect to `/es-AR/login?callbackUrl=%2Fes-AR%2Fpeople`; `/es-AR/login`, `/en-US/reset-password`, `/es-AR/no-access` bypass the session check (reach `intlMiddleware`); valid cookie on `/es-AR/people` → continues; OPTIONS + `.png` bypass preserved. Run → FAIL.

- [ ] **Step 2 — implement async `proxy.ts` (GREEN).** Make `proxy` `async`. Keep the OPTIONS + safe-extension bypass. Compute `pathname`; strip the leading `/{locale}` to get the app-relative path; define `PUBLIC_AUTH_PATHS = ["/login","/reset-password","/no-access"]`. If the stripped path starts with a public path → `return intlMiddleware(request)`. Else read `request.cookies.get(SESSION_COOKIE_NAME)?.value`; `const decoded = value ? await verifySession(value, false) : null`; if `!decoded` → `const url = request.nextUrl.clone(); url.pathname = \`/${locale}/login\`; url.searchParams.set("callbackUrl", pathname + request.nextUrl.search); return NextResponse.redirect(url)`; else `return intlMiddleware(request)`. Preserve `config.matcher`. Run → PASS.

- [ ] **Step 3 — implement `(app)/layout.tsx` gate.** Make it an async RSC:

```tsx
import { getCurrentUser } from "@src/lib/auth/current-user";
import { redirect } from "@src/i18n/routing";
export default async function AppLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const result = await getCurrentUser();
  if (!result.ok) {
    if (result.reason === "no-user" || result.reason === "disabled")
      redirect({ href: "/no-access", locale });
    redirect({ href: "/login", locale });
  }
  return <AppShell>{children}</AppShell>;
}
```

Type-check + lint.

- [ ] **Step 4 — verify + commit + push.** `pnpm --filter @idcr/admin type-check lint test` green.

```bash
git add apps/admin/src/proxy.ts apps/admin/src/proxy.test.ts "apps/admin/src/app/[locale]/(app)/layout.tsx"
git commit -m "feat(ICR-127): proxy + RSC gate protecting admin (app) routes"
git push
```

---

### Task 4 (CP4): Login + client sign-in + no-access + i18n

**Files:**

- Create: `apps/admin/src/app/[locale]/(auth)/login/login-form.tsx`
- Modify: `apps/admin/src/app/[locale]/(auth)/login/page.tsx`, `apps/admin/src/app/[locale]/no-access/page.tsx`, `apps/admin/messages/es-AR.json`, `apps/admin/messages/en-US.json`
- Test: `apps/admin/src/app/[locale]/(auth)/login/login-form.test.tsx` (jsdom)

**Interfaces — Consumes:** `getFirebaseAuth` (client), `POST /api/auth/session`, the returned `preferredLocale`.

- [ ] **Step 1 — add i18n keys (both files, parity).** Add the `auth.login.*` (incl. `errors.*`) and `auth.noAccess.*` groups from spec §8 to **both** `messages/es-AR.json` and `messages/en-US.json`. Remove the superseded `pages.login`/`pages.noAccess`. es-AR voseo ("Ingresá", "Iniciá sesión") with accents. Run `pnpm --filter @idcr/admin test src/i18n/messages.test.ts` → PASS (parity holds).

- [ ] **Step 2 — `login-form.test.tsx` (RED).** Render `<LoginForm callbackUrl="/es-AR" />` with mocked `getFirebaseAuth`, `signInWithEmailAndPassword`, `fetch`. Assert: submitting email/pw calls `signInWithEmailAndPassword` then `POST /api/auth/session` with the id token; a 403 `no-invite` response triggers `deleteUser` + `signOut` + push `/no-access`; a `signInWithEmailAndPassword` reject with `code:"auth/wrong-password"` shows the localized `auth.login.errors.wrongPassword`. Run → FAIL.

- [ ] **Step 3 — implement `login-form.tsx` (`'use client'`) (GREEN).** Controlled email/pw inputs + a Google button. `handleEmailPassword`: `signInWithEmailAndPassword` → `postSession(user)`; catch → `mapFirebaseError(code)` → localized message. `handleGoogle`: `signInWithPopup(auth, new GoogleAuthProvider())`; catch `auth/popup-blocked`|`auth/popup-closed-by-user` → `signInWithRedirect`; `useEffect` runs `getRedirectResult` on mount → `postSession`. `postSession(user)`: `const idToken = await user.getIdToken(); const res = await fetch("/api/auth/session", { method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify({ idToken }) });` → `res.ok` ⇒ `router.push(withLocale(callbackUrl, (await res.json()).preferredLocale))`; `res.status===403` ⇒ `await cleanupOrphanFirebaseAccount(auth)` + `await signOut(auth)` + `router.push("/no-access")`; else localized error. `cleanupOrphanFirebaseAccount` = best-effort `if (auth.currentUser) await deleteUser(auth.currentUser)` in try/catch. `withLocale(path, locale)` rewrites the leading `/{loc}` segment; validate `callbackUrl` is local (`/^\/(?!\/)/`) else `/`. Run → PASS.

- [ ] **Step 4 — `login/page.tsx` (RSC shell).** Read `searchParams` for `callbackUrl`; render `<LoginForm callbackUrl={...} />` centered (`min-h-screen items-center`). Type-check.

- [ ] **Step 5 — `no-access/page.tsx`.** Localized `auth.noAccess.{title,description}` + a back-to-login link (`<Link href="/login">`) + a sign-out button (client sub-component calling `DELETE /api/auth/session` then push `/login`). Type-check.

- [ ] **Step 6 — verify + commit + push.** `pnpm --filter @idcr/admin type-check lint test build` green (build proves the client bundle compiles with lazy Firebase).

```bash
git add "apps/admin/src/app/[locale]/(auth)/login" "apps/admin/src/app/[locale]/no-access" apps/admin/messages
git commit -m "feat(ICR-127): admin login (Google + email/password) + no-access + auth gate"
git push
```

---

### Task 5 (CP5): Reset flow + email templates + i18n + parity test

**Files:**

- Create: `apps/admin/src/app/[locale]/(auth)/reset-password/reset-form.tsx`, `apps/admin/src/app/[locale]/(auth)/reset-password/actions.ts`, `apps/admin/src/templates/invite.template.ts`, `apps/admin/src/templates/password-reset.template.ts`
- Modify: `apps/admin/src/app/[locale]/(auth)/reset-password/page.tsx`, `apps/admin/messages/{es-AR,en-US}.json`, `apps/admin/src/i18n/messages.test.ts`
- Test: `apps/admin/src/templates/invite.template.test.ts`, `apps/admin/src/templates/password-reset.template.test.ts`, `apps/admin/src/app/[locale]/(auth)/reset-password/actions.test.ts`

**Interfaces — Produces:** `sendInviteEmail({ to, inviteUrl, locale }): Promise<boolean>`, `sendPasswordResetEmail({ to, resetUrl, locale }): Promise<boolean>` (in the template modules or a `service/auth-email.ts` — keep builders pure, send in the service); `requestPasswordReset(email: string, locale: Locale): Promise<{ ok: true }>`.
**Consumes:** `sendEmail` (Task 1), `getAdminAuth().generatePasswordResetLink` (Task 1), `getTranslations` (next-intl/server).

- [ ] **Step 1 — add `auth.resetPassword.*` + `auth.email.invite.*` + `auth.email.reset.*` keys to both message files (parity).** Remove superseded `pages.resetPassword`. Extend `i18n/messages.test.ts` to assert the new `auth.*` subtrees exist in both. Run messages test → PASS.

- [ ] **Step 2 — template tests (RED).** For each template, call the builder with `("es-AR")` and `("en-US")` and assert `subject`/`html`/`text` contain the localized heading + the passed URL, for **both** locales. Run → FAIL.

- [ ] **Step 3 — implement templates (GREEN).** `invite.template.ts`: `export async function buildInviteEmail({ inviteUrl, locale }): Promise<{ subject; html; text }>` using `const t = await getTranslations({ locale, namespace: "auth.email.invite" })`; assemble a simple branded HTML string (heading, body, CTA `<a href={inviteUrl}>`, expiry note, footer) + a plaintext fallback. Same shape for `password-reset.template.ts` (namespace `auth.email.reset`, `resetUrl`). Run → PASS.

- [ ] **Step 4 — send functions + `actions.ts` test (RED).** Put `sendInviteEmail`/`sendPasswordResetEmail` in `service/auth-email.ts` (build template → `sendEmail({ to, subject, html, text })`). `actions.test.ts`: mock `getAdminAuth().generatePasswordResetLink` + `sendPasswordResetEmail`; assert `requestPasswordReset` returns `{ ok:true }` on success **and** when `generatePasswordResetLink` throws `auth/user-not-found` (enumeration-safe: still `{ ok:true }`, no throw), and does not send in the not-found case. Run → FAIL.

- [ ] **Step 5 — implement `actions.ts` (GREEN).** `"use server"`; Zod-validate email; `try { const link = await getAdminAuth().generatePasswordResetLink(email, { url: \`${process.env.NEXT_PUBLIC_ADMIN_BASE_URL}/${locale}/login\` }); await sendPasswordResetEmail({ to: email, resetUrl: link, locale }); } catch (e) { console.error("[reset] ", e); }`→ always`return { ok: true }`. Run → PASS.

- [ ] **Step 6 — `reset-form.tsx` + `reset-password/page.tsx`.** Client form (email input) calling `requestPasswordReset` via `useActionState`; always shows `auth.resetPassword.successGeneric`. Page = RSC shell centering the form. Type-check.

- [ ] **Step 7 — verify + commit + push.** `pnpm --filter @idcr/admin type-check lint test build` green.

```bash
git add "apps/admin/src/app/[locale]/(auth)/reset-password" apps/admin/src/templates apps/admin/src/service/auth-email.ts apps/admin/messages apps/admin/src/i18n/messages.test.ts
git commit -m "feat(ICR-127): Resend-branded bilingual invite + password-reset emails"
git push
```

---

### Task 6 (CP6): Per-user language preference UI

**Files:**

- Create: `apps/admin/src/components/shell/locale-actions.ts`
- Modify: `apps/admin/src/components/shell/locale-switcher.tsx`
- Test: `apps/admin/src/components/shell/locale-actions.test.ts`

**Interfaces — Produces:** `setPreferredLocale(locale: Locale): Promise<{ ok: boolean }>` (`"use server"`).
**Consumes:** `getCurrentUser` (Task 2), `updatePreferredLocale` (Task 1), `i18n`/`isValidLocale` (i18n).

- [ ] **Step 1 — `locale-actions.test.ts` (RED).** Mock `getCurrentUser` + `updatePreferredLocale`. Assert: valid session + valid locale → calls `updatePreferredLocale(uid, locale)` → `{ ok:true }`; `getCurrentUser` `!ok` → `{ ok:false }`, `updatePreferredLocale` **not** called; invalid locale (`"fr"`) → `{ ok:false }`, not called. Run → FAIL.

- [ ] **Step 2 — implement `locale-actions.ts` (GREEN).**

```ts
"use server";
import { getCurrentUser } from "@src/lib/auth/current-user";
import { updatePreferredLocale } from "@src/service/user.service";
import { isValidLocale, type Locale } from "@src/i18n/config";
export async function setPreferredLocale(
  locale: Locale,
): Promise<{ ok: boolean }> {
  if (!isValidLocale(locale)) return { ok: false };
  const result = await getCurrentUser();
  if (!result.ok) return { ok: false };
  const ok = await updatePreferredLocale(result.user.firebaseUid, locale);
  return { ok };
}
```

Run → PASS.

- [ ] **Step 3 — persist in `locale-switcher.tsx`.** In `handleSelectLocale`, keep `router.replace(pathname, { locale: nextLocale })` and additionally fire-and-forget `void setPreferredLocale(nextLocale)` (non-blocking; ignore the result — the visual switch already applied). Import the server action. Type-check + lint.

- [ ] **Step 4 — verify + commit + push.** `pnpm --filter @idcr/admin type-check lint test build` green.

```bash
git add apps/admin/src/components/shell
git commit -m "feat(ICR-127): persist per-user admin language preference via the locale switcher"
git push
```

---

### Task 7 (CP7): QA host-deny hardening + docs + env comment

**Files:**

- Modify: `.claude/config.json`, `CLAUDE.md`, `apps/admin/.env.example`
- Create: `docs/architecture/admin-auth.md`

- [ ] **Step 1 — harden `productionHostDeny`.** In `.claude/config.json`, add `"idc-redentor-admin.vercel.app"` and `"ministerio.idcredentor.org"` to `qa.env.preview.productionHostDeny` **and** `qa.env.staging.productionHostDeny`. Update the adjacent `baseUrlHostAllowNote`/`requirePreviewEnvironmentNote` prose to mention the admin project. **Re-validate** against the canon schema: invoke the `divinelab:canon` skill (or its validate step) — must pass.

- [ ] **Step 2 — write `docs/architecture/admin-auth.md`.** Cover: the native session-cookie flow (POST/DELETE, auth_time recency, cookie attrs, 5-day expiry); `getCurrentUser` (checkRevoked:true) vs proxy (checkRevoked:false) and why the RSC layout is the authoritative gate; the invite gate + orphan-Firebase cleanup; roles-from-Mongo-never-token; the per-user `preferredLocale` (invite-seeded, login-applied, switcher-persisted); the deliberate divergences from `toulmin-lab` (native cookie not NextAuth, roles from Mongo not custom claims, return values not thrown Errors); the QA verifiability boundary (preview = UI/proxy/API-rejection; staging = live email/pw happy-path; Google OAuth = manual). Follow the `divinelab:scribe` doc standard.

- [ ] **Step 3 — index + env comment.** Add an `admin-auth.md` bullet to the `CLAUDE.md` `docs/architecture/` index. Add a short comment block to `apps/admin/.env.example` noting which vars the auth flows consume (no new vars).

- [ ] **Step 4 — verify + commit + push.** `pnpm --filter @idcr/admin type-check lint test` green (config/docs inert to the build).

```bash
git add .claude/config.json docs/architecture/admin-auth.md CLAUDE.md apps/admin/.env.example
git commit -m "feat(ICR-127): harden QA host-deny for admin preview + admin-auth docs"
git push
```

---

## Self-Review

**Spec coverage:** R1 (getAdminAuth)→T1; R2/R3 (session route)→T2; R4 (cookie shape)→T2; R5 (provision)→T2; R6 (getCurrentUser)→T2; R7 (proxy)→T3; R8 ((app) gate)→T3; R9 (login/sign-in)→T4; R10 (reset)→T5; R11 (emails)→T5; R12 (indexes)→T1; R13 (i18n)→T4/T5; R14 (env)→T7; R15 (host-deny)→T7; R16 (docs)→T7; R17 (functional-first)→all; R18 (per-user locale)→T1(fields/seed)+T2(return)+T4(login push)+T5(email locale)+T6(switcher). All 21 edge cases map to T2/T3/T4/T5/T6 tests. ✅

**Placeholder scan:** no TBD/TODO; each code step shows the code or the exact edit. ✅

**Type consistency:** `SessionResult` reasons (`no-session|expired|revoked|no-user|disabled|no-invite`) consistent across T2/T3; `preferredLocale`/`Locale` consistent T1→T6; `SESSION_COOKIE_NAME`/`buildSessionCookieOptions` consistent T2→T3; `sendEmail`/`EmailContent` T1→T5. ✅

**Notes for the implementer:** worktree `.env.local` is already copied (build-safe). Never `--no-verify`. Commit **and** push each task. Bind to installed `.d.ts` if any API detail is unclear (firebase-admin@14, firebase@12) — do not implement from memory.
