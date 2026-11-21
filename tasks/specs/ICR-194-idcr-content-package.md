# ICR-194 — `@idcr/content`: content model, Zod 4 schemas, TipTap 3 doc + registries

Status: DRAFT for design gate · Issue: https://linear.app/divinelab/issue/ICR-194 · Type: Task → `chore`
QA depth: standard (default) · QA type: `chore` (package + tests; no UI/API change)

Binding inputs: issue description (Agent notes = field list), `content-platform-readiness/01-decisions.md`,
`F-editor-ux-decisions.md` (§2.2, §2.4–2.6, §2.8–2.9), `H-reference-editor-lessons.md`, `A-foundations.md`.

## 1. Dependencies check

- Blocked by: nothing. Blocks ICR-195, 196, 201, 202.
- Libraries (decided): `zod@4.6.x` (latest 4.6.7), `@tiptap/*@3.34.x` (3.34.0 exists; 3.35.0 is
  latest — we pin `~3.34.0` per decision). Verified against zod.dev (v4 migration: `ZodTypeDef`
  removed, `ZodType<Output, Input>`; defaults are applied under `.partial()`) and tiptap.dev (v3
  StarterKit bundles Link/Underline/ListKeymap/TrailingNode; `StarterKit.configure({ link: false })`;
  Link `isAllowedUri(url, ctx)`, `defaultProtocol`; headless `getSchema(extensions)`).
- No `mongodb`/`bson`/React dependency in the package.

## 2. Requirements

R1. New workspace package `packages/content` (`@idcr/content`, private, `type: module`, raw TS,
    scripts `type-check`, `lint`, `test` (`vitest run`); no build script) mirroring `packages/ui`.
R2. Exports (package.json `exports`):
    - `"."` → `src/index.ts`: model types, Zod schemas, constants, helpers, registries. Imports
      only `zod` (peer). Safe for any bundle.
    - `"./tiptap"` → `src/tiptap/index.ts`: the shared TipTap extension list (`@tiptap/core`,
      `@tiptap/starter-kit`, `@tiptap/extension-link`). Kept off the main entry so the public site
      never pulls ProseMirror just for a schema.
R3. `zod` is a `peerDependency` (`^4.6.0`) + devDependency of the package. Both apps move from
    `zod ^3.25.76` to `zod ^4.6.7` (one Zod instance in the workspace; see §4.1).
R4. Envelope `ContentDoc<TFields>` and `Localized<T>` exactly as Agent notes (ids are `string`).
R5. Collection-name const map `COLLECTIONS` (`sections`, `belief_collections`, `event_banners`,
    `posts`, `sermons`, `bible_verses`, `authors`, `topics`, `seo_entries`, `globals`, `media`),
    plus `CONTENT_TYPES` const map and `ContentType` union.
R6. Per type: field interface + three Zod schemas `draft` (lenient), `publishable` (strict),
    `update` (= `draft.partial()`), exported via a `CONTENT_SCHEMAS` registry
    `Record<ContentType, { draft; publishable; update }>` (`satisfies`). **Zero `.default()`** in any
    create (draft/publishable) schema; enforced by the `{}`→`{}` test per type AND a structural
    test that walks every schema and fails on any `ZodDefault`/`ZodPrefault`.
R7. Localization: `es-AR` required at publish, `en-US` optional (draft + published). Protected
    content (all `belief_collections`; `topics` with `protected: true`) requires both at publish.
    Empty-string / whitespace-only / empty-doc `en-US` is normalised to absent (schema transform +
    exported `normalizeLocalized`).
R8. Rich text: one declarative spec (`RICH_TEXT_NODES`, `RICH_TEXT_MARKS`, `RICH_TEXT_PROFILES`)
    from which (a) the Zod document schema per profile and (b) the TipTap extension list are built.
    A test asserts the TipTap schema's node/mark names equal the spec (both directions) and that
    valid fixtures pass `Node.fromJSON(schema, doc).check()`.
R9. Profiles: `inline` (doc, paragraph, text; bold, italic), `inlineLink` (+ link), `article`
    (+ heading 2–3, blockquote of paragraphs, bulletList, orderedList, listItem, link), `sermon`
    (article + `embeddedMedia {mediaId}`). Everything else rejected (`hardBreak`, `horizontalRule`,
    `underline`, `strike`, `code`, `codeBlock`, heading 1/4–6, `image`, tables, `postLink`, unknown).
R10. Link mark: attrs `{ href }` only (no `target`, `rel`, `class`). `isAllowedHref(href)`:
     trimmed, ≤ 2048 chars, no ASCII control chars/whitespace, and one of `https://`, `http://`,
     `mailto:`, or a site path starting with a single `/` (not `//`). Case-insensitive scheme
     check after stripping nothing else (so `JaVaScRiPt:` / `data:` / `vbscript:` / `//evil` /
     `tel:` / relative `foo` are refused). The same function backs Zod and TipTap `isAllowedUri`.
