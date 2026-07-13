# ICR-144 — Correct the Live Preview content preview URL guidance in the data-layer doc

**Type:** Task (docs-only) · **Commit type:** `docs` · **QA depth:** light · **QA type:** chore
**Jira:** https://divinelab.atlassian.net/browse/ICR-144
**Branch:** `docs/ICR-144-fix-live-preview-doc`

## Problem

`docs/architecture/contentful-data-layer.md` § Live Preview tells an editor to configure Contentful's
Content Preview URL as:

```
<preview-deploy-url>/api/draft/enable?secret=<CONTENTFUL_PREVIEW_SECRET value>&locale=<locale>
```

All three of the ticket's claims were re-verified against this branch (not taken on faith — a prior
lesson is that a ticket's quoted code can already be gone):

| #   | Claim                                                                    | Verdict       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The route is **unnecessary** — it is not on the Live Preview path at all | **CONFIRMED** | `apps/web/lib/contentful/draftMode.ts:11-29` — `shouldUseDraftMode()` is true on a manual cookie **or** `NODE_ENV==='development'` **or** `VERCEL_ENV==='preview'`. `apps/web/config/headers.js:4-6` computes `previewLike` from that same flag; `config/securityHeaders.js:30` drops `X-Frame-Options` and `buildCsp:13-16` adds the Contentful origins to `frame-ancestors` when `previewLike`. Draft content + framing are already on, with no cookie and no secret. |
| 2   | It is **broken beyond the home page**                                    | **CONFIRMED** | `apps/web/src/app/api/draft/enable/route.ts:22` — unconditional ``redirect(`/${locale}`)``, no path/slug param is read. Previewing a Creed `beliefItem` lands on home, never `/community`.                                                                                                                                                                                                                                                                              |
| 3   | It is a **secret-hygiene violation**                                     | **CONFIRMED** | Line 181 embeds the literal _value_ of `CONTENTFUL_PREVIEW_SECRET` in a third-party settings field any editor with settings access can read.                                                                                                                                                                                                                                                                                                                            |

Live-verified with `curl -I` (the headers, not just the source):

- `https://staging.idcredentor.org/es-AR` and `/es-AR/community` → **no** `x-frame-options`; `frame-ancestors` includes the Contentful origins → framable + draft-served.
- `https://www.idcredentor.org/es-AR` → `x-frame-options: SAMEORIGIN`; `frame-ancestors 'self'` → deliberately **not** framable.

Stale docs are worse than no docs (CLAUDE.md). This staleness misconfigures an editor-facing tool
_and_ spreads a secret.

## Dependencies Check

Nothing to build or install. Everything the doc will assert already exists on `main`:

- `shouldUseDraftMode()` — `apps/web/lib/contentful/draftMode.ts`
- `previewLike` / `buildSecurityHeaders({ previewLike })` — `apps/web/config/headers.js`, `apps/web/config/securityHeaders.js`
- `ContentfulPreviewProvider`, mounted in `apps/web/src/app/[locale]/layout.tsx:123-129` gated on `isEnabled`
- `/api/draft/enable` — `apps/web/src/app/api/draft/enable/route.ts`
- Staging deploy leaves `CONTENTFUL_ENVIRONMENT` **unset** (confirmed by Gabriel, 2026-07-13) → `fetch.ts:4` resolves `?? "master"` → the `master` alias → the `production` content env, which is where editors author (`docs/architecture/contentful-environments.md:31`).

## Requirements

1. **Delete the broken Content Preview URL form.** § Live Preview must no longer contain
   `/api/draft/enable?secret=…` as a Content Preview URL, and must contain no instruction that would
   write a secret _value_ into Contentful.

2. **Give the correct Content Preview URLs** — direct page URLs on the stable, framable,
   draft-enabled staging host, configured as **two Contentful preview environments**:

   | Preview environment | Content Preview URL                                  |
   | ------------------- | ---------------------------------------------------- |
   | Home                | `https://staging.idcredentor.org/{locale}`           |
   | Community / Creed   | `https://staging.idcredentor.org/{locale}/community` |

   `{locale}` is `es-AR` (default) or `en-US`.

