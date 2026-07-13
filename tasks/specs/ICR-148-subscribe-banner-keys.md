# ICR-148 — Use SUBSCRIBE_BANNER_KEYS in the subscribe route instead of bare literals

**Jira:** https://divinelab.atlassian.net/browse/ICR-148
**Type:** Task · **Commit type:** `refactor` (Task `alt`) · **Priority:** Low · **QA depth:** light · **QA type:** api
**Sensitive areas:** `i18n-messages` (+ paths under the `apps/web/src/app/api/**` sensitive glob)

---

## 1. Dependencies Check

Everything this ticket needs already exists on `main` (verified in the worktree at `7853ed4`):

| Dependency                          | State                                                                                                                                  | Evidence                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `SUBSCRIBE_BANNER_KEYS` const map   | Exists, well-formed (`as const satisfies Record<string, \`SubscribeBanner.${string}\`>`), exports a derived `SubscribeBannerKey` union | `src/components/shared/subscribe-banner/subscribeBannerMessageKeys.ts:9-18` |
| `CONTACT_FORM_KEYS` const map       | Exists, same shape                                                                                                                     | `src/components/features/contact-form/contactFormMessageKeys.ts`            |
| Byte-level wire pin                 | Exists — the key-map tests assert each map value **is** its exact literal string, and that both locale JSONs carry the namespace       | `subscribeBannerMessageKeys.test.ts:11-16` (map), `:20-50` (both locales)   |
| Route error-body contract tests     | Exist (added by ICR-108) — 7 body-level `toEqual({ messageKey: "…" })` assertions                                                      | `src/app/api/subscribe/route.test.ts:38,44,52,60,69,78,86`                  |
| Vitest picks up `src/i18n/**` tests | Yes — `include` globs `src/**/*.{test,spec}.{ts,tsx}`                                                                                  | `vitest.config.ts:11-16`                                                    |
| Neither key map is a client module  | Confirmed — no `"use client"` directive; both are zero-dependency leaves                                                               | `head -1` on both files                                                     |

**No new dependencies, no new packages, no config changes.**

## 2. Requirements

1. **R1 — Neutral home.** Create `src/i18n/messageKeys/` as the canonical location for next-intl
   message-key const maps. Each map is a leaf module: a const + its derived union type, no React,
   no `"use client"`, no imports. Any tier (RSC, client component, server action, route handler)
   may import it.
2. **R2 — No barrel.** Do **not** add `src/i18n/messageKeys/index.ts`. Importers reference the leaf
   file directly. Rationale: a barrel inside `src/i18n/` invites re-exporting the server-only
   `request.ts` into client bundles.
3. **R3 — Move both maps** (`git mv`, so rename detection preserves history):
   - `src/components/shared/subscribe-banner/subscribeBannerMessageKeys.ts` → `src/i18n/messageKeys/subscribeBanner.ts`
   - `src/components/features/contact-form/contactFormMessageKeys.ts` → `src/i18n/messageKeys/contactForm.ts`
     The **exported symbol names, key names, and values are unchanged.** Only the doc comment noted in
     R7 changes.
4. **R4 — Move the colocated tests** with their modules (`subscribeBanner.test.ts`,
   `contactForm.test.ts`). Assertions are **unchanged**; only each file's own relative dynamic import
   (`await import("./subscribeBannerMessageKeys")` → `"./subscribeBanner"`) and its `describe()`
   label change. The locale JSON imports use the `@public/*` alias, so the move introduces **no
   relative-depth hazard**.
5. **R5 — Repoint the 5 existing importers** (import path only, no logic change):

   | File                                                             | Line | New specifier                                            |
   | ---------------------------------------------------------------- | ---- | -------------------------------------------------------- |
   | `src/service/subscribe.ts`                                       | 1-4  | `@src/i18n/messageKeys/subscribeBanner`                  |
   | `src/components/features/contact-form/contactFormAction.ts`      | 6    | `@src/i18n/messageKeys/contactForm`                      |
   | `src/components/features/contact-form/contactFormAction.test.ts` | 3    | `@src/i18n/messageKeys/contactForm`                      |
   | `src/components/features/contact-form/types.ts`                  | 2    | `@src/i18n/messageKeys/contactForm` (keep `import type`) |
   | `src/components/features/contact-form/ContactForm.tsx`           | 21   | `@src/i18n/messageKeys/contactForm`                      |

   `SubscribeBanner.tsx` is **not** an importer — it reads `state.messageKey` and passes it to `t()`.
   Do not touch it.