R11. Limits: `MAX_NODE_DEPTH = 10` (doc = 1; a two-deep nested list paragraph's text is depth 7,
     three-deep is 9). BSON budget: 4 envelope levels (`root.draft.content["es-AR"]`) + ~2 per node
     + 3 for `marks[].attrs` ⇒ ≤ 27 < 50. Also `MAX_NODES = 20_000` per doc, `MAX_TEXT = 50_000`
     chars per text node (= Contentful's Text-field maximum), plain string caps derived from
     Contentful's own field limits so no stored value can exceed them: slug/machineName 256
     (Contentful Symbol max), short text (titles, names, labels, CTA, version, book) 500 (> Symbol
     max 256), long text (descriptions, thesis, excerpt, SEO, verse text) 50_000 (Contentful Text
     max). Caps are raised, never used to truncate. Measured fixture maxima recorded in the plan. Depth/size checks are iterative (no recursion
     blow-up, no regex on unbounded input).
R12. Status: `deriveStatus(doc): "draft" | "changed" | "published"` and `canonicalEqual(a, b)`:
     key order ignored; `Date` compared by `getTime()`; a key whose value is `undefined` equals an
     absent key; array order significant; `NaN` equals `NaN`; no other coercion (`Date` ≠ ISO string).
R13. Natural keys: `slugify(text)` (NFD → strip diacritics → lowercase → non-`[a-z0-9]` runs → `-`
     → trim dashes, capped at 200; same rule as `slugifyPersonName`), `isValidSlug`
     (`^[a-z0-9]+(-[a-z0-9]+)*$`, length-capped before testing), and
     `bibleVerseKey({ book, chapter, fromVerse, toVerse, version })` from the Spanish book and Spanish
     version: NFC, trim, collapse internal whitespace, lowercase; `toVerse` absent/null/"" ⇒
     `fromVerse`. `chapter`/`fromVerse`/`toVerse` accept `number | string` (Contentful stores
     Symbol strings, `Sermon.ts` uses numbers): strings are trimmed and must be a positive integer
     (`"3"` ≡ `3`; `"03"` ≡ `3`); anything else throws. Stored verse fields are integers.
     `"NVI"` vs `"RVR1960"` ⇒ different keys; `"RVR1960 "` ⇒ same as `"RVR1960"`; `"RVR"` stays
     `"rvr"` (no renaming; ICR-203 decides tidying).
R14. Registries:
     - `SITE_PAGES`: `home`(""), `who-is-jesus`, `community`, `come-meet-us`, `blog`, `predicas`,
       each with es/en label + path; `targetPage` and menu `groupLink` validate against it (Zod
       enum from the registry; published info-page slugs are validated by ICR-195, not here).
     - `FIXED_ENTRIES`: every fixed entry the site reads today (sections, belief collections,
       event banner, SEO entries, the four globals + `location`), each with
       `{ type, machineName, name: { es-AR, en-US }, appearsOn: SitePage[], previewPage: SitePage }`.
       The list is enumerated from the real getter call sites in `apps/web/src/app/[locale]/**`
       (never from test mocks): sections `our-mission` (hero, home), `connect-with-us` (cta: home,
       blog, blog post, predica, community), `info-community` (textBlock, community),
       `info-connect` (textBlock, come-meet-us); belief collections `collection-our-mission`
       (home, community), `our-creed` (community); event banner `event-sunday-meetings`
       (come-meet-us); SEO `seo-home`, `seo-blog`, `seo-community`, `seo-connect`,
       `seo-who-is-jesus`; globals `main-menu` (navigationMenu), `single-email-subscribe`
       (singleEmailForm), and the machineName-less singletons `footer`, `contact-form`
       (come-meet-us), `location` (footer + event banner) given registry identifiers.
       `isRegisteredFixedEntry(type, machineName)` backs "not in registry ⇒ not shown".
     - `REFERENCE_PATHS`: per type, which plain fields hold media ids vs content ids (with target
       collection), including embedded-array item fields (belief items `imageId`/`bibleVerseId`,
       footer `logo`, contact form `image`/`bibleVerseId`, section `image`/`images[]`), and which
       fields are rich text (walked for `embeddedMedia.attrs.mediaId`).
     - `extractReferences(type, doc)` → `{ mediaIds: string[]; contentRefs: { collection, id }[] }`,
       deduplicated, sorted, across `draft` + `published` and both locales.
     - Block registry types: `BlockType`, `MarkType`, `BlockRegistry<C> = Record<BlockType, C>`,
       `MarkRegistry<C> = Record<MarkType, C>` (no React import; ICR-202 binds `C`).
R15. Both apps: add `"@idcr/content": "workspace:*"`, add to `transpilePackages`, and add one
     contract test per app importing it (`apps/{web,admin}/src/lib/content/idcr-content.test.ts`,
     inside each app's `src` so its `type-check` covers it).
R16. Zod 4 email regression test in `apps/web/src/app/api/subscribe/email.test.ts`: the same
     `z.string().trim().email()` chain the subscribe route uses still accepts typical addresses
     (`+` tags, dots, subdomains, long TLDs, digits, hyphenated domains, surrounding whitespace)
     and still rejects obvious junk.
     No runtime import in app code: public site behaviour and live Contentful reads are untouched.

## 3. Data model changes (TypeScript; no DB code, no indexes created here)

```ts
interface Localized<T> { "es-AR": T; "en-US"?: T }
interface ContentDoc<TFields> {
  _id: string; draft: TFields; published?: TFields; publishedAt?: Date; firstPublishedAt?: Date;
  revision: number; createdAt: Date; updatedAt: Date; updatedBy: string; sourceContentfulId?: string;
}
type RichTextDoc = { type: "doc"; content: RichTextNode[] }   // profile-checked by Zod
```

Field shapes = Agent notes "Collections and fields", verbatim (L = `Localized`), including every
"(was missing)" field: `section.subHeadline`, `section.urlParameters`, `section.image`,
`sermon.audioLanguages: Locale[]`, `topic.name`/`shortDescription`/`slug` (L) with no SEO fields,
`footer.logo`/`shortDescription`/`socialLinks[]`, `contactForm.title/description/ctaText/image/
bibleVerseId`, the `location` global. `bible_verses`: `book`(L), `chapter`, `fromVerse`, `toVerse?`
(integers), `text`(L), `version`(L). `globals` = `z.discriminatedUnion("kind", [...])` over
`navigationMenu | footer | singleEmailForm | contactForm | location`. `media` (`MediaDoc`, no
draft/published envelope): `pathname` (Blob key, canonical), `url` (stored public URL — the web
read layer holds no Blob token/origin; ICR-196 AC1, ICR-201), `filename`, `contentType`, `size`,
`width?`, `height?`, `durationSeconds?`, `sha256` (**required**, dedupe key; ICR-196 AC4),
`title`(L), `alt?`(L), `decorative?: boolean` (image needs Spanish `alt` OR `decorative: true`;
ICR-196 AC3, enforced in the image refinement), `caption?`(L), `credit?`(L), `createdBy`,
`createdAt` — ICR-196 may extend it. Draft vs publishable per type: draft requires only the storable minimum
(title/name or `machineName`, valid slug where the type has one, valid rich text); publishable
requires every field the site needs to render (e.g. sermon: title, slug, sermonDate, thesis,
mainPoints ≥1, excerpt, content, featuredImageId, preacherId, seoTitle/seoDescription; posts:
title, slug, featuredImageId, content, authorId, publishedDate, SEO). Exact per-field table lands in
the plan.

## 4. API changes

None (no routes). The Zod contracts above are the write-boundary API for ICR-195+.

### 4.1 Zod 3 → 4 in the apps (single instance)

11 files import `"zod"` (8 admin, 3 web). All use APIs that keep working in v4 (`z.object`,
`string().min/trim/email/regex`, `z.enum(tuple)`, `z.custom`, `safeParse`, `.issues`). The one
break is `apps/admin/src/service/types.ts:89` `z.ZodType<Invite, z.ZodTypeDef, unknown>` →
`z.ZodType<Invite, unknown>`. `@hookform/resolvers@^3.10.0` in web is unused in source (no
imports) — left as is. Bumping both apps to `^4.6.7` gives one Zod copy; existing app tests are
the regression net. Deprecated-but-working v4 APIs (`.email()`, string `message`) are not touched.

## 5. New / modified files

| File | Change |
| --- | --- |
| `packages/content/{package.json,tsconfig.json,vitest.config.ts,eslint.config.mjs}` | new |
| `packages/content/src/index.ts` | public barrel |
| `src/model/{envelope,localized,collections,fields}.ts` | types + const maps |
| `src/schemas/{common,localized,section,belief-collection,event-banner,post,sermon,bible-verse,author,topic,seo-entry,globals,media,index}.ts` | Zod schemas + `CONTENT_SCHEMAS` |
| `src/rich-text/{spec,href,limits,schema}.ts` | declarative spec, href rule, limits, Zod doc schema |
| `src/tiptap/{extensions,link,embedded-media,index}.ts` | shared extension list (subpath export) |
| `src/status.ts`, `src/natural-keys.ts` | status + canonical equality; slug + verse key |
| `src/registries/{pages,fixed-entries,reference-paths,blocks}.ts`, `src/references.ts` | registries + extractor |
| `src/**/*.test.ts` | unit tests (§9) |
| `apps/web/{package.json,next.config.ts}`, `apps/admin/{package.json,next.config.ts}` | dep + transpilePackages + zod ^4.6.7 |
| `apps/{web,admin}/src/lib/content/idcr-content.test.ts` | import contract test |
| `apps/admin/src/service/types.ts` | `ZodTypeDef` removal |
| `pnpm-lock.yaml` | regenerated by `pnpm install` |
| `docs/architecture/monorepo-packages.md` | add `@idcr/content` (docs step) |

## 6. Component hierarchy

N/A (no UI). Package layout: `index` (zod-only) ← `schemas` ← `rich-text/spec` → `tiptap/*` (subpath).

## 7. Edge cases

1. `javascript:`/`data:`/`vbscript:`/mixed-case/leading-space/control-char/`//host` hrefs refused.
2. Two-deep nested list accepted; doc deeper than `MAX_NODE_DEPTH` refused before Mongo's 50.
3. `hardBreak` refused in every profile.
4. Heading in `inline` profile refused; link in `inline` refused, accepted in `inlineLink`.
5. `embeddedMedia` only in `sermon`; empty/missing `mediaId` refused. (Audio/PDF-only is a
   media-doc check at write time in ICR-195/200, since the doc holds only an id.)
6. `en-US: ""` / whitespace / `{type:"doc",content:[]}` / doc of empty paragraphs → absent.
7. Same passage NVI vs RVR1960 → two keys; trailing-space version → same key as trimmed.
8. Oversize strings/docs refused by caps; helpers use loops/linear regexes on capped input.
9. `update.parse({})` → `{}` for every type; partial update never injects a value.
10. Status: reordered keys / equal Dates / `undefined` vs absent ⇒ published; array reorder ⇒ changed.
11. Globals union: unknown `kind` refused; each kind's fields strictly checked.
12. Draft accepts a sermon with only a title; publishable refuses it naming the missing fields.

## 8. i18n

No message files touched. Registries carry `{ "es-AR", "en-US" }` friendly names (data, not
next-intl keys). Error-message keys per field path are ICR-197's job (Zod issues carry `path`).

## 9. Testing strategy

Unit only (Vitest single run) in `packages/content`: per-profile accept/reject (each rejected
node/mark, XSS hrefs, depth, node cap); draft vs publishable per type (incomplete draft passes
draft, fails publishable; es-only passes publishable; protected needs both); `{}` tripwire + no
`ZodDefault` walk per type; status cases; slug + verse-key cases; reference extraction one test per
reference kind (each plain media field, each content-id field, array fields, embedded item fields,
`embeddedMedia` in rich text) × draft/published × es/en; registry integrity (every fixed entry's
`appearsOn`/`previewPage` exists in `SITE_PAGES`; unique `(type, machineName)`; every
`REFERENCE_PATHS` field exists in that type's draft schema shape); TipTap schema ↔ spec parity.
App contract tests. Workspace `pnpm type-check && pnpm lint && pnpm test && pnpm build` green.
No Playwright suites apply (`packages/**` → preview/previewAdmin smoke only; QA type `chore`).

## 10. Implementation checkpoints

1. Scaffold package + Zod 4 bump in both apps (+ `ZodTypeDef` fix), transpilePackages, contract
   tests, lockfile. Verify: workspace type-check/lint/test. `chore(ICR-194): scaffold @idcr/content and move apps to zod 4`
2. Envelope, localized helpers, collections, status + natural keys (+ tests).
   `chore(ICR-194): add content envelope, status derivation and natural keys`
3. Rich-text spec, href rule, limits, Zod doc schema per profile (+ tests).
   `chore(ICR-194): add constrained rich-text schema and profiles`
4. TipTap shared extension list (custom link + embeddedMedia) + parity tests.
   `chore(ICR-194): add shared tiptap extension list`
5. Content-type schemas (draft/publishable/update) + `CONTENT_SCHEMAS` + tests.
   `chore(ICR-194): add per-type draft, publishable and update schemas`
6. Registries (pages, fixed entries, reference paths, blocks) + `extractReferences` + tests.
   `chore(ICR-194): add registries and reference extractor`
7. Docs (`monorepo-packages.md`) + full build verify.
   `docs(ICR-194): document @idcr/content`

## 11. Open questions (with recommendations; from the issue)

1. `firstPublishedAt` — keep (set once, never cleared). Recommended: keep.
2. Verse version strings — key trims/collapses/lowercases; no renaming. Recommended as written.
3. `tel:` links — refused. Recommended: refuse (zero production use).
4. Shared `location` — one stored global; ICR-201 falls back to two copies if a getter shape changes.