3. **Explain why two are needed** (not obvious, and the reason is load-bearing): the same content
   type — and even the same _entry_ — renders on **both** pages. `contactCta` is a `section`;
   `ourMissionCollection` is a `contentCollection`; both appear on home _and_ community. Entry→page
   is **many-to-many**, so a single URL per content type cannot disambiguate. The editor picks the
   preview environment.

4. **State the actual mechanism**, quoted from code, not paraphrased:
   `previewLike = VERCEL_ENV === 'preview' || NODE_ENV === 'development'` (`config/headers.js:4-6`)
   simultaneously (a) turns draft mode on via `shouldUseDraftMode()` and (b) relaxes the CSP to allow
   `https://app.contentful.com` / `https://app.eu.contentful.com` framing while omitting
   `X-Frame-Options`. **No `secret`, no cookie, no query string.**

   > Note the doc must state the **real** condition. The ticket text says `VERCEL_ENV === "preview"`;
   > the code is `VERCEL_ENV === 'preview' || NODE_ENV === 'development'`. Write what the code does.

5. **Name all three Vercel tiers**, extending (not replacing) the already-correct CSP env-gating block:

   | Tier           | Host                          | Framable by Contentful?                                           | Live Preview role                                             |
   | -------------- | ----------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
   | Production     | `www.idcredentor.org`         | **No** — `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` | Deliberately never a preview target                           |
   | Per-PR Preview | `*-git-<branch>-*.vercel.app` | Yes                                                               | Usable, but the host changes every PR → not a standing target |
   | **Staging**    | `staging.idcredentor.org`     | Yes                                                               | **Stable host → the standing Live Preview target**            |

6. **Add the two-`staging`s warning.** The Vercel _staging deploy_ (a hosting tier) and the Contentful
   _`staging` environment_ (the model-work content env) are unrelated, and the collision is a live
   footgun. The Live Preview target must read the content env editors author in — so
   `CONTENTFUL_ENVIRONMENT` must remain **unset** on that deploy (`fetch.ts:4` → `?? "master"` →
   `production`). Setting `CONTENTFUL_ENVIRONMENT=staging` there would silently point the pane at the
   model-work env: **blank/stale content, no error**.

7. **Record `/api/draft/enable`'s only remaining role**: the **production** draft opt-in. It validates
   `CONTENTFUL_PREVIEW_SECRET`, enables Next draft mode, and **always** redirects to `/{locale}`
   (home) — it cannot deep-link. `/api/draft/disable` turns it off.

8. **Secrets by name only.** Keep the existing rule; remove every instruction that would put a value
   into Contentful. Reference `CONTENTFUL_PREVIEW_SECRET` as a _name_.

9. **Fix the section intro** (currently "on a Vercel preview deployment") to name staging as the
   standing target.

10. **Cross-reference ICR-135** — the human-only Contentful UI configuration runbook. This ticket
    writes the guidance; ICR-135 performs the configuration.

## Data Model Changes

None. No Contentful content-type or field change → the project's **Contentful model-change gate does
not apply**.

## API Changes

None. `/api/draft/enable` is **explicitly out of scope** — no new `path`/`redirect` param. (Per the
ICR-135 lesson, adding one would relocate the hardcoding into a Contentful settings field _and_ add an
open-redirect surface to a secret-guarded route under the `apps/web/src/app/api/**` sensitive glob.)

## New / Modified Files

