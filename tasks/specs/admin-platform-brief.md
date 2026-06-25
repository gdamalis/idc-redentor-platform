# IDC Redentor — Admin / Ministry Platform — Product Brief

> **Status:** DRAFT v0.2 — brainstorm output for [@gdamalis](https://github.com/gdamalis) + church leadership to confirm/refine. The §11 open questions are now **answered** (2026-06-23). Locked decisions are marked **[DECIDED]**.
> **Author:** PM brainstorm (`/pm`), 2026-06-23
> **Relationship to the website:** This is a **separate product** from the public IDC Redentor website. The website's `docs/product/` scope boundaries (no auth, no RBAC, no PII at scale) still govern `apps/web`. This brief governs the new `apps/admin`.

---

## 1. Vision

An internal, access-controlled **ministry/admin platform** for the IDC Redentor leadership team — a multidisciplinary tool that grows feature by feature against real ministry needs. It is private, auth-gated, and write-heavy: the inverse of the public marketing site.

### The six pillars (full vision)

1. **People / Membership** — basic data per person: name, contact (phone/email), age/date of birth, **family groups + relationships**, country of origin (for multicultural activities).
2. **Auto-generated, print-ready monthly calendar** — birthdays (from People) + planned activities, designed to be printed. Bespoke per-month designs are a later polish goal.
3. **Finances** — offerings + expenses, balance/control, and **planned/forecasted** spend over time.
4. **Worship-service planning** — monthly director, participant assignments, the rules around them, and WhatsApp distribution of the plan.
5. **Roles & granular permissions** — leadership vs. participants, with a permission catalog that grows as features land.
6. **Auth** — Google sign-in + email/password with reset, on Firebase, password/reset emails via Resend.

### Why a separate product (not website backlog)

Every pillar sits **outside** the public website's documented boundaries (`docs/product/scope-and-boundaries.md`: "no user accounts / login / authentication," "no RBAC / admin CMS-in-app," "no storing congregant personal data at scale"). The two products are near-opposites:

|               | Public website (`apps/web`)        | Admin platform (`apps/admin`)                     |
| ------------- | ---------------------------------- | ------------------------------------------------- |
| Data          | Read-only, Contentful, minimal PII | Write-heavy, relational, **PII at scale + money** |
| Access        | Fully public, no auth              | Auth-gated, RBAC, private                         |
| Optimized for | SEO, static speed                  | Internal workflows, data integrity                |

Keeping them as distinct apps (sharing brand/UI via packages) preserves the website's clean scope and isolates congregant PII + financial records in a private, access-controlled deployment.

---

## 2. Locked decisions

- **[DECIDED] Architecture:** Monorepo — Turborepo holding both apps + shared packages.
- **[DECIDED] Migration:** Convert the existing `idc-redentor-website` repo **in place** into the monorepo (preserve git history, the Vercel project, and the harness).
- **[DECIDED] First milestone:** People/Membership + the print-ready monthly calendar.
- **[DECIDED] Onboarding:** **Invite / admin-provisioned only** — no public sign-up.
- **[DECIDED] Permissions:** **Granular, per-feature permission system with an in-app management UI from day one.** The catalog of permissions starts small (People + Calendar) and grows per feature.
- **[DECIDED] Next artifact:** this brief, before code or tickets.

### Confirmed (from leadership, 2026-06-23)

- **Name:** **IDC Redentor — Ministry Admin Panel** (EN) / **IDC Redentor — Panel Ministerial** (ES). The name signals it's the church's ministry-administration platform; the display name is localized per the bilingual UI. _(Exact wording still tweakable.)_
- **Auth provider:** **Firebase Auth** (Google + email/password) on a **new, dedicated Firebase project** — already created by leadership, to be shared. Password-reset + invite emails via **Resend** with the church's sending domain (custom templates, not Firebase defaults). Reuses the `divinelab/toulmin-lab` pattern.
- **Data store:** **MongoDB — same cluster as the public website, but a separate database** (name TBD, e.g. `admin`/`ministry`). For now a **single DB user with access to both** databases; split into a DB-scoped least-privilege user later. Congregant data lives in its own DB, never comingled with the public `website` collections.
- **Admin UI language:** **bilingual (es-AR + en-US) from the start** — its own next-intl message catalog under `apps/admin`, growing keys in both locales per feature. (The public site stays bilingual independently.)
- **Tech baseline:** Next.js (App Router, RSC-first) + Tailwind v4 + pnpm, matching the workspace conventions and `toulmin-lab`.

---

## 3. The reuse advantage

The workspace already runs this exact stack — we copy a proven pattern, not invent one:

- **`divinelab/toulmin-lab`** — Next.js 16 + **Firebase Auth + MongoDB + RBAC + Sentry + pnpm**. The closest scaffold for `apps/admin`'s auth, sessions, role checks, and Mongo data layer.
- **`divinelab/cancionero`** — a multi-tenant **church** app: Turborepo with shared packages between a Next.js admin panel and an Expo app, on Firebase Auth + MongoDB. The template for the monorepo structure and shared packages.

> **Next research step (when we start M1):** scout `toulmin-lab`'s Firebase Auth + RBAC + Mongo layer and `cancionero`'s Turborepo/`packages` layout, and lift the patterns directly.

---

## 4. Target monorepo structure (in-place conversion)

```
idc-redentor-website/            # becomes the monorepo root
├── apps/
│   ├── web/                     # today's public site, moved here intact
│   └── admin/                   # new internal platform
├── packages/
│   ├── ui/                      # shared brand tokens, logo, base components
│   ├── config/                  # shared tsconfig / eslint / tailwind preset
│   └── (later) types/ or db/    # shared types / Mongo helpers if useful
├── turbo.json
├── pnpm-workspace.yaml
└── package.json                 # workspace root
```

- **Tooling:** pnpm workspaces + Turborepo (mirrors `cancionero`).
- **Deploys:** two Vercel projects from one repo, each with its own _root directory_ (`apps/web`, `apps/admin`). The existing public-site Vercel project is repointed to `apps/web` so its production deploy and domain are preserved.
- **Harness:** `.claude/` (agents, Trello board, `docs/product`, semantic-release) is currently website-scoped. It gets **broadened** to span both apps as a later step — not part of M1.

### Migration plan (phased to protect the live site)

1. **Workspace-ify (highest risk — isolate + verify first).** Add `pnpm-workspace.yaml` + `turbo.json` at root; move the current site into `apps/web` with minimal path changes. **Verify build + deploy parity for the public site before anything else.**
2. **Extract shared packages.** `packages/config` (tsconfig/eslint/tailwind preset) + `packages/ui` (brand tokens, logo, a few primitives).
3. **Scaffold `apps/admin`.** Next.js + Firebase Auth + Mongo, from the `toulmin-lab` pattern; invite-only auth shell behind a login.
4. **People CRUD + RBAC** (see §6, §7).
5. **Printable calendar** (see §8).
6. **Broaden the harness** to cover both apps (board scope, agents, docs).

> Steps 1–2 are infrastructure; steps 3–5 are the M1 product. Step 6 is follow-up. Each gets its own implementation spec.

---

## 5. Milestone 1 (MVP) — scope

**Goal:** leadership can log in, manage the people of the church, and print a monthly calendar of birthdays + activities.

**In scope (M1):**

- Auth shell: Firebase login (Google + email/password), invite-only provisioning, password reset via Resend.
- RBAC foundation: permission registry + roles + a management UI (small catalog: People + Calendar + Users/Roles).
- People/Membership CRUD: the data model in §6, with search/list + detail/edit. Records carry optional **participation-area tags** (forward-compat with M3 worship planning) and a **soft participation flag** — no membership process.
- Family groups + relationships (household grouping **and** explicit relationship edges).
- Activities list (the events that populate the calendar).
- Print-ready monthly calendar: birthdays auto-populated from People + activities for the month, with a clean print stylesheet (A4).

**Out of scope (M1 — later milestones):**

- Finances (M2). Worship-service planning (M3).
- Bespoke/generative calendar designs from a reference image (polish, post-MVP).
- WhatsApp distribution (arrives with worship-service planning / notifications).
- Bilingual admin UI (es-AR only for M1).
- Native/mobile app.

---

## 6. People data model (sketch — refined in the M1 spec)

```ts
interface Person {
  id: string;
  firstName: string;
  lastName: string;
  displayName?: string; // first-name display, disambiguated (e.g. "Sebastián M.") — church convention
  phone?: string; // role-gated visibility (PII)
  email?: string; // role-gated visibility (PII)
  dateOfBirth?: string; // ISO date; drives birthdays + derived age
  countryOfOrigin?: string; // ISO 3166 country code; multicultural activities
  familyGroupId?: string; // household this person belongs to
  participationAreas?: string[]; // worship/ministry areas served (forward-compat with M3; e.g. cantos, lecturas)
  isLeadership?: boolean; // missionary/pastoral team member (seeds Admin/Leader roles + director rotation)
  participation?: "active" | "occasional" | "inactive"; // SOFT manual filter flag — NOT a membership gate
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

interface FamilyGroup {
  id: string;
  name: string; // e.g. "Familia Pérez"
  memberIds: string[]; // people in this household
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Explicit relationship edges (source of truth for "who is related to whom")
interface Relationship {
  id: string;
  personA: string;
  personB: string;
  type: "spouse" | "parent" | "child" | "sibling" | "guardian" | "other";
  // 'parent'/'child' are directional (A is parent of B); spouse/sibling symmetric.
}
```

**Design point for the M1 spec:** do we model relationships as a household grouping (`FamilyGroup`) only, explicit edges (`Relationship`) only, or both (household for convenience + edges for richer queries)? Proposal: **both**, with `FamilyGroup` as the everyday grouping and `Relationship` edges where precise relationships matter.

**No formal membership.** The church has no membership process — participation is consistency-based and intentionally informal (someone attending consistently for ~2–3 months is simply part of the community; commitment and responsibility flow naturally, not through a sign-up). `participation` is a **soft, optional, manually-set tag** purely for filtering lists/calendar — it never gates anyone in or out, and there is no approval workflow. `displayName` follows the church's first-name-only convention (surname only when ambiguous).

**PII discipline:** age is _derived_ from `dateOfBirth`, never stored separately. Phone/email visibility is permission-gated. All writes are audited (`createdBy`/`updatedBy` + timestamps).

---

## 7. RBAC model (granular, per-feature, with UI — per the locked decision)

- **Permission registry** — feature-scoped permission keys, declared in code and extended per feature. M1 catalog (illustrative):
  `people:read`, `people:write`, `people:delete`, `calendar:read`, `calendar:manage`, `activities:write`, `users:manage`, `roles:manage`.
- **Roles** — named bundles of permissions, editable in the UI. Seed roles: **Admin** (all), **Leader** (people:read/write, calendar:manage, activities:write), **Member** (people:read, calendar:read).
- **Assignment** — each user has one or more roles; the UI manages user→role and role→permission.
- **Management UI (ships in M1):** invite users, assign roles, create/edit roles, toggle permissions.
- **Enforcement:** server-side authorization on **every** admin action (RSC loaders, route handlers, server actions) — UI gating is convenience only, never the gate. New features register their permission keys, so the catalog grows without re-architecting.

---

## 8. Printable calendar (M1)

- Monthly grid, **print-first** (A4), Spanish month/day names (es-AR).
- **Birthdays** auto-populated from `Person.dateOfBirth`.
- **Activities** overlaid from the activities list for the month.
- A clean, well-designed print stylesheet is the M1 bar. **Bespoke per-month designs generated from a reference image** (using UI/UX tooling) are a deliberate **post-MVP** polish track — we ship a great default first and iterate, rather than block MVP on generative design.

```ts
interface Activity {
  id: string;
  title: string;
  date: string; // ISO; (recurring/range handling = M1 spec decision)
  time?: string;
  type?: "service" | "conference" | "meeting" | "special" | "other";
  locationNote?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

---

## 9. Data protection (cross-cutting, non-negotiable)

This platform takes on responsibility the public site deliberately avoided: **congregant PII at scale + (later) financial records.**

- **Internal, church-purpose-only use.** Data serves church/ministry purposes only — never shared or used externally. Consent is **implicit to participation**: the church openly keeps name lists and celebrates birthdays publicly, so listing a person (name, birthday) is normal and expected, not sensitive-by-surprise. There is **no formal membership or consent-capture workflow** — the safeguard is that the tool is private, access-controlled, and never exposes data outside the church.
- Invite-only access; server-side authz on every action; least-privilege roles.
- Separate Mongo **database** (same cluster, distinct DB) — congregant data never comingled with the public `website` collections. Shared DB user for now; split to a DB-scoped least-privilege user later.
- Audit trail on People and (later) financial records.
- Permission-gated visibility of the more sensitive fields (phone/email; later finances).

---

## 10. Roadmap (post-M1)

- **M2 — Finances:** offerings + expenses, balance/control, **planned + forecasted** spend over time. (Internal accounting only — _not_ online giving/payments; that stays out of both products.)
- **M3 — Worship-service planning** (rules now in hand: `Reglas_Orden_Culto_IDCR.md`; the Google Sheet it references gets **deprecated** by this app). The model:
  - **WorshipService per Sunday:** date, monthly **director** (rotates monthly among the missionary/pastoral team and approves each order), liturgical celebration name, optional special event, and an **assignment per area**.
  - **Areas (const map):** Cantos, Santa Cena, Ofrenda, Recoger ofrenda, Oración comunitaria, Lecturas (AT · Salmo · NT · Evangelio), Reflexión/Prédica, Anuncios y oración final. _(The "Ofrenda" worship role ≠ M2 offering-amount tracking — related vocabulary, different concern.)_
  - **Per-area eligibility** from each person's `participationAreas` (seeded from the rules' per-area lists) — only rotate among people who've served that area.
  - **Assignment rules engine:** rotate by history; the preacher (Reflexión) takes no other area that Sunday (except possibly Anuncios); never the same person/role two Sundays running; "Recoger ofrenda" is exactly one person; coordinator marks absences and the engine substitutes from the same group.
  - **Lectionary:** 4 readings/Sunday (Ciclo A 2025–2026, Escuela Digital de Teología), occasionally 2 options or a 5th reading for long passages.
  - **Output:** generate the WhatsApp "Orden del Culto" message in the documented emoji format (first-name display, no `@`). **Distribution** — WhatsApp MCP tooling exists in this environment; evaluate auto-send vs. copy-paste at M3.
  - Context: congregation ~40–60; leadership team — Jonathan, Gabriel, Naibelis, Chema, Vanessa, Eric, Lauren (seed Admin/Leader users + director-rotation pool).
- **Cross-cutting later:** notifications, reporting/exports, audit-log viewer, multicultural-activity views (using `countryOfOrigin`).

---

## 11. Open questions — answered 2026-06-23

1. **Platform name** — ✅ "IDC Redentor — Ministry Admin Panel" / "Panel Ministerial" (bilingual; wording tweakable).
2. **Accounts** — ✅ New dedicated **Firebase project** created (to be shared). **Mongo:** same cluster as the website, **separate DB**, single shared DB user for now (split later).
3. **Admin UI language** — ✅ **Bilingual (es-AR + en-US) from the start.**
4. **Worship-service rules** — ✅ Provided (`Reglas_Orden_Culto_IDCR.md`), folded into §10 M3; the referenced Google Sheet will be deprecated.
5. **Calendar** — ✅ A4. Bespoke/generative designs **out of MVP** (post-M1 polish).
6. **Relationship modeling** — ✅ **Both** household grouping + explicit edges.
7. **Membership / consent** — ✅ **No formal membership** (consistency-based, intentionally informal). Consent is **implicit to participation**; data is church-purpose-only and access-controlled. Reflected in §6 (`participation` is a soft tag) and §9.

### Residual (decide during the M1 spec)

- Exact app display-name wording (ES/EN) + URL/subdomain.
- Mongo DB name (`admin` vs `ministry`) and when to split the DB-scoped user.
- `Relationship` vs `FamilyGroup` as source of truth (proposal: both — household for grouping, edges for precise relationships).
- `participationAreas` taxonomy: free tags vs. a fixed const map shared with M3's worship areas (lean: a shared const map seeded from the rules file).

---

## 12. Immediate next steps (proposed)

1. **Confirm/adjust this brief** (especially §11 open questions).
2. **Write the M1 implementation spec(s)** — split into: (a) monorepo migration (steps 1–2), and (b) admin MVP (auth + People + RBAC + calendar). Per the workspace spec format (TS interfaces, Zod schemas, file tables, checkpoints).
3. **Set up tracking** — a dedicated board/epic for the platform (separate from the website's Trello board), once scope is locked.