6. **R6 — The ticket proper.** In `src/app/api/subscribe/route.ts`, import `SUBSCRIBE_BANNER_KEYS`
   and replace all four bare literals; in `src/app/api/subscribe/route.test.ts`, repoint the seven
   literal assertions at `SUBSCRIBE_BANNER_KEYS.*`.
7. **R7 — Stale comment.** `subscribeBanner.ts`'s doc comment for `ERROR_ALREADY_SUBSCRIBED` says the
   email is _"already on the **Mailchimp** audience"_. Mailchimp is dead (the newsletter is Resend —
   see `CLAUDE.md`). Correct it to "Resend audience". Comment text only.
8. **R8 — Docs.** `docs/architecture/forms-and-email.md` cites both old paths (L62 for
   `contactFormMessageKeys.ts`, L90 for `subscribeBannerMessageKeys.ts`). Update both.

## 3. Data Model Changes

**None.** No database, no Contentful content model, no API contract, no locale JSON. The two const
maps keep their exact shape:

```ts
// src/i18n/messageKeys/subscribeBanner.ts  (values unchanged)
export const SUBSCRIBE_BANNER_KEYS = {
  ERROR_ALREADY_SUBSCRIBED: "SubscribeBanner.error-already-subscribed",
  ERROR_UNEXPECTED: "SubscribeBanner.error-unexpected",
} as const satisfies Record<string, `SubscribeBanner.${string}`>;

export type SubscribeBannerKey =
  (typeof SUBSCRIBE_BANNER_KEYS)[keyof typeof SUBSCRIBE_BANNER_KEYS];
```

## 4. API Changes

**None — and this is the load-bearing invariant of the ticket.** `POST /api/subscribe` keeps exactly
its current wire behavior:

| Condition                                            | Status | Body (byte-identical to today)                                 |
| ---------------------------------------------------- | ------ | -------------------------------------------------------------- |
| Zod `safeParse` fails (invalid/empty/malformed body) | 400    | `{ "messageKey": "SubscribeBanner.error-unexpected" }`         |
| `addSubscriber` → `{ ok: true }`                     | 200    | `{ "success": true }`                                          |
| outcome `already-subscribed`                         | 409    | `{ "messageKey": "SubscribeBanner.error-already-subscribed" }` |
| outcome `invalid-input`                              | 400    | `{ "messageKey": "SubscribeBanner.error-unexpected" }`         |
| any other failure                                    | 500    | `{ "messageKey": "SubscribeBanner.error-unexpected" }`         |

The only change is **how the route names those strings** (const reference vs. inline literal).

## 5. New / Modified Files

### New

| File                                                    | Purpose                                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/web/src/i18n/messageKeys/subscribeBanner.ts`      | `SUBSCRIBE_BANNER_KEYS` + `SubscribeBannerKey` (moved; content unchanged except R7) |
| `apps/web/src/i18n/messageKeys/subscribeBanner.test.ts` | Moved; assertions unchanged                                                         |
| `apps/web/src/i18n/messageKeys/contactForm.ts`          | `CONTACT_FORM_KEYS` + `ContactFormKey` (moved; content unchanged)                   |
| `apps/web/src/i18n/messageKeys/contactForm.test.ts`     | Moved; assertions unchanged                                                         |

### Deleted (by the move)

`apps/web/src/components/shared/subscribe-banner/subscribeBannerMessageKeys.{ts,test.ts}` ·
`apps/web/src/components/features/contact-form/contactFormMessageKeys.{ts,test.ts}`

### Modified

| File                                                                      | Change                                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/web/src/app/api/subscribe/route.ts`                                 | **R6** — import the map; 4 literals → `SUBSCRIBE_BANNER_KEYS.*` |
| `apps/web/src/app/api/subscribe/route.test.ts`                            | **R6** — 7 literal assertions → `SUBSCRIBE_BANNER_KEYS.*`       |
| `apps/web/src/service/subscribe.ts`                                       | **R5** — import path only                                       |
| `apps/web/src/components/features/contact-form/contactFormAction.ts`      | **R5** — import path only                                       |
| `apps/web/src/components/features/contact-form/contactFormAction.test.ts` | **R5** — import path only                                       |
| `apps/web/src/components/features/contact-form/types.ts`                  | **R5** — import path only (`import type`)                       |
| `apps/web/src/components/features/contact-form/ContactForm.tsx`           | **R5** — import path only                                       |
| `docs/architecture/forms-and-email.md`                                    | **R8** — two stale path citations                               |

