# ICR-106 — Remove dead `SubscribeForm` component — Implementation Plan

**Type:** Task → `chore` · **QA depth:** light · **QA type:** chore (no UI/API behavior change)
**Design gate:** not required (zero-importer client-component deletion; no data-model/API/CSP/i18n/email touch).

## Decision (locked in PM refine pass + explorer verification)

**Delete** the dead `SubscribeForm` component. `SubscribeBanner` is the live equivalent (rendered in
`apps/web/src/app/[locale]/layout.tsx`); `SubscribeForm` has **zero importers** repo-wide — confirmed by
graphify (`SubscribeForm()` node has no incoming importer edges) and repo-wide grep (no static, dynamic
`import(`, `React.lazy`, string, barrel, or test reference). No `components/shared/index.ts` barrel exists.
No test file exists for it.

## Checkpoint 1 (only) — delete the component + fix stale doc references

**Files removed:**
- `apps/web/src/components/shared/subscribe-form/SubscribeForm.tsx`
- `apps/web/src/components/shared/subscribe-form/index.ts`
- (the entire `apps/web/src/components/shared/subscribe-form/` directory — no orphans)

**Files edited (stale references to the deleted component):**
- `docs/gtm-ga4-setup.md` — the `newsletter_subscribe` event's "Source Components" cell lists
  `` `SubscribeBanner.tsx`, `SubscribeForm.tsx` ``. `SubscribeForm` never rendered, so it never fired
  the event — drop it, leaving `` `SubscribeBanner.tsx` ``.
- `docs/forms-and-email.md` — prose "`SubscribeBanner.tsx` and `SubscribeForm.tsx` call `useLocale()`…"
  → "`SubscribeBanner.tsx` calls `useLocale()`…" (singular; `SubscribeForm` is gone).

**Out of scope (unchanged):** `SubscribeBanner`, `src/service/subscribe.ts`, `/api/subscribe`, locale
JSON files — none reference `SubscribeForm`.

**Verification:**
1. `pnpm type-check` — passes (catches any broken import; there are none).
2. `pnpm lint` — passes, no new errors.
3. `pnpm test` — passes.
4. `git grep -n "SubscribeForm" apps/web/src` → zero results.
5. `apps/web/src/components/shared/subscribe-form/` no longer exists.

**Commit:** `chore(ICR-106): remove dead SubscribeForm component`

## Edge cases

1. A hidden dynamic/string import — ruled out by explorer (grep for `import(`, `React.lazy`, string refs
   all empty).
2. A shared-components barrel re-export — ruled out (no such barrel file exists).
3. Docs left pointing at a deleted file — handled by the two doc edits above.

## Acceptance criteria (from the issue)

- [ ] `subscribe-form/` directory no longer exists (no orphaned files).
- [ ] `pnpm type-check && pnpm lint` pass with no new errors.
- [ ] `pnpm test` passes.
- [ ] `git grep -n "SubscribeForm"` in `apps/web/src` returns zero results.
