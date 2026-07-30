# Content Platform Migration — Epic Brief

> **Status:** APPROVED (brainstormed + decision-locked with the maintainer, 2026-07-29).
> **Epic:** ICR-— _(key assigned at creation; this doc is the epic's canonical reference)_
> **What this is:** the epic-level brief for replacing Contentful with a self-hosted content
> platform — content persisted in MongoDB (`website` DB), edited in the Ministry Admin Panel
> (`apps/admin`), media on Vercel Blob — with **zero visual change** on the public site.
> Per-ticket implementation specs/plans are produced by `/divinelab:work` per child; this doc is
> the architecture + decisions they inherit.
> **Done means:** production serves all content from Mongo; every content type is editable in
> admin by a non-technical editor; `/predica` publishes drafts to Mongo and a human publishes in
> admin; Contentful is decommissioned, backed up, and the subscription cancelled.

---

## 1. Why

- Contentful adds a second platform (env topology, model-migration lanes, alias-swap runbooks,
  drift detection, API keys, webhooks, MCP server, free-tier env quota) for a site with ~11
  content types and a small content set. The admin platform (Firebase-auth + ICR-128 RBAC +
  MongoDB) now exists and is the natural home for content editing.
- The 2024 decision to use Contentful was right for its time; the 2026 platform makes it
  redundant. Removing it deletes ~78 files / ~8,350 LOC, 6 npm deps, 7 env vars, a CI workflow,
  a CSP carve-out, and a whole class of harness gates.
- Product brain promise preserved: "easy for non-technical editors to maintain" — the admin CMS
  is a **full editor experience**, not a developer tool.

## 2. Locked decisions (2026-07-29, with the maintainer)

| #   | Decision                   | Choice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Editor UX bar              | **Full editor UX** — per-type forms, WYSIWYG rich text, media picker, validation, preview links. RBAC gates who edits.                                                                                                                                                                                                                                                                                                                                                                      |
| D2  | Canonical rich-text format | **TipTap/ProseMirror JSON** (constrained node set). One-off converter from Contentful rich text; automated parity diff proves identical rendering.                                                                                                                                                                                                                                                                                                                                          |
| D3  | Publish model              | **Draft→Publish everywhere** (every content type). Admin Publish triggers site revalidation. `/predica` Gate 2 preserved.                                                                                                                                                                                                                                                                                                                                                                   |
| D4  | Cutover strategy           | **Big-bang atomic swap PR** (maintainer's explicit call, re-confirmed). All new code merges PR-by-PR as dormant paths; one small swap PR (getters keep identical signatures) is the cutover; rollback = `git revert` / Vercel instant rollback. No runtime source flag.                                                                                                                                                                                                                     |
| D5  | Media management           | **Central media library** — `media` collection, assets referenced by id, guarded delete. Foundation for finance invoice attachments later.                                                                                                                                                                                                                                                                                                                                                  |
| D6  | Storage provider           | **Vercel Blob for everything.** Public stores (prod + staging) for website media now; ICR-171 §6 (finance attachments) **amended** from Firebase Storage to a **private Blob store** (served through admin functions behind `requirePermission`). Rationale: DivineLab team is Pro (verified 2026-07-29; ~$0.86/mo absorbed by the $20 credit), CDN edge to es-AR, no Blaze/Google billing, one control plane. Lock-in mitigated: **Mongo stores blob `pathname`s, never bare URLs alone.** |
| D7  | Model/code layout          | **Typed collection-per-type** in the `website` DB + shared **`@idcr/content`** package (types/Zod/block registry — no React, no DB code). Rejected: generic `documents` collection (meta-CMS drift); Payload CMS (collides with existing admin auth/RBAC + TipTap).                                                                                                                                                                                                                         |
| D8  | Content database           | **`website` DB** — per the ICR-13 ADR ("split is by sensitivity; `website` = public content + likes + contact (and the future Contentful-replacement content the admin will author)"). Admin writes via its existing `WEBSITE_MONGODB_URI` two-connection model.                                                                                                                                                                                                                            |
| D9  | Version history            | **None** (maintainer's call — history creates confusion). Audit entries (who/when/what action) + `updatedAt/updatedBy` only.                                                                                                                                                                                                                                                                                                                                                                |

## 3. Content model

### 3.1 Envelope (every content document)

```ts
interface ContentDoc<TFields> {
  _id: ObjectId;
  // natural key: `slug` (posts, sermons, topics) or `machineName` (sections, globals, seo, …)
  draft: TFields; // always present — the working copy
  published?: TFields; // snapshot copied from draft on Publish
  publishedAt?: Date; // future date ⇒ "scheduled" (semantics reserved; no scheduler v1)
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string; // admin user id
  sourceContentfulId?: string; // importer idempotency key; dropped at decommission
}
```

- **Status is derived, never stored:** no `published` → _Draft_; `published` deep-equals `draft`
  → _Published_; differs → _Changed_. (Contentful's exact three states.)
- **Localized fields** are maps: `interface Localized<T> { "es-AR": T; "en-US": T }`. es-AR is
  the source of truth; the read layer falls back en-US→es-AR (today's behavior).

### 3.2 Collections (all in `website`; naming matches existing `pdf_jobs`/`broadcast_log` style)

| Collection           | Replaces (Contentful)                                        | Key fields / notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sections`           | `section` (hero/cta/duplex/textBlock via `SECTION_LAYOUT`)   | `machineName`, `kind`, headline, body (TipTap), ctaText, `targetPage` (plain slug string), images                                                                                                                                                                                                                                                                                                                                                                                             |
| `belief_collections` | `contentCollection` + `BeliefItem`                           | items **embedded**: `{title, description (TipTap), bibleVerseId?, kind (BELIEF_KIND), imageId, icon?}` — **`icon` is a new field** (folds in ICR-19's open question; today icons are hardcoded by title)                                                                                                                                                                                                                                                                                      |
| `event_banners`      | `eventBanner` + `eventInfo` + `locationComponent`            | event `{name, dayOfWeek, date, time, note}` + location `{addressLine1, neighborhood, city, country, mapEmbedUrl, googleMapsUrl, lat, lon}` embedded, image                                                                                                                                                                                                                                                                                                                                    |
| `posts`              | `blogPostPage`                                               | slug, title, subtitle, category, featuredImageId, content (TipTap w/ embedded media + post links), authorId, publishedDate, seo fields, relatedPostIds                                                                                                                                                                                                                                                                                                                                        |
| `sermons`            | `sermon`                                                     | slug, title, sermonDate, thesis, mainPoints, excerpt, durationSeconds, content (TipTap w/ `embeddedMedia`), featuredImageId, audioMediaId (**default-locale only**, matching today's `atDefault` audio — the en-US page surfaces the same file with the "audio in Spanish" note), pdfSummaryMediaId (**localized** — two PDFs, es/en), preacherId, additionalPreacherIds, interpreterId?, scriptureRefIds → `bible_verses`, seo fields, relatedSermonIds, **`contentHash`** (feeds PDF regen) |
| `bible_verses`       | `bibleVerse`                                                 | **natural key** `{book, chapter, fromVerse, toVerse}` unique; per-locale `{version, text}` (NVI/NIV). Predica's upsert-by-natural-key dedup survives; reused by sermons + belief items                                                                                                                                                                                                                                                                                                        |
| `authors`            | `author`                                                     | name, avatarMediaId, email?, plus **optional `personId` string** — the cross-DB convention (same as finance's `beneficiary.personId`): other DBs store plain-string ids; **no `$lookup` across DBs, ever** (ICR-13)                                                                                                                                                                                                                                                                           |
| `topics`             | `churchInfoTopic` (privacy policy route `[locale]/[topic]`)  | slug, title, content (TipTap), seo, **`protected: boolean`** — the guardrail replacing `PROTECTED_ENVIRONMENTS` (ICR-142/163 dependency). Enforcement is downgrade-proof: `content:publish-protected` is required when **either** the persisted `published` snapshot **or** the incoming draft is protected, **and changing the `protected` value itself requires the same permission** (else write+publish could flip it off and bypass the gate)                                            |
| `seo_entries`        | `seo`                                                        | machineName, title, description, keywords, imageId, siteName, type                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `globals`            | `navigationMenu`, `footer`, `singleEmailForm`, `contactForm` | 4 singleton docs in one collection, Zod **discriminated union** on `kind`                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `media`              | Contentful assets                                            | **`pathname` (Blob key) is canonical** (the portability key: re-upload by pathname, regenerate URLs) **and the upload result's `url` is persisted alongside it** — the web read layer serves the stored `url` verbatim (it holds no Blob token and must not guess the per-store/per-env public origin); filename, contentType, size, width?, height?, localized title/alt, createdBy/At. Guarded delete refuses while referenced                                                              |

Existing collections evolve: `pdf_jobs.entryId` re-keys from Contentful `sys.id` → sermon `_id`.
Existing untouched: `likes` (slug-keyed — like keys don't change), `contact`, `broadcast_log`.

Indexes: unique natural key per type; `bible_verses` compound natural key; `media.pathname`
unique; `posts`/`sermons` `publishedAt` for listings. (M0 cluster: ~11 new collections is fine;
ICR-157 `maxPoolSize` lands first.)

### 3.3 TipTap document (constrained)

Node set = exactly what renders today: `paragraph`, `heading` (levels 2–3), `blockquote`,
`bulletList`/`orderedList`/`listItem`, `text` with `bold`/`italic` marks, `link`,
`postLink` (entry hyperlink), and custom **`embeddedMedia`** `{mediaId}` (renderer dispatches on
the media doc's contentType: `audio/*` → SermonAudioPlayer, `application/pdf` →
PdfDownloadButton, `image/*` → next/image — mirrors `sermonRichTextOptions.tsx`). Zod validates
the tree; unknown nodes are rejected at write time. The block registry types in `@idcr/content`
provide the typed `Record<blockType, Component>` resolver ICR-20/ICR-36 asked for.

## 4. Architecture & data flows

### 4.1 Read path (apps/web)

```
MongoDB (website) → apps/web/lib/content/get*.ts (SAME signatures/shapes as lib/contentful/get*.ts)
                  → cached via Next cache API with tag "site-content" → RSC pages (unchanged)
```

- `shouldUseDraftMode()` survives verbatim; true → getters read `draft` snapshot, false →
  `published`. Media ids resolve to the exact asset shapes components consume today
  (`{url, title, width, height, contentType, fileName, size}`).
- Cache-tag parity is a **hard requirement** (the one way this migration could regress
  performance): same `site-content` tag, invalidated by the publish flow. Exact Next 16 API
  (`"use cache"` vs `unstable_cache`) verified against current docs at implementation
  (standing rule: verify before integrating).
- Sitemap re-points to Mongo (and gains a real `lastModified`; also fix the blog
  `limit: 100` truncation while there). `lib/contentful/slug.ts` (GraphQL-injection guard) dies.

### 4.2 Write path (apps/admin)

- Services follow the admin patterns verbatim: two-connection model (`getContentDb()`), Zod
  parses every doc as untrusted, memoized `ensureIndexes`, discriminated-union results (no
  throw-for-control-flow), **new `withContentTransaction`** (twin of `withAdminTransaction`,
  bound to the website client) — required because the audit contract (`appendAuditEntry`
  requires a `ClientSession`) must hold for content mutations. Content audit entries go to a
  `content_audit` collection in `website` (same shape as `rbacAudit`).
- **New RBAC keys** (ICR-128 registry append): `content:read`, `content:write`,
  `content:publish`, `content:publish-protected`, `media:manage`. **Plus an explicit role-grant
  migration**: `seedSystemRoles()` seeds permissions with `$setOnInsert`
  (`apps/admin/src/service/role.service.ts:115-132`), so appending registry keys grants nothing
  to existing role docs — C2 ships a one-time grant adding all five keys to the stored Admin
  role (other roles receive keys via the roles UI, per ICR-128's model).
- **Publish flow** = one transaction (copy `draft`→`published`, set `publishedAt`, audit entry)
  then `POST <site>/api/revalidate` (existing secret header) with `{type, id}` → the site
  revalidates `site-content` **and** runs `notifyOnPublish` (email broadcast — re-keyed from
  Contentful entry ids to Mongo ids; `broadcast_log` idempotency keys on the Mongo `_id`).
  Future Facebook fan-out (ICR-43) subscribes at this same point. This structurally replaces
  the (currently broken) Contentful webhook.
- **Preview:** no iframe/live-preview machinery. Dev/preview/staging render drafts (unchanged
  gate); admin entries get "View draft" deep links (staging URL for slugged types; the prod
  draft-mode route `/api/draft/enable` survives with a renamed secret). Contentful Live Preview
  deletes wholesale (provider, hook, 5 `*Live` wrappers, 13 `inspectorProps` sites,
  `mapContentCollection`, CSP `frame-ancestors` carve-out) — ICR-188's `frame-ancestors 'none'`
  for admin stays valid.

### 4.3 Media (Vercel Blob)

- Two **public** stores: prod + staging (separate content per env; staging is the QA
  playground). Admin uploads via client-upload (`upload()` + `handleUpload` with
  `onBeforeGenerateToken` → `requirePermission("media:manage")`) — required anyway because
  server uploads cap at 4.5 MB. Predica scripts upload directly from local Node via
  `BLOB_READ_WRITE_TOKEN` (no function in the path, no size cap; multipart >100 MB).
- `apps/web` never writes blobs — no token there. CSP: add the Blob host to `img-src` +
  `media-src` (directive exists — currently lists the three ctfassets hosts) and
  `next.config.ts` `images.remotePatterns`; **ctfassets hosts stay until decommission**.
- OG/social note (accepted): media URLs live on a vendor host either way (ctfassets today,
  `*.public.blob.vercel-storage.com` after); platforms re-scrape on URL change.

### 4.4 Predica re-target (1:1 script swap; pipeline contract unchanged)

Contentful-free half untouched: transcribe → Gate 1 → voice-coach → writer (`sermon.json`) →
PDF build → featured image → WhatsApp. Coupled half replaced:

| Today (CMA)                                                         | New (Mongo + Blob)                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `build-sermon-entry.mjs` + `sermonEntry.ts` twin                    | `build-sermon-doc` builder (same twin-parity pattern + parity test; a tsx-runner design-away is an open question)                                            |
| `upload-contentful-asset.mjs`                                       | `upload-blob-asset.mjs` (local direct put; writes the `media` doc)                                                                                           |
| `create-contentful-entry.mjs` (`--upsert-by-internal-name`, `--id`) | `upsert-sermon.mjs` — verses upsert by natural key; update-in-place by id; **DB-name positive allowlist; writes `draft` only — structurally cannot publish** |
| `delete-contentful.mjs` (`--guard-referenced`)                      | `delete-content.mjs` — reference guard via `media` usage check                                                                                               |
| Gate 0 via Contentful `search_entries`                              | Gate 0 via Mongo slug+sermonDate lookup                                                                                                                      |
| Gate 2 "review + Publish in Contentful"                             | Gate 2 "review draft on staging → **Publish in admin**"                                                                                                      |

`predica-publisher` agent + `/predica` command + `.claude/config.json` `predica` block rewritten;
**no legacy Contentful references remain in the harness** (maintainer requirement). Voice
profiles, transcriber, writer, whatsapp agents: light edits or none.

### 4.5 PDF regen (ICR-114 subsystem evolves)

Keep: `pdf_jobs` queue + claim/lock pattern, cron worker, `renderSermonPdf` + serverless
Chromium (`@sparticuz/chromium` + `playwright-core`; ICR-143's tracing fix stays load-bearing —
finance PDF export reuses it). Change: trigger becomes **in-process `markDirty`** from the admin
sermon-save when `contentHash` changes (the 90s debounce existed for Contentful's per-keystroke
auto-save; a form save is discrete); worker reads Mongo drafts, uploads the PDF to Blob, swaps
`pdfSummaryMediaId`, and the delete guard becomes "never delete a pathname the `published`
snapshot references". Delete: `contentfulWriteBack.ts` + the regen webhook route.

## 5. Migration, parity, cutover, decommission

### 5.1 Importer (committed, idempotent, re-runnable)

Reads Contentful CDA (published) + CPA (drafts), both locales → downloads every asset → uploads
to Blob under deterministic pathnames → writes `media` docs → converts rich text to TipTap
(rewriting embedded-asset nodes to `mediaId`) → upserts content docs keyed by
`sourceContentfulId`. Entry-state mapping: published→both snapshots; changed→published version +
newer draft; draft-only→draft. Runs: `website-staging` early (seeds admin QA), prod `website`
at cutover (re-run = fresh snapshot — that's the freeze story). Contentful returns
protocol-relative URLs from CMA vs absolute from CDA — importer normalizes.

### 5.2 Parity harness ("no visual change" is an AC, not a hope)

Route inventory = static routes × 2 locales + every post/sermon/topic slug × locales. Checks:
(a) normalized DOM diff per route, Contentful-source vs Mongo-source deployment, with exactly
one allowlisted diff class (media host ctfassets→Blob); (b) Playwright screenshot diffs on key
pages. Report attaches to the swap PR. Env prerequisite: the swap PR gets branch-scoped
`MONGODB_URI` (previews don't carry it — ICR-44 lesson) pointed at the seeded staging DB.

### 5.3 Cutover runbook (human-executed; own `deferred-prod-action` ticket)

1. Staging seeded; editors QA'd against staging; parity green on the swap-PR preview.
2. **Content freeze** (scheduled between Sundays; predica paused).
3. Final importer run against prod DB. Re-run parity.
4. Merge the swap PR → staging + prod cut over on deploy → smoke prod (pages, likes, sitemap,
   OG, audio playback) — reuse ICR-123's verification checklist.
5. Next sermon flows through re-targeted predica; publishing happens in admin from then on.
6. Rollback — honest window, not "at any point": `git revert` of the swap PR is clean **until
   the first post-cutover publish** (Contentful is untouched and current as of the freeze).
   After that, Mongo and Contentful diverge — prefer **fix-forward**; if a revert is truly
   needed, first re-key the post-cutover publications back into Contentful by hand (small N —
   typically one sermon) or accept losing them. No dual-write machinery — deliberate
   simplicity at this content volume.
7. Bake ~1–2 weeks → decommission.

### 5.4 Decommission (post-bake)

Deletes ~78 files / ~8,350 LOC: `apps/web/lib/contentful/` (27 files), Live Preview set,
`contentfulWriteBack` + regen webhook, 4 CMA predica scripts + `update-content-type.mjs`,
`apps/web/scripts/contentful/` (25 files), `.github/workflows/contentful-drift.yml`, 6 deps
(`@contentful/live-preview`, `rich-text-{react-renderer,types,plain-text-renderer}`,
`contentful-management`, `contentful-migration`), 7 `CONTENTFUL_*` env vars (code +
`turbo.json` + Vercel dashboards ×3 tiers), ctfassets CSP hosts + `remotePatterns`, the
Contentful MCP server (`.mcp.json`, `.claude/settings.local.json` allowlist), `.claude/config.json`
`contentful` block + 2 strays (`sensitivePaths` fetch.ts glob, `playwrightProjectMap` key) +
`predica` block rewrite, CLAUDE.md "Contentful model-change gate". Secrets renamed:
`CONTENTFUL_PREVIEW_SECRET`/`CONTENTFUL_REVALIDATE_SECRET` → content-neutral names.
Docs: retire 5 wholesale (1,302 lines), rewrite 5 (incl. `docs/product/content-types.md` as the
new model doc; `predica-bibleverse-reuse.md`/`predica-rerun-idempotency.md` re-grounded), ~25
light edits; `contentful-model-audit.md` is already stale (describes deleted `getPage`).

**Human-gated legal/account items (each its own ticket):**

- **Privacy policy republish** — published copy (both locales) names Contentful as a processor
  and explains its CDN serves sermon media; post-cutover it needs leadership-approved edits,
  published via the new **protected-topic** flow. (Separate from the ICR-163 NOW-fix.)
- **Contentful cancellation** — cold export backup archived → space deleted → subscription
  cancelled. Last step; the epic is not Done before it.

## 6. Epic children (16)

| #   | Title (short)                                                                                                                               | Type  | Component | Depends on      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------- | --------------- |
| C1  | `@idcr/content`: model + Zod + TipTap schema + block registry                                                                               | Task  | Shared    | —               |
| C2  | Admin content DB foundation: `withContentTransaction`, content audit, RBAC keys, CRUD/publish services + revalidate call                    | Story | Admin     | C1, **ICR-153** |
| C3  | Media foundation: Blob stores + storage service + client uploads + media library UI                                                         | Story | Admin     | C1, C2          |
| C4  | Admin CMS shell: "Contenido" nav, list views, status badges, publish/delete, view-draft links                                               | Story | Admin     | C2              |
| C5  | Editors: sections, globals, SEO entries, event banners, belief collections (+ `icon`)                                                       | Story | Admin     | C3, C4          |
| C6  | Editors: posts + topics (TipTap, author picker, related posts, protected-publish)                                                           | Story | Admin     | C3, C4          |
| C7  | Editor: sermons (verse natural-key picker, media attach) + PDF-regen re-key/in-process trigger                                              | Story | Admin     | C3, C4          |
| C8  | Web read layer: `lib/content/` getters (same shapes) + cache tags + draft logic (dormant)                                                   | Task  | Website   | C1              |
| C9  | TipTap renderer (DOM parity incl. library defaults) + Contentful→TipTap converter + fixture corpus                                          | Task  | Website   | C1              |
| C10 | Importer + parity harness + staging seed                                                                                                    | Task  | Infra     | C1, C3, C8, C9  |
| C11 | Predica re-target (builders, blob upload, draft-only upsert, Gate 0/2, agent + command + config)                                            | Task  | Website   | C1, C3, C10     |
| C12 | **Atomic swap PR** (cutover): getter imports, sitemap, metadata, `notifyOnPublish` re-key, Live Preview deletion, CSP updates, final parity | Story | Website   | C8–C11, C13     |
| C13 | Cutover + provisioning runbook (stores, env per tier + swap-PR branch env, freeze, smoke, rollback, bake)                                   | Task  | Infra     | — (prep early)  |
| C14 | Decommission (delete + purge + docs + secret renames + harness/config updates)                                                              | Task  | Shared    | C12 + bake      |
| C15 | Privacy-policy republish (leadership copy, both locales, protected flow)                                                                    | Task  | Website   | C12             |
| C16 | Contentful backup → space deletion → cancellation (human-only)                                                                              | Task  | Infra     | C14, C15        |

**Blockers linked (not children):** ICR-153 (db-name hardcode — must land before any content
write path; staging/preview currently point at prod DB), ICR-157 (`maxPoolSize`), ICR-187 +
ICR-169 (admin staging domain + QA wiring — the editors are heavy UI needing real browser QA),
ICR-186 (worktree `.env.local` papercut, compounds during this epic).

**Suggested QA depth:** heavy for C2/C3/C6/C7/C12 (DB writes, uploads, publish/legal flow,
cutover); standard otherwise; C13/C15/C16 are runbook/human tickets.

**Sensitive areas by child:** `env-secrets` (C2/C3/C11/C13/C14), `csp-headers` (C3/C12/C14),
`likes-mongo`/DB-write-path (C2/C3/C7/C10/C11), `i18n-messages` (C4–C7 admin strings, both
locales), auth/roles (C2 RBAC keys), legal copy (C15). Email fan-out re-key (C12) touches
`email-services`.

## 7. Backlog sweep (PM-executed, human-gated per batch)

| Disposition                                         | Issues                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rewrite to target the new platform                  | ICR-96 (epic → "Page builder on the content platform") + children ICR-19 (fold `icon` note), ICR-20 (block-registry — merge ICR-36's resolver bullet), ICR-24, ICR-40; ICR-25 (verse-fetch inside the editor); ICR-43 (publish-event subscriber — drop all webhook design); ICR-45 (same-DB aggregation); ICR-165 (multi-audio on the block model) |
| Amend storage decision                              | ICR-171 (§6 Firebase → private Blob store), ICR-177, ICR-180                                                                                                                                                                                                                                                                                       |
| Wording touch-ups                                   | ICR-9, ICR-10, ICR-22, ICR-26, ICR-32, ICR-33, ICR-35, ICR-38 (park note), ICR-41, ICR-97, ICR-98, ICR-161                                                                                                                                                                                                                                         |
| Flag comments                                       | ICR-188 (frame-ancestors assumption vs future preview), ICR-142 (guardrail → `content:publish-protected` dependency)                                                                                                                                                                                                                               |
| Propose to close (human clicks)                     | ICR-2, ICR-31, ICR-42, ICR-34 (clause lifted into C2/C8), ICR-36 (dissolved into C1/ICR-20/ICR-153), ICR-14 (empty), ICR-10 (if its last child moves)                                                                                                                                                                                              |
| **Act NOW, before the epic (human, in Contentful)** | **ICR-163** — execute the privacy-policy correction runbook today (live legal exposure); **ICR-100** — fix the "Comunity" typo so it isn't migrated                                                                                                                                                                                                |

In-flight (ICR-115/116/123/126/143): finish as-is; no edits. ICR-123's checklist is reused by
C13; ICR-143's fix is load-bearing for C7/C12 and later finance PDFs.

## 8. Open questions (recorded, non-blocking)

1. **D-7 events projection:** when ICR-130 (admin Activities) ships, decide whether an Activity
   gains `publishToWebsite` (projecting a public event doc into `website`) or website
   `event_banners` stay manually edited. Not needed for this epic.
2. **Scheduled publishing:** out of scope; `publishedAt` semantics reserved so it's a feature
   later, not a data migration.
3. **Twin-parity design-away:** the `.mjs`/TS duplication (forced by `apps/web` as Vercel Root
   Directory) could be eliminated with a tsx-based script runner; C11 may propose it.
4. **Facebook fan-out (ICR-43):** post-migration feature; the publish event is its hook.

## 9. References

- Inventory (2026-07-29, this session): read path 27 files/2,557 LOC; rich text = the pivot
  (generated, stored, re-parsed, hashed, rendered ×8 + PDF); writers = 5 CMA scripts + 1 in-app
  service + sync/migrations/MCP; full estimate table (~75 changed / ~78 deleted / ~8,350 LOC).
- Jira scan (2026-07-29): 92 open issues; 34 editable Contentful-touching; dispositions above;
  upfront capabilities D-1…D-12 (all absorbed into this design).
- Storage research (2026-07-29): Vercel Pro verified; Blob vs Firebase facts + cost model;
  sources with dates in the session log.
- ADRs/docs this design leans on: ICR-13 (DB split by sensitivity), `docs/architecture/`
  `admin-database.md`, `admin-rbac.md`, `admin-auth.md`, `likes-and-mongodb.md`,
  `contentful-data-layer.md` (as the to-be-replaced spec of record).