**Untouched on purpose:** `SubscribeBanner.tsx`, `public/locales/{es-AR,en-US}.json`,
`vitest.config.ts` (already globs `src/**`), `subscribe.service.ts`, `resendAudience.ts`.

## 6. Component Hierarchy

No UI change. The dependency graph is what moves — from a server route reaching _sideways into a
component folder_, to both tiers depending on a shared i18n leaf:

```
BEFORE                                   AFTER
──────                                   ─────
api/subscribe/route.ts                   api/subscribe/route.ts ────┐
  └── "SubscribeBanner.error-…"            (server)                 │
      (bare literal — unlinked)                                     │
                                         service/subscribe.ts ──────┤
service/subscribe.ts ──┐                   (client fetch helper)    │
  (client)             │                                            ▼
                       ▼                 contact-form/            i18n/messageKeys/
components/shared/subscribe-banner/        contactFormAction.ts ──▶  subscribeBanner.ts
  subscribeBannerMessageKeys.ts             types.ts                 contactForm.ts
                                            ContactForm.tsx          (zero-dependency leaves,
components/features/contact-form/                                     no "use client")
  contactFormMessageKeys.ts ◀── contactFormAction.ts, types.ts,
                                ContactForm.tsx
```

## 7. Edge Cases

1. **A rename that isn't a rename.** Use `git mv` so git records a rename rather than a
   delete + add; otherwise the diff reads as "new file with unexplained content" and review is
   harder.
2. **`import type` must stay `import type`.** `contact-form/types.ts:2` imports only the
   `ContactFormKey` _type_. Converting it to a value import would pull the const map into a module
   that only needs the type. Preserve the modifier.
3. **The old path must be fully dead.** No re-export shim is left behind. After the move, a grep for
   `subscribeBannerMessageKeys` / `contactFormMessageKeys` across `apps/web/src` and `docs/` must
   return **zero** hits.
4. **Prettier/ESLint import ordering** may reorder the new import lines. Format only the files this
   ticket touches — the repo carries ~174 files of pre-existing Prettier debt (identical on
   `origin/main`), so a repo-wide `format` would balloon the diff with unrelated churn (ICR-109).
5. **Green-on-first-run is not proof.** Every test here passes immediately, because the code is
   already correct — the ticket closes a _linkage_ hole, not a behavior bug. Hence the mandatory
   mutation check in §9. A suite never observed failing is a rubber stamp (ICR-108).
6. **Wire drift is the one true failure mode.** If any emitted string changes by even one byte, the
   visitor silently sees the generic fallback (`service/subscribe.ts` `KNOWN_KEYS` rejects the
   unknown key). AC-3 + the untouched key-map value assertions are the guard.
7. **Vitest silently skipping a new dir** (ICR-21) — not a risk here: `include` already globs
   `src/**`. Still, verify the moved tests actually _execute_ by name in the run output; don't
   trust a green total.

## 8. i18n

**No locale key is added, removed, renamed, or re-worded.** `public/locales/es-AR.json` and
`public/locales/en-US.json` are **not modified**. The `SubscribeBanner` and `ContactForm` namespaces
keep every key exactly as-is. This ticket only changes which _module path_ the key **constants** are
imported from — the keys themselves, and the Spanish/English copy they resolve to, are untouched.

The moved key-map tests continue to assert both locale files carry every namespace key, so a
locale-side regression still fails the build.

## 9. Testing Strategy

**Unit (existing suites, moved not rewritten):**

- `i18n/messageKeys/subscribeBanner.test.ts` — pins map value → literal wire string; pins both locales.
- `i18n/messageKeys/contactForm.test.ts` — same, for the ContactForm namespace.
- `api/subscribe/route.test.ts` — the 7 status + body assertions, now expressed via the const map.
- `contactFormAction.test.ts` — unchanged behavior coverage.

**The composed contract after this ticket:**

