# ICR-46 — Plan: reconcile default OG image path in docs

> Design gate skipped (`needsDesignGate=false`, trivial fix). No spec doc — this plan is built
> from the card + explorer findings. Commit type: `docs` (documentation-only change; no shippable
> code, so it must not trigger a semantic-release version bump). Branch: `fix/ICR-46-og-default-image-404`.

## Situation (re-planned after exploration)

The ticket's premise is **stale**. The code-level bug it describes — `lib/metadata.ts` referencing
`/assets/img/og-default.jpeg` (hyphen) while the asset on disk is `og_default.jpeg` (underscore) —
was already fixed on `main`:

- `apps/web/lib/metadata.ts:49` (`DEFAULT_OG_IMAGE.url`) and `:165` (JSON-LD `image`) already use the
  underscore form; fixed in commit `cf237a2` (PR #56, 2026-06-26) when `DEFAULT_OG_IMAGE` became an
  exported single-source-of-truth constant.
- The asset `apps/web/public/assets/img/og_default.jpeg` exists (underscore).
- Tests already assert the underscore form (`metadata.test.ts:130`, `sermonMetadata.test.ts:164/165/272`).
- ICR-46 was migrated from Trello on 2026-06-27, after the fix — so it was already obsolete on arrival.

The **only live residual mismatch** is a stale code-block example in `docs/seo-and-metadata.md`
(lines 43–50) that still shows `const DEFAULT_OG_IMAGE = { url: "/assets/img/og-default.jpeg", … }`.
This documents the exact wrong path that caused the original bug and risks a future dev reintroducing
it. Human chose: fix the stale doc + PR, noting in PR/Jira the code bug was already resolved in #56.

Intentionally-left references (correct as-is, NOT touched):

- `apps/web/lib/metadata.ts:46` — JSDoc warning that names the hyphen form as the thing to avoid.
- `apps/web/lib/sermonMetadata.test.ts:216,219` — test name + `.not.toContain("og-default.jpeg")` negative assertion.
- `tasks/specs/sermon-pipeline.md:357,581` — historical spec notes (gitignored working dir; not live refs).

## Checkpoint 1 — Correct the doc snippet (docs-only)

**Files touched:** `docs/seo-and-metadata.md`

**Change:** Update the `## The OG image` code block (lines 43–50) to mirror the current implementation:

- `const DEFAULT_OG_IMAGE` → `export const DEFAULT_OG_IMAGE`
- `url: "/assets/img/og-default.jpeg"` → `url: "/assets/img/og_default.jpeg"`
- Add one sentence after the block noting the underscore matches the on-disk asset and that
  `DEFAULT_OG_IMAGE` is the single source of truth — reference the constant rather than hard-coding
  the path, to avoid the recurring hyphen 404 (mirrors the JSDoc at `metadata.ts:42–46`).

**Verification:**

- `pnpm type-check` — green (no code touched).
- `pnpm lint` — green (`eslint .`).
- `pnpm test` (vitest run) — green; existing OG-path tests already assert the underscore form.
- `pnpm format:check` — the edited markdown stays Prettier-clean.
- `grep -rn "og-default" docs/` returns no remaining hyphen references in `docs/`.

**Commit:** `docs(ICR-46): correct default OG image path in SEO doc (og_default.jpeg)`

## Acceptance criteria mapping

1. Default OG/Twitter image URL resolves (HTTP 200), not 404 → already satisfied on `main` (#56); QA confirms on preview.
2. Reference in `lib/metadata.ts` and the actual filename match → already satisfied; this CP extends consistency to the doc example.
3. Share-preview validator shows the image → confirmed at QA via the emitted `<head>` og:image on the preview deploy.
4. `pnpm type-check && pnpm lint && pnpm build` pass → verifier + CI.

## Out of scope

New/per-page OG images (ICR-27); renaming the asset to the hyphen form (the underscore is the established convention and the code/tests already standardize on it).