| File                                         | Change                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/contentful-data-layer.md` | **Modified.** § Live Preview: rewrite the "Editor setup" block (lines 177-187); extend the CSP env-gating block (159-175) to name three tiers; fix the section intro (128-132). |

No new files. No code files touched.

## Component Hierarchy

N/A — docs-only, no UI.

## Edge Cases

1. **Editor points Contentful at production** → the pane stays blank (`frame-ancestors 'self'`). The
   doc must say this is _intentional_, so nobody "fixes" it by loosening the production CSP.
2. **Editor points at a per-PR preview** → works, but the URL rots when the PR merges. Documented as
   usable-but-not-standing.
3. **`CONTENTFUL_ENVIRONMENT=staging` on the staging deploy** → silent wrong-content-env. Covered by
   Requirement 6; this is the failure mode with no error message, so it gets a callout, not a footnote.
4. **A future content type renders on a third page** → needs a third preview environment. The doc
   states the rule (one preview environment per _page_, because entry→page is many-to-many) rather
   than just the two current URLs, so the rule generalizes.
5. **Someone re-adds a `secret=` query param** → the doc's stated rule ("no secret, no cookie, no
   query string") makes it reviewable.
6. **Local dev (`NODE_ENV=development`)** is also `previewLike`, so `localhost` is framable too — but
   Contentful cannot reach `localhost`, so it is not a preview target. Mention only if it fits without
   bloating the section.

## i18n

None — engineering doc, English only. The _content_ references both locales (`es-AR`, `en-US`) in the
URL templates, but no `public/locales/*.json` key changes. The `i18n-messages` sensitive area is **not**
touched.

## Testing Strategy

Docs-only: no unit-test surface, no runtime behavior, no e2e. Verification is:

1. `pnpm lint` — passes (ESLint does not read `docs/**`, but the ticket's AC-5 names it).
2. `pnpm format:check` — must not regress. **Known context:** a prior session found repo-wide Prettier
   drift (~173 files) tracked as **ICR-134**; `docs/architecture/contentful-data-layer.md` itself
   passes `prettier --check` **today**, so the bar is: this file still passes after the edit. Verify
   the file specifically (`pnpm exec prettier --check docs/architecture/contentful-data-layer.md`) so a
   pre-existing repo-wide failure is not mistaken for a regression from this change.
3. **Negative grep** (the ACs are assertions about absence, so test them as such):
   - `draft/enable?secret=` → 0 hits in the § Live Preview block
   - no instruction to paste a secret _value_ into Contentful
4. **Positive grep**: the section names `staging.idcredentor.org`, `previewLike`, all three tiers, and
   the `/{locale}` home-redirect fact.
5. Human read of the rendered section (a doc's real test is whether an editor could follow it).

## Implementation Checkpoints

### Checkpoint 1 — rewrite § Live Preview

- **Files:** `docs/architecture/contentful-data-layer.md`
- **Do:** apply Requirements 1-10 to the section (intro 128-132; CSP block 159-175 extended; editor-setup 177-187 replaced).
- **Verify:** `pnpm exec prettier --check docs/architecture/contentful-data-layer.md`; `pnpm lint`; the negative + positive greps from Testing Strategy; re-read the section end-to-end for internal consistency (no leftover sentence contradicting the new mechanism).
- **Commit:** `docs(ICR-144): correct the Live Preview content preview URL guidance`

One checkpoint — a single coherent edit to one section of one file. Splitting it would produce an
internally-contradictory doc at the intermediate commit.

## Sensitive Areas

**Subject matter** touches `csp-headers` and `env-secrets`; **no code or config is edited**, and
`docs/**` matches no `sensitivePaths` glob. The discipline that applies: reference
`CONTENTFUL_PREVIEW_SECRET` by **name**, never write a value into the doc — which is the very defect
this ticket removes.

## Open Questions

None blocking.

- The staging deploy's `CONTENTFUL_ENVIRONMENT` being unset was **confirmed by Gabriel** rather than
  read from the repo (it is a Vercel dashboard value). The doc therefore states it as a **requirement**
  of the Live Preview target, not merely as an observed fact — which is the durable framing regardless.
- Actually _performing_ the Contentful UI configuration remains **ICR-135** (human-only). This ticket
  only writes the guidance.