1. `subscribeBanner.test.ts` pins **const map → literal wire string** (+ both locales).
2. `route.test.ts` pins **route response → const map**.
3. Therefore the route response is still pinned to the literal wire string — **and** a key-map rename
   now fails at the route instead of silently desyncing. Strictly stronger than today.

**Mutation check (mandatory — this replaces the RED phase).** Corrected 2026-07-13 after the first
attempt disproved the original design; see the plan's Step 5 for the full rationale.

The naive check — "mutate a map _value_, expect `route.test.ts` to go red" — **cannot work, and its
failure is not a defect.** Once `route.ts` and `route.test.ts` both import the same const map, the
assertion reads _both_ sides from the same object, so a value mutation moves them in lockstep. Post-
refactor the route **follows** the map by construction; there is no desync left for a runtime test to
detect. The refactor turns a runtime-checkable invariant into a **structural** one, and structural
guarantees are proven by the **compiler**, not by a red test.

The three checks that do prove it:

| #   | Mutation                                                              | Expected                                                                               | What it proves                                                                                                                            |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 5a  | Rename the _property_ `ERROR_UNEXPECTED` → `ERROR_UNEXPECTED_RENAMED` | `pnpm type-check` errors **inside `route.ts`** (TS2339)                                | **The hole is closed.** Pre-fix `route.ts` held a literal and compiled clean — a literal cannot reference the map, so it could not error. |
| 5b  | Change the _value_ to `"SubscribeBanner.error-MUTATED"`               | `subscribeBanner.test.ts` **fails**; `route.test.ts` stays **green**                   | The byte-level wire pin holds. The route correctly emitted the new map value — green here is the _right_ answer.                          |
| 5c  | Make the route's 409 branch emit `ERROR_UNEXPECTED`                   | `route.test.ts` fails on the **body** `toEqual`; `expect(res.status)` still **passes** | Re-pointing the assertions did **not** weaken per-branch route coverage — ICR-108's protection is intact.                                 |

Composed: the route's wire value is still pinned to the exact literal string, **and** the desync class
of bug is now structurally impossible. Capture verbatim output for the PR body, revert every mutation,
and confirm `git status` is clean (no `.bak` strays) before committing.

**Manual smoke (preview, `qaType: api`):** `POST /api/subscribe` with an invalid body and assert the
400 response body is byte-identical to `{"messageKey":"SubscribeBanner.error-unexpected"}`. Do **not**
POST a valid email — that writes a real contact to the configured Resend audience (ICR-44).

**Playwright:** `config.playwrightProjectMap` maps `apps/web/src/app/api/subscribe` → `apiForms`.
No specs exist in Phase 1; light depth does not author new ones.

## 10. Implementation Checkpoints

### CP1 — Move both key maps to `src/i18n/messageKeys/`

**Files:** the 4 moved files (R3, R4), the 5 importers (R5), plus the R7 comment fix.
**Verification:** `pnpm type-check`, `pnpm lint`, `pnpm test` all green; the moved tests appear **by
name** in the vitest output; `grep -rn "subscribeBannerMessageKeys\|contactFormMessageKeys" apps/web/src`
returns zero hits; `git status` shows renames (`R`), not delete+add.
**Commit:** `refactor(ICR-148): move message-key maps to src/i18n/messageKeys`

### CP2 — Use `SUBSCRIBE_BANNER_KEYS` in the subscribe route + the docs

**Files:** `api/subscribe/route.ts` (R6), `api/subscribe/route.test.ts` (R6),
`docs/architecture/forms-and-email.md` (R8).
**Verification:** `pnpm type-check`, `pnpm lint`, `pnpm test` green;
`grep -n '"SubscribeBanner\.' apps/web/src/app/api/subscribe/route.ts` returns **zero** hits; the
**mutation check** from §9 performed and its verbatim output captured for the PR body; the temporary
edit reverted and `git status` clean.
**Commit:** `refactor(ICR-148): use SUBSCRIBE_BANNER_KEYS in the subscribe route`

## 11. Open Questions

**None blocking.**

Deferred by decision (raise as a stray observation at triage, do **not** widen this ticket):

- **Typing the route's JSON response.** The contact form goes further than this ticket does —
  `contact-form/types.ts` types its state as `messageKey: ContactFormKey`. The subscribe route's
  `NextResponse.json(...)` is still structurally untyped, so a _typo'd_ body shape (e.g.
  `{ messagekey: … }`) would still compile. Adjacent and tempting; a separate concern.
