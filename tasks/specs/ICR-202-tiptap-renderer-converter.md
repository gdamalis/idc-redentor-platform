# ICR-202 — TipTap Renderer with DOM Parity + Contentful Rich-Text Converter

Status: Approved (Checkpoints 1–5; Q1 = Option A) · Issue: https://linear.app/divinelab/issue/ICR-202 · Type: Task → `feat`
QA depth: standard (default) · QA type: `chore` / `unit+component` (dormant renderer, converter, PDF block/hash helpers, offline corpus parity/round-trip/dormancy test suite)

Binding inputs: Linear `ICR-202` description & Agent notes, `01-decisions.md`, `C-read-layer-parity.md`, `F-editor-ux-decisions.md`, `H-reference-editor-lessons.md`, `evidence/ICR-202/pm-spec.md`, owner Q1 = Option A.

## 1. Dependencies & Wave 1 Ownership

- **Blocked by:** `ICR-194` (`@idcr/content`, merged `4f3a366`), `ICR-210` (trace-guard fix, merged `8a5dde6`).
- **Zero Wave 1 collision:** `ICR-201` holds sole write ownership of `packages/content/` in Wave 1. `ICR-202` makes zero edits to `packages/content/` and zero edits to `ICR-201`'s files; all new modules live under `apps/web/lib/content/rich-text/**`, `apps/web/src/utils/predica/tiptapRegenContent*.ts`, and `apps/web/scripts/contentful/export-rich-text-corpus.mjs`.
- **Wave 4 hoisting handoff:** `convert-contentful.ts` and `tiptapRegenContent.ts` are 100% self-contained (zero `./sermonEntry`, `@src/`, or Next.js imports) so `ICR-200` (admin PDF worker) and `ICR-203` (importer) can hoist them cleanly into `@idcr/content` subpaths after `ICR-201` merges.

## 2. Requirements

1. **Contentful → TipTap converter (`convertContentfulRichText`):** Converts Contentful rich-text JSON (`paragraph`, `heading-2`, `heading-3`, `blockquote`, `unordered-list`, `ordered-list`, `list-item`, `embedded-asset-block`, `hyperlink`, `text`, marks `bold`/`italic`) into canonical TipTap JSON scoped to a `RichTextProfile`:
   - Replaces `\r\n`, `\r`, `\n` with `" "` via linear char loop (no `hardBreak`, no regex).
   - Drops empty `""` text nodes; omits `content` on empty paragraphs/headings; emits `orderedList.attrs = { start: 1, type: null }`; sorts marks in schema rank (`link`, `bold`, `italic`); merges adjacent identical-mark text runs unconditionally before `validateRichText` length validation.
   - Reports any unsupported/disallowed node, mark, nesting, href, or missing asset mapping without crashing; published production corpus produces zero reports.
2. **Schema validation & lossless TipTap round-trip:** Every converted production document passes `validateRichText` and `PMNode.fromJSON(schema, doc).check()` with `pmDoc.toJSON()` deep-equal to input.
3. **Allowlisted client-safe React renderer (`renderRichText`):** Hand-written tree walker (no `@tiptap/static-renderer`/ProseMirror in client bundles; zero `server-only`/`node:*` imports) covering all 11 render calls across 9 files (4 `"use client"`). Groups contiguous text runs sharing a link `href` into one outermost `<a>`/`<Link>`, dispatches sermon audio/PDF/image embeds (delegating to `articlePreset` when zero embeds; warn + `null` on missing `mediaId`), and drops (`null`) any disallowed node, mark, repeated mark, overlong mark array, or disallowed `href`.
4. **Published-only scrubbed production corpus (Q1 = Option A):** Read-only CDA export of published production rich-text documents with `mailto:` links and email strings scrubbed to `contacto@example.org` (zero unpublished drafts, zero real emails, zero credentials in the public repo).
5. **TipTap sermon PDF blocks & content hash (`tiptapRegenContent.ts`):** Pure iterative `tiptapToContentBlocks` + canonical SHA-256 `computeTipTapSermonContentHash` beside untouched `regenContent.ts`, producing block equality across every published production sermon once asset IDs are mapped and changing whenever any rendered field changes.
6. **Automated dormancy check:** Proves zero live pages, layouts, components, API routes, or predica utilities import the new renderer or `tiptapRegenContent`.
