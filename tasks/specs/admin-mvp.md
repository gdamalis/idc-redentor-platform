# M1b — Admin Platform MVP (People + Calendar) — Implementation Spec

> **Status:** DRAFT v0.1 — for [@gdamalis](https://github.com/gdamalis) review before implementation.
> **Parent:** `tasks/specs/admin-platform-brief.md`. **Depends on:** `tasks/specs/monorepo-migration.md` (M1a) being merged — this spec builds `apps/admin` inside the established monorepo.
> **Author:** PM/eng brainstorm (`/pm` → spec), 2026-06-23
> **Sensitive areas:** **auth/roles** (Firebase Auth + RBAC), **PII at scale** (congregant People data), **email-services** (Resend invites/reset), **env-secrets** (Firebase + Mongo). All flagged for the brainstorm/security gate.

---

## 1. Goal

Ship the first usable slice of the Ministry Admin Panel: leadership signs in (invite-only), manages the people of the church (with family groups, relationships, participation tags), and prints an A4 monthly calendar of birthdays + activities. The RBAC system is granular with a management UI from day one; its permission catalog starts at the People + Calendar + Users/Roles surface and grows per feature.

### In scope (M1b)

- `apps/admin` Next.js app (App Router, RSC-first) in the monorepo, reusing the website's design tokens (Outfit/Playfair, the HSL palette, sidebar tokens) via shadcn/ui.
- **Auth:** Firebase Auth (Google + email/password), server session cookie, route protection, **invite-only** provisioning, password reset via **Resend**.
- **RBAC:** permission registry + roles + user↔role assignment + management UI + server-side enforcement.
- **People:** CRUD with `Person`, `FamilyGroup`, `Relationship`, `participationAreas`, soft `participation` flag, audit fields.
- **Activities:** lightweight CRUD (the events the calendar overlays).
- **Calendar:** A4 print-ready monthly view (birthdays auto-populated + activities).
- **i18n:** admin message catalog in es-AR + en-US from the start.

### Out of scope (M1b)

- Finances (M2), Worship-service planning (M3).
- Bespoke/generative calendar designs (post-MVP; the Claude Design prompt in `tasks/specs/admin-design-prompt.md` seeds the visual direction).
- WhatsApp distribution, notifications, reporting/exports.
- Native/mobile app.

---

## 2. Locked decisions (from the brief)

- **[DECIDED]** `apps/admin` lives in the monorepo (post-M1a).
- **[DECIDED]** Firebase Auth (Google + email/password) on a new dedicated Firebase project; reset/invite emails via Resend.
- **[DECIDED]** MongoDB, **same cluster as the website, dedicated `ministry-admin` database**; **two asymmetric Atlas users** — the website user is `readWrite` on `website` only, the admin user is `readWrite` on `ministry-admin` **and** `website` (see §3).
- **[DECIDED]** Bilingual (es-AR + en-US) admin UI from the start.
- **[DECIDED]** Invite/admin-provisioned accounts only — no public sign-up.
- **[DECIDED]** Granular, per-feature permissions with a management UI; catalog grows per feature.
- **[DECIDED]** No formal membership; `participation` is a soft tag; consent is implicit to church participation (see brief §6/§9).

---

## 3. Dependencies check

| Requirement        | Note                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1a merged         | `apps/*` workspace exists; `@idcr/config` + `@idcr/ui` available.                                                                                                                |
| Firebase project   | Created by leadership; need client config (`NEXT_PUBLIC_FIREBASE_*`) + Admin SDK service-account (`FIREBASE_*`). **Names only — never commit values.**                           |
| MongoDB            | `MONGODB_URI` (same cluster) — the DB name rides in the URI **path** (`ministry-admin`), with `authSource=admin` + `maxPoolSize` explicit; there is no separate DB-name env var. |
| Resend             | `RESEND_API_KEY` + `FROM_EMAIL` (church sending domain).                                                                                                                         |
| shadcn/ui          | Tokens already shadcn-shaped; deps `class-variance-authority`, `tailwind-merge`, `@radix-ui/*` present in the web app and liftable to `@idcr/ui`.                                |
| Reference patterns | `divinelab/toulmin-lab` (Firebase Auth + session cookie + Mongo + RBAC) — scout and lift before CP2.                                                                             |

---

## 4. Architecture

```
Browser ──(Firebase JS SDK: Google / email+password)──> Firebase Auth
   │  ID token
   ▼
apps/admin /api/auth/session  ──(Firebase Admin: createSessionCookie)──> httpOnly session cookie
   │
   ▼ (every request)
proxy.ts ── verifySessionCookie ── redirect to /login if absent/invalid
   │
   ▼
RSC loaders / Server Actions / Route handlers
   ├── getCurrentUser() → session → Mongo `users` (+ role)
   ├── requirePermission("people:write") → 403 if denied
   └── Mongo data layer (getAdminDb() → `ministry-admin` DB)
```

- **RSC-first.** Pages load data in server components; mutations are **Server Actions** (Zod-validated). Minimal `'use client'` (auth widgets, forms, theme/locale toggles, the permission matrix).
- **Session:** Firebase Admin `createSessionCookie` (httpOnly, secure, sameSite=lax), verified with `verifySessionCookie`. No client-trusted role claims — roles come from Mongo, server-side.
- **Data layer:** a cached Mongo client (mirror the website's `database.service.ts`) exposing a fail-closed `getAdminDb()` accessor — the DB name is read from the `MONGODB_URI` path (`client.db().databaseName`) and asserted against a denylist (empty/`test`/`admin`/`local`/`config`/`^website`). Never touches the public `website` DB.
- **i18n:** next-intl, default `es-AR`, secondary `en-US`; admin strings in `apps/admin/messages/{es-AR,en-US}.json` (separate from the website's `public/locales`).
- **Email:** reuse the website's Resend adapter shape (`src/service/mailing/resend.adapter.ts`) for invite + reset emails, with admin templates.

---

## 5. Data model (TS interfaces + Mongo)

Collections in the `ministry-admin` database. All timestamps ISO strings; all writes audited.

```ts
// --- Auth / RBAC ---
interface User {
  id: string; // Mongo _id (string)
  firebaseUid: string; // Firebase Auth UID (unique)
  email: string; // unique; matched against Invite on first sign-in
  displayName?: string;
  roleIds: string[]; // assigned roles (bundles of permissions)
  status: "active" | "disabled";
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface Role {
  id: string;
  name: string; // "Admin" | "Leader" | "Member" | custom
  description?: string;
  permissions: string[]; // permission keys from the registry (§6)
  isSystem?: boolean; // seed roles can't be deleted
  createdAt: string;
  updatedAt: string;
}

interface Invite {
  id: string;
  email: string; // who is invited
  roleIds: string[]; // roles granted on acceptance
  invitedBy: string; // userId
  status: "pending" | "accepted" | "revoked";
  expiresAt: string;
  createdAt: string;
}

// --- People ---
interface Person {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string; // first-name display, disambiguated ("Sebastián M.")
  phone?: string; // permission-gated (PII)
  email?: string; // permission-gated (PII)
  dateOfBirth?: string; // ISO date; birthdays + derived age
  countryOfOrigin?: string; // ISO 3166-1 alpha-2
  familyGroupId?: string;
  participationAreas?: string[]; // forward-compat with M3 worship areas
  isLeadership?: boolean;
  participation?: "active" | "occasional" | "inactive"; // SOFT tag, not a gate
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

interface FamilyGroup {
  id: string;
  name: string; // "Familia Pérez"
  memberIds: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface Relationship {
  id: string;
  personA: string;
  personB: string;
  type: "spouse" | "parent" | "child" | "sibling" | "guardian" | "other";
  // parent/child directional (A is parent of B); spouse/sibling symmetric
}

// --- Activities (calendar) ---
interface Activity {
  id: string;
  title: string;
  date: string; // ISO date
  time?: string; // "HH:mm"
  type?: "service" | "conference" | "meeting" | "special" | "other";
  locationNote?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

**Mongo indexes:** `users` unique on `firebaseUid` and `email`; `invites` index on `email` + `status`; `people` index on `lastName`, `familyGroupId`, and a partial/computed birthday-month index strategy (store `dobMonth`/`dobDay` derived fields for fast calendar queries); `relationships` index on `personA`, `personB`; `activities` index on `date`.

> **Derived birthday fields:** persist `dobMonth` (1–12) and `dobDay` (1–31) alongside `dateOfBirth` so the calendar can query "birthdays in month M" without scanning. Recompute on write.

---

## 6. RBAC — permission registry (granular, with UI)

Permission **keys** are declared in a const map (not enums) and grow per feature. M1b catalog:

```ts
export const PERMISSIONS = {
  "people:read": "View people",
  "people:write": "Create/edit people",
  "people:delete": "Delete people",
  "people:pii": "View sensitive fields (phone/email)",
  "families:read": "View families",
  "families:write": "Create/edit families",
  "activities:read": "View activities",
  "activities:write": "Create/edit activities",
  "activities:delete": "Delete activities",
  "calendar:read": "View calendar",
  "calendar:print": "Print calendar",
  "users:read": "View users",
  "users:manage": "Invite users, assign roles",
  "roles:read": "View roles",
  "roles:manage": "Create/edit roles + permissions",
} as const;
export type PermissionKey = keyof typeof PERMISSIONS;
```

- **Seed roles:** `Admin` (all keys, `isSystem`), `Leader` (people/families/activities/calendar read+write + `people:pii`, no users/roles), `Member` (`people:read`, `calendar:read`).
- **Management UI:** a **permission matrix** (roles × permission keys, checkboxes) on `/roles`; invite + role assignment on `/users`.
- **Enforcement:** `requirePermission(key)` server helper used in every Server Action, route handler, and protected RSC loader. UI hides/disables controls the user lacks — **never the gate**; the server check is. `people:pii` gates rendering of phone/email.

---

## 7. Auth flows

- **Sign-in:** Firebase JS SDK (Google popup / email+password) → ID token → `POST /api/auth/session` → Admin `createSessionCookie` → httpOnly cookie. `DELETE /api/auth/session` clears it (sign-out).
- **Route protection:** `apps/admin/src/proxy.ts` verifies the session cookie; unauthenticated → `/login`. Authenticated-but-no-`User`-record (no invite) → `/no-access`.
- **Invite-only provisioning:** Admin creates an `Invite` (email + roles) on `/users` → Resend sends a branded invite link. On first successful Firebase sign-in, the server matches `email` to a `pending` Invite, creates the `User` with the invited roles, marks the invite `accepted`. **No invite → no `User` → no access** (the safeguard for the closed door).
- **Password reset:** Firebase Admin `generatePasswordResetLink(email)` → send via **Resend** with an admin-branded template (not Firebase's default email). Ties into `email-services`.

> **Security stance:** roles are server-side (Mongo), never trusted from the client token. Session cookies are httpOnly+secure. No role/permission is enforced in the client alone.

---

## 8. Routes & i18n

```
apps/admin/src/app/
├── (auth)/
│   ├── login/                 # Google + email/password
│   └── reset-password/
├── (app)/                     # protected — AppShell layout
│   ├── page.tsx               # dashboard: this-month birthdays + quick links
│   ├── people/  people/[id]/  people/new/
│   ├── families/  families/[id]/
│   ├── activities/
│   ├── calendar/  calendar/print/   # print = A4 view
│   ├── users/                 # list + invite (users:manage)
│   ├── roles/                 # permission matrix (roles:manage)
│   └── settings/
├── no-access/
└── api/
    └── auth/session/          # POST set cookie, DELETE clear
```

- **Route groups** `(auth)` / `(app)` ARE used here (unlike the public site) to separate public auth pages from the protected shell.
- **i18n:** next-intl; `apps/admin/messages/{es-AR,en-US}.json`. Every user-facing string in **both** locales. Locale switcher in the topbar.

---

## 9. Component hierarchy (shell + key screens)

```
AppShell (protected layout)
├── Sidebar            # uses --sidebar tokens; nav items gated by permissions
├── Topbar             # user menu (sign out), LocaleSwitcher, ThemeToggle
└── <main>{children}</main>

PeopleListPage   → DataTable<Person> (search, family filter, participation filter) + "New person"
PersonDetailPage → PersonForm + FamilyGroupPicker + RelationshipEditor + ParticipationAreaTags
FamiliesPage     → FamilyGroupList → FamilyGroupDetail (members + add/remove)
ActivitiesPage   → ActivityList + ActivityForm (create/edit)
CalendarPage     → MonthGrid (birthday chips + activity chips) + MonthNav + PrintButton → /calendar/print
CalendarPrint    → A4 print sheet (es-AR month/day names; print stylesheet)
UsersPage        → UserTable + InviteDialog (email + roles)
RolesPage        → RoleList + PermissionMatrix (roles × PERMISSIONS, checkboxes)
```

Visual system: shadcn/ui components themed with the website's tokens (Playfair headings, Outfit body, blue primary, sand/gold secondary, radius 0.75rem, light+dark). Density: data-first admin (tables/forms), not marketing. See `tasks/specs/admin-design-prompt.md`.

---

## 10. Edge cases

1. **Sign-in with no invite** → authenticated in Firebase but no `User` record → `/no-access`; never auto-provision.
2. **Invite email ≠ Google account email** → match strictly on email; mismatch → no provisioning, show guidance.
3. **Expired/revoked invite** → reject acceptance; admin re-invites.
4. **Last Admin protection** → block disabling/deleting the last user holding `users:manage`/`roles:manage` (no lockout).
5. **System roles** → `isSystem` roles can't be deleted; Admin's permission set can't be emptied.
6. **PII visibility** → without `people:pii`, phone/email render as masked/hidden everywhere (list, detail, print).
7. **DOB without year** → support birthday-only (store month/day; age unknown) for people who won't share a year.
8. **Family integrity** → deleting a `Person` cleans `FamilyGroup.memberIds` + `Relationship` edges; deleting a `FamilyGroup` nulls `Person.familyGroupId`.
9. **Calendar performance** → query birthdays via `dobMonth` derived field; activities via `date` range.
10. **Bilingual gaps** → CI/lint check that every key exists in both `messages/*.json` (mirror the website's bilingual discipline).
11. **Session expiry mid-edit** → Server Action returns 401 → client redirects to `/login` preserving a return path.

---

## 11. Testing strategy

- **Unit (Vitest):** RBAC helpers (`requirePermission`, role→permission resolution), Zod schemas, birthday-month derivation, age-from-DOB, relationship symmetry.
- **Integration:** Server Actions for People/Activities/Invite against a **test DB** (`ministry-admin-test`, never the real `ministry-admin` DB — mirror the website's DB-name allowlist).
- **Auth:** session create/verify happy-path + no-invite rejection + permission-denied (403) paths.
- **E2E (Playwright, later):** login → create person → see them on the calendar → print. Authored per-checkpoint by `qa-runner` once the app is deployable to a preview.
- **Print:** manual A4 print-preview check (Chrome print emulation) for the calendar.

---

## 12. Implementation checkpoints

Each is independently verifiable, committed (Conventional Commits, scope `admin`, header ≤100), on a feature branch off `main` (post-M1a). TDD-first where logic is non-trivial (RBAC, schemas, calendar math).

**CP1 — Scaffold `apps/admin`.** Next.js App Router app; `@idcr/ui` tokens + shadcn/ui; next-intl bilingual; AppShell (Sidebar/Topbar/theme/locale); cached Mongo client → `ministry-admin` DB via a fail-closed `getAdminDb()` accessor; Firebase client+admin config (env-driven). No features yet.

- _Verify:_ `pnpm --filter @idcr/admin {type-check,lint,test,build,dev}` green; shell renders in both locales + dark mode.
- _Commit:_ `feat(admin): scaffold apps/admin shell (i18n, theme, shadcn, mongo client)`

**CP2 — Auth.** Firebase sign-in (Google + email/password); session cookie via Admin SDK; `proxy.ts` protection; invite-only provisioning; password reset via Resend.

- _Verify:_ invited user signs in → provisioned; non-invited → `/no-access`; reset email sends (Resend); protected routes redirect.
- _Commit:_ `feat(admin): firebase auth, session cookies, invite-only provisioning, resend reset`

**CP3 — RBAC.** Permission registry; seed roles; user↔role assignment; `/users` invite + `/roles` permission matrix; `requirePermission` enforced server-side.

- _Verify:_ role changes gate UI + server actions; last-admin protection; system-role guards.
- _Commit:_ `feat(admin): granular RBAC with roles + permission matrix UI`

**CP4 — People.** `Person`/`FamilyGroup`/`Relationship` + `participationAreas`; list (search/filter), detail/edit, create; Zod validation; audit fields; PII gating; derived birthday fields.

- _Verify:_ CRUD works; PII hidden without `people:pii`; family/relationship integrity on delete.
- _Commit:_ `feat(admin): people CRUD with family groups, relationships, participation tags`

**CP5 — Activities.** Activity CRUD (list + form).

- _Verify:_ activities persist and query by date range.
- _Commit:_ `feat(admin): activities CRUD for the calendar`

**CP6 — Printable A4 calendar.** Month grid with birthdays (from People) + activities; es-AR month/day names; `/calendar/print` A4 print stylesheet; month nav.

- _Verify:_ current + adjacent months render; birthdays/activities correct; A4 print preview clean.
- _Commit:_ `feat(admin): print-ready A4 monthly birthday + activities calendar`

> Sequencing: CP1→CP2→CP3 before CP4 (RBAC gates People). CP5 before CP6 (calendar overlays activities).

---

## 13. Environment variables (names only — never commit values)

| Variable                                                                 | Purpose                                                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`                                                            | Same cluster as the website; DB name rides in the URI path (`ministry-admin`), with `authSource=admin` + `maxPoolSize` explicit — no separate DB-name env var |
| `NEXT_PUBLIC_FIREBASE_API_KEY` … `_APP_ID`                               | Firebase client config                                                                                                                                        |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Admin SDK (session cookies, reset links, provisioning)                                                                                                        |
| `RESEND_API_KEY` / `FROM_EMAIL`                                          | Invite + reset emails                                                                                                                                         |
| `NEXT_PUBLIC_ADMIN_BASE_URL`                                             | Links in emails, redirects                                                                                                                                    |

> Add these to `apps/admin/.env.example` (names only) and document them in the admin app's CLAUDE.md. Secret hygiene per the website convention.

---

## 14. Open questions

1. **Seed the first Admin** — bootstrap via a one-off script (a known church email → Admin) since invite-only has a chicken-and-egg. (Proposed: a guarded `seed:admin` script.)
2. **`participationAreas` taxonomy** — free tags now vs. the fixed const map shared with M3 worship areas. (Proposed: a shared const map seeded from `Reglas_Orden_Culto_IDCR.md`, with free-tag fallback.)
3. **Country field UX** — ISO country select (localized names) — confirm the list source.
4. **Calendar week start** — Sunday vs. Monday for the church's A4 layout. (Proposed: confirm with leadership; default Monday for es-AR.)
5. **Auth domain** — restrict Google sign-in to any account matched to an invite (proposed) vs. also allow a Workspace-domain shortcut.

---

## 15. Tracking

Board **"IDCR Ministry Admin Panel"** (`6a3a9b31147d58764714d958`, https://trello.com/b/ccQoGY1R). Suggested epics for M1b: Scaffold, Auth, RBAC, People, Activities, Calendar — one card per checkpoint (CP1–CP6). Not created yet; created after this spec is approved (M1a cards go first).
