# ICR-194 — implementation plan

Spec: `tasks/specs/ICR-194-idcr-content-package.md` (approved with coordinator adjustments 1–5, board #18).
Commit type `chore`. Verify after each checkpoint: `pnpm type-check && pnpm lint && pnpm test`
(workspace), plus `pnpm build` at checkpoints 1 and 7.

## Length caps (adjustment 2)

The production corpus cannot be read from this worktree without touching production Contentful
(not allowed by the run rules), so caps are anchored on Contentful's **own hard field limits**,
which every stored value already satisfies, and raised above them:

| Cap | Value | Anchor |
| --- | --- | --- |
| `SLUG_MAX` / `MACHINE_NAME_MAX` | 256 | Contentful Symbol max 256 |
| `SHORT_TEXT_MAX` (titles, names, labels, CTA, book, version, URLs) | 500 | > Symbol max 256 |
| `LONG_TEXT_MAX` (descriptions, thesis, excerpt, SEO, verse text, keywords item) | 50_000 | Contentful Text max 50_000 |
| `MAX_TEXT` per rich-text text node | 50_000 | Contentful Text max |
| `MAX_NODES` per doc | 20_000 | longest fixture sermon ≈ 40 blocks |
| `MAX_NODE_DEPTH` | 10 | corpus lists nest 2 deep (= depth 7) |
| `HREF_MAX` | 2_048 | |

Measured repo fixtures (`.claude/scripts/predica/__fixtures__/sample-sermon.json`): longest thesis 163
chars, longest block 254 chars — far under every cap. The importer (ICR-203) re-checks the full
corpus with these schemas before cutover.

## Draft vs publishable per type (L = localized; "es" = es-AR non-empty required)

| Type | Draft requires | Publishable adds |
| --- | --- | --- |
| section | machineName | layout, headline es |
| beliefCollection (protected) | machineName | title es+en, items ≥1 (title es+en, description es+en, kind); any present L has both |
| eventBanner | machineName | event.name es, event.dayOfWeek es, event.time, imageId |
| post | title es, slug valid if present | slug, featuredImageId, content es, authorId, publishedDate |
| sermon | title es, slug valid if present | slug, sermonDate, thesis es, mainPoints es ≥1, excerpt es, preacherId |
| bibleVerse | book es, chapter, fromVerse | text es, version es |
| author | name | email valid if present (draft accepts any string) |
| topic | name es, slug valid if present | slug es, body es; `protected: true` ⇒ every present L has both |
| seoEntry | machineName | title es, description es |
| navigationMenu | machineName | menuItems ≥1 (groupName es, groupLink) |
| footer | machineName | shortDescription es |
| singleEmailForm | machineName | title es, ctaText es |
| contactForm | machineName | title es, ctaText es, bibleVerseId, fields ≥1 (inputId, type, name es) |
| location | machineName | addressLine1, city, country |
| media (no envelope) | create schema only (pathname, url, filename, contentType, size, sha256, title es; image ⇒ alt es or decorative) | — |

All objects are `z.strictObject` (unknown keys refused). `update = draft.partial()`. No `.default()`.
Rich-text fields validate structure/profile in draft already (draft refuses rich text outside the
allowed set).

## Checkpoints

1. **Scaffold + Zod 4.** `packages/content/{package.json,tsconfig.json,vitest.config.ts,eslint.config.mjs,src/index.ts}`;
   deps: peer+dev `zod ^4.6.7`, deps `@tiptap/core ~3.34.0`, `@tiptap/starter-kit ~3.34.0`,
   `@tiptap/extension-link ~3.34.0` (+ `@tiptap/pm ~3.34.0`); apps: `zod ^4.6.7`,
   `@idcr/content: workspace:*`, `transpilePackages`; fix `apps/admin/src/service/types.ts`
   `ZodTypeDef`; app contract tests; `apps/web/src/app/api/subscribe/email.test.ts`. `pnpm install`.
   Verify full stack incl. build. Commit + open draft PR.
2. **Model, status, keys.** `src/model/*`, `src/status.ts`, `src/natural-keys.ts` + tests.
3. **Rich text.** `src/rich-text/{spec,href,limits,validate,schema}.ts` + tests (every rejected
   node/mark, XSS hrefs, depth, node cap, per-profile).
4. **TipTap.** `src/tiptap/{link,embedded-media,extensions,index}.ts`; parity test via
   `getSchema` + `Node.fromJSON(...).check()` per profile.
5. **Schemas.** `src/schemas/*` + `CONTENT_SCHEMAS` + tests (draft/publishable per type, `{}`
   tripwire, no-`ZodDefault` walk, en-US normalisation, protected both-locales).
6. **Registries + extractor.** `src/registries/*`, `src/references.ts` + tests (integrity, one per
   reference kind × draft/published × es/en).
7. **Docs + final verify.** `docs/architecture/monorepo-packages.md`; full `pnpm build`.
