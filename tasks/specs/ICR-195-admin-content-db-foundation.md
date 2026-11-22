# ICR-195 — Admin Content DB Foundation: Content Services, Transactions, Audit, RBAC Keys

> **Status:** Approved (PM Part A+B resolved #47/#50; Owner approved Q2 = Option A & Q3 = Option A #117; C1–C3 validation fixes committed at `e6b2b39`).
> **Worktree:** `.claude/worktrees/ICR-195` · **Branch:** `feat/ICR-195-admin-content-db-foundation` (base: `origin/main` @ `841b97b`, start commit `959b0e3`)
> **QA Depth:** `heavy` (recommended by issue; Linear default `standard`) · **QA Type:** `chore` (service-level + DB inspection on staging; no admin UI screens until `ICR-197`)
> **Sensitive Areas:** `auth/roles` (new permission keys + Admin role-data migration), `db-write-path` (`website*` transactions + indexes + guarded writes), `env-secrets` (new server-only env var names — never values), `email-services` (`CONTENT_PUBLISH_EMAILS` global switch + `notify` flag on publish; no web email code edited here)

---

## 1. Dependencies Check

| Dependency                              | Status                                      | Impact on ICR-195                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ICR-194` (`@idcr/content`)             | Draft PR #140 (`2d3b053`), in validation    | **Hard blocker for code.** Supplies `COLLECTIONS`, `ContentDoc<TFields>`, `CONTENT_TYPES`, `CONTENT_SCHEMAS` (`draft`/`publishable`/`update`, Zod 4), `extractReferences`, `REFERENCE_PATHS`, `FIXED_ENTRIES`, `canonicalEqual`, `deriveStatus`, `bibleVerseKey`, `isValidSlug`, and bumps `apps/admin` to `zod ^4.6.7` + adds `@idcr/content` to `apps/admin/package.json` & `next.config.ts`. Spec verified read-only against `.claude/worktrees/ICR-194/packages/content/src/`. |
| `ICR-223` (QA staging DB read)          | Draft PR #139 (`2e047ee`), in validation    | **Hard blocker for QA/start.** Provides read-only staging DB inspection for `website-staging` and `ministry-admin-staging`.                                                                                                                                                                                                                                                                                                                                                        |
| `ICR-214` (MongoDB Node driver `7.9.0`) | **Merged** (#134, in `origin/main`)         | Satisfied. `apps/admin` already runs `mongodb@^7.9.0`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ICR-222` (QA standing Admin sign-in)   | **Merged** (#135, in `origin/main`)         | Satisfied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `ICR-153` (Website DB name guard)       | Done / stale link (shipped in ICR-143 #121) | Satisfied. `apps/admin/src/service/database.service.ts` already ships `getContentDb()` + `assertWebsiteDbName()`.                                                                                                                                                                                                                                                                                                                                                                  |
| **Pre-QA human check**                  | Pending (`ICR-206`)                         | Confirm admin Preview/staging `WEBSITE_MONGODB_URI` resolves to `website-staging` and the shared website Atlas user holds `readWrite` + `createIndex` + multi-document transaction capability on `website-staging`.                                                                                                                                                                                                                                                                |
| **Blocks**                              | `ICR-196`, `ICR-197`                        | `ICR-196` reuses `withContentTransaction`, `appendContentAuditEntry`, and `findMediaUsages`. `ICR-197..200` and `ICR-204` consume the content services, error contract, and RBAC keys.                                                                                                                                                                                                                                                                                             |

**Deferred production actions (for `ICR-206` runbook):**

1. Run `pnpm --filter @idcr/admin grant:content-permissions` against `ministry-admin-staging` and `ministry-admin`.
2. Configure `WEBSITE_REVALIDATE_URL` and `WEBSITE_REVALIDATE_SECRET` in Vercel (`idc-redentor-admin`) per environment (`https://staging.idcredentor.org` for Preview/staging, `https://www.idcredentor.org` for Production; secret matching web's `CONTENTFUL_REVALIDATE_SECRET` until decommission).
3. Leave `CONTENT_PUBLISH_EMAILS` unset / `"false"` (off by default) until the post-cutover follow-up ticket enables subscriber emails.

---

## 2. Requirements

1. **Content transaction helper (`withContentTransaction`).** Add `withContentTransaction<T>(fn)` in `apps/admin/src/service/database.service.ts` as the website-client twin of `withAdminTransaction`, asserting `getContentDb()` (fail-closed `WEBSITE_DB_NAME_PATTERN` allowlist) before starting the `ClientSession`. Every read/write inside `fn` MUST pass `{ session }` and execute sequentially; zero external I/O (HTTP fetch, email) inside `fn`; refusals call `await session.abortTransaction()` and return discriminated results.
2. **Compact content audit (`appendContentAuditEntry`).** Implement `apps/admin/src/service/content-audit.service.ts` bound to `getContentDb()` and collection `content_audit` (NEVER `appendAuditEntry`, which is bound to `getAdminDb()` and throws `ClientSession must be from the same MongoClient` on a website session). `session` is required; `at` is stamped server-side; entries record `{ actorId, actorLabel, actorKind, action, collection, docId, naturalKey?, changedFields[], revision, meta? }` — **never** full before/after document snapshots (Atlas M0 0.5 GB cap).
3. **RBAC permission keys & bilingual i18n.** Append 5 keys to `PERMISSIONS` (`15 → 20`): `content:read`, `content:write`, `content:publish`, `content:publish-protected`, `media:manage`. Add `label` + `description` for all 5 keys plus `permissions.groups.content` and `permissions.groups.media` in both `apps/admin/messages/es-AR.json` and `apps/admin/messages/en-US.json`. Update `permissions.test.ts` (count `15 → 20`, action-segment regex allowing kebab-case `/^[a-z]+:[a-z]+(?:-[a-z]+)*$/`) and `messages.test.ts` (group list `6 → 8`). `LEADER_PERMISSIONS` and `MEMBER_PERMISSIONS` remain unchanged.
4. **Idempotent Admin role grant script.** Ship pure testable logic (`apps/admin/src/lib/rbac/grant-content-permissions.ts`) + human-run CLI (`apps/admin/scripts/grant-content-permissions.ts`, npm script `grant:content-permissions`), mirroring `seed:admin`'s safety guards (refuse `CI`, print redacted cluster host + resolved DB name, interactive `[y/N]` TTY prompt unless `--yes`/`--dry-run`, single JSON line on stdout). Inside `withAdminTransaction`, applies `$addToSet: { permissions: { $each: CONTENT_PERMISSION_KEYS } }` on `{ key: "admin" }` ONLY, and writes ONE `rbacAudit` `role.update` entry ONLY when `modifiedCount > 0`.
5. **Permission enforcement at every service entry point.** Every content service function accepts a `ContentCaller` (either an authenticated `AdminUser` via `callerFromAuthorized(authz)` or a scoped `ServiceContentCaller` such as `predica-ingest`) and checks the required permission(s) before any DB write.
6. **Optimistic locking & no-op unchanged saves.** Every editor mutation (`saveDraft`, `publishContent`, `unpublishContent`, `discardChanges`, `deleteContent`) accepts `expectedRevision` and includes `{ revision: expectedRevision }` in its atomic MongoDB update/delete filter unless `overwrite: true`. Mismatch writes nothing and returns `{ ok: false, reason: "conflict", updatedBy, updatedByLabel?, updatedAt, currentRevision }`. In `saveDraft`, compare patch fields against `existing.draft` via `canonicalEqual`; if `changedFields.length === 0`, write nothing (no revision bump, no audit entry) and return `{ ok: true, ..., noOp: true }`. Only changed fields are validated via `CONTENT_SCHEMAS[concreteType].update` and written via `$set`/`$unset` (never serializing `undefined` to BSON `null`). For `globals`, `saveDraft` resolves `concreteType` from `existing.draft.kind` (`navigationMenu` | `footer` | `singleEmailForm` | `contactForm` | `location`) before validating `.update` and calling `extractReferences`, so fields from another global kind can never slip through.
7. **Server-owned identity & index fields.** `_id`, `revision`, `createdAt`, `updatedAt`, `updatedBy`, `updatedByLabel`, `publishedAt`, `firstPublishedAt`, `_naturalKey`, and `_refs` are always constructed server-side and never trusted from caller input. Every write recomputes `_refs = extractReferences(type, { draft, published })` across both snapshots and both locales.
8. **Publish validation, timestamps & atomic cascade publish.** `publishContent`:
   - If `draftPatch` is supplied, saves draft first (`F` §2.4) so strict-publish failure still preserves the editor's draft (`F` §2.5).
   - Inside one `withContentTransaction`: validates `draft` against `CONTENT_SCHEMAS[concreteType].publishable`; copies `draft` → `published`; sets `publishedAt = now` and sets `firstPublishedAt = now` ONLY when unset (`undefined`); cascades publish to all **never-published** (`published === undefined && firstPublishedAt === undefined`) referenced `authors` and `bible_verses` in the same transaction (each strictly validated and audited with `content.cascade-publish`; any invalid or missing target aborts the entire transaction).
9. **Downgrade-proof protected publishing.** Protected entries = ALL `belief_collections` (by type) + any `topics` doc where `existing.published?.protected === true` OR `existing.draft.protected === true` OR incoming `patch.protected === true`. Without `content:publish-protected`:
   - `publishContent`, `unpublishContent`, and `deleteContent` on protected entries are refused (`forbidden`).
   - `createContent` for a `topic` with `protected: true` is refused (`forbidden`).
   - `saveDraft` changing `protected` in **either** direction (`true → false/undefined` OR `false/undefined → true`) is refused (`forbidden`), closing the flip-off-then-publish bypass.
   - `saveDraft` editing other fields, preview (`content:read`), and `discardChanges` (`content:write`) remain allowed.
   - Successful protected publishes record `action: "content.publish-protected"` in `content_audit`.
   - Both locales (`es-AR` + `en-US`) are required at publish (enforced by `@idcr/content`'s `beliefCollectionPublishableSchema` and `topicPublishableSchema`).
10. **Server-enforced fixed-entry, reference & structural guards (`F` §6).**
    - Fixed entries (`sections`, `belief_collections`, `event_banners`, `seo_entries`, `globals`): refuse `create`, `unpublish`, `delete`; refuse edits to unregistered `machineName`; filter `listContent` to `isRegisteredFixedEntry(type, doc.draft.machineName)` and return `not-found` from `getContentById` / `getContentByNaturalKey` for any unregistered DB entry (`F` §2.8); refuse mutations to `machineName`, `section.layout`, `global.kind`, and `contactForm.fields` structural properties (`inputId`, `type`, `required`, array length, order).
    - `unpublishContent`: allowed only for `posts`, `sermons`, `topics`; refused if any other **published** entry references this entry in its `published` snapshot (`reason: "in-use"`). Never clears `firstPublishedAt`.
    - `deleteContent`: refused for fixed entries; refused for **published** `posts`, `sermons`, `topics` (`reason: "published-must-unpublish"`); refused if referenced by any other entry in `draft` OR `published` across either locale (`reason: "in-use"`, returning `usedBy[]`).
    - Background PDF write helper (`updateSermonPdfMedia`, `ICR-200` AC4–AC6): inside `withContentTransaction`, verifies `draft.contentHash === expectedContentHash` before updating `draft.pdfSummaryMediaId` and `published?.contentHash === expectedContentHash` before updating `published.pdfSummaryMediaId`; recomputes `_refs` in the same transaction; returns `previousMediaIds: string[]` (superseded PDF media ids no longer referenced by draft or published); appends a `content_audit` entry (`action: "content.pdf-update"`, `actorKind: "service"`, `changedFields: ["pdfSummaryMediaId"]`) **without** incrementing `revision` and **without** overwriting human `updatedBy`/`updatedByLabel`; triggers post-commit `revalidateWebsite({ type: "sermon", id: docId, notify: false })` **only** when `updatedPublished === true` (`F` §2.3, §2.10).
11. **Post-commit site refresh & environment guard.** After `publishContent`, `unpublishContent`, and `deleteContent` (when `wasPublished === true`) commit:
    - Call `POST <WEBSITE_REVALIDATE_URL>/api/revalidate` with header `x-vercel-reval-key: <WEBSITE_REVALIDATE_SECRET>` and JSON body `{ type, id, notify }` **outside** `withContentTransaction`.
    - Fail closed when `WEBSITE_REVALIDATE_URL` or `WEBSITE_REVALIDATE_SECRET` is unset or invalid; NEVER read `NEXT_PUBLIC_WEBSITE_URL`.
    - Whenever `process.env.VERCEL_TARGET_ENV !== "production"`, refuse any target host in `PRODUCTION_WEBSITE_HOSTS` (`idcredentor.org`, `www.idcredentor.org`, `idcredentor.com`, `www.idcredentor.com`, `idc-redentor-web.vercel.app`, `idc-redentor-website.vercel.app`, normalized lowercase without trailing dot).
    - On fetch/config failure, the DB commit stands and the service returns `{ ok: true, ..., revalidated: false, revalidateReason }`. Provide `retryRevalidation(caller, collection, docId)` for the UI "Reintentar" button (`notify: false`).
12. **Global publish-email switch.** `notify: true` is sent to `/api/revalidate` ONLY when ALL four hold: (a) `process.env.CONTENT_PUBLISH_EMAILS === "true"`, (b) caller passed `notify: true`, (c) `collection === "posts" || collection === "sermons"`, and (d) `isFirstPublish === true` (`firstPublishedAt` was unset prior to this publish). Saving a draft never sets `notify` or calls `/api/revalidate`.

---

## 3. Data Model Changes

### 3.1 Stored Document Envelope (`website*` DB)

Each of the 10 enveloped content collections (`sections`, `belief_collections`, `event_banners`, `seo_entries`, `globals`, `posts`, `sermons`, `topics`, `authors`, `bible_verses`) stores:

```ts
export interface StoredContentEnvelope<TFields> {
  _id: ObjectId;
  draft: TFields;
  published?: TFields;
  publishedAt?: Date;
  firstPublishedAt?: Date;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: string;
  updatedByLabel?: string;
  sourceContentfulId?: string;
  /** Server-owned derived natural key (`bible_verses`: `bibleVerseKey(...)`). Omitted when incomplete in draft. */
  _naturalKey?: string;
  /** Server-owned reference index computed by `extractReferences()` across draft + published, both locales. */
  _refs: ExtractedReferences; // { mediaIds: string[]; contentRefs: ContentReference[] }
}
```

When returned to callers, documents are mapped to `@idcr/content`'s `ContentDoc<TFields>` (`_id: doc._id.toHexString()`, stripping `_naturalKey`/`_refs` internal fields) plus optional `updatedByLabel` metadata.

### 3.2 `content_audit` Collection (`website*` DB)

```ts
export type ContentAuditAction =
  | "content.create"
  | "content.save"
  | "content.publish"
  | "content.publish-protected"
  | "content.cascade-publish"
  | "content.unpublish"
  | "content.discard"
  | "content.delete"
  | "content.pdf-update"
  | "media.create"
  | "media.update"
  | "media.delete";

export interface ContentAuditMeta {
  readonly overwrite?: boolean;
  readonly notifyRequested?: boolean;
  readonly notifySent?: boolean;
  readonly cascadedFrom?: {
    readonly collection: CollectionName;
    readonly docId: string;
  };
  /** Optional future-proof field if owner later enables the protected-publish approval tick. */
  readonly approvedConfirmed?: boolean;
}

export interface ContentAuditEntry {
  _id: ObjectId;
  at: Date;
  actorId: string;
  actorLabel: string;
  actorKind: "user" | "service";
  action: ContentAuditAction;
  collection: CollectionName;
  docId: string;
  naturalKey?: string;
  changedFields: string[];
  revision: number;
  meta?: ContentAuditMeta;
}
```

### 3.3 MongoDB Indexes (`ensureContentIndexes` & `ensureContentAuditIndexes`, memoized per collection)

| Collection                                 | Indexes                                                                                                                                                                                                                                                                           | Rationale                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `sections`, `event_banners`, `seo_entries` | `{ "draft.machineName": 1 }` (unique), `{ "published.machineName": 1 }` (unique, partial `$type: "string"`), `{ "_refs.mediaIds": 1 }`                                                                                                                                            | Fixed-entry lookup + media delete guard                                       |
| `belief_collections`, `globals`            | Same as above + `{ "_refs.contentRefs.collection": 1, "_refs.contentRefs.id": 1 }`                                                                                                                                                                                                | Also references `bible_verses`                                                |
| `posts`                                    | `{ "draft.slug": 1 }` (unique, partial `$type: "string"`), `{ "published.slug": 1 }` (unique, partial `$type: "string"`), `{ "published.publishedDate": -1 }`, `{ updatedAt: -1 }`, `{ "_refs.mediaIds": 1 }`, `{ "_refs.contentRefs.collection": 1, "_refs.contentRefs.id": 1 }` | Slug uniqueness (optional in draft), list sort by `publishedDate`, ref guards |
| `sermons`                                  | `{ "draft.slug": 1 }` (unique, partial `$type: "string"`), `{ "published.slug": 1 }` (unique, partial `$type: "string"`), `{ "published.sermonDate": -1 }`, `{ updatedAt: -1 }`, `{ "_refs.mediaIds": 1 }`, `{ "_refs.contentRefs.collection": 1, "_refs.contentRefs.id": 1 }`    | Slug uniqueness, list sort by `sermonDate`, ref guards                        |
| `topics`                                   | `{ "draft.slug.es-AR": 1 }`, `{ "draft.slug.en-US": 1 }`, `{ "published.slug.es-AR": 1 }`, `{ "published.slug.en-US": 1 }` (all unique, partial `$type: "string"`), `{ updatedAt: -1 }`, `{ "_refs.mediaIds": 1 }`                                                                | Localized slug uniqueness across both locales                                 |
| `bible_verses`                             | `{ _naturalKey: 1 }` (unique, partial `$type: "string"`), `{ updatedAt: -1 }`                                                                                                                                                                                                     | Version-scoped compound key (`bibleVerseKey`)                                 |
| `authors`                                  | `{ "draft.name": 1 }`, `{ "_refs.mediaIds": 1 }`                                                                                                                                                                                                                                  | Sort/search + avatar media guard                                              |
| `content_audit`                            | `{ at: -1 }`, `{ collection: 1, docId: 1, at: -1 }`, `{ actorId: 1, at: -1 }`                                                                                                                                                                                                     | Audit history per entry and per actor                                         |

### 3.4 RBAC Migration (`ministry-admin*` DB)

- `roles` document with `{ key: "admin" }`: `$addToSet: { permissions: { $each: ["content:read", "content:write", "content:publish", "content:publish-protected", "media:manage"] } }` via `grant:content-permissions`.
- No schema change to `Role`, `AdminUser`, or `RbacAuditEntry`.
- No Contentful model changes.

---

## 4. Service & API Contracts (Error-Handling Contract)

No new HTTP routes or Server Actions in `ICR-195` (UI arrives in `ICR-197`, media upload route in `ICR-196`, predica ingest route in `ICR-204`). All mutations expose one unified discriminated-union contract (never throwing for business-rule refusals):

### 4.1 Caller Context

```ts
export interface UserContentCaller {
  readonly kind: "user";
  readonly userId: string;
  readonly email: string;
  readonly displayName?: string;
  readonly permissions: ReadonlySet<PermissionKey>;
}

export interface ServiceContentCaller {
  readonly kind: "service";
  readonly serviceId: string;
  readonly label: string;
  readonly permissions: ReadonlySet<PermissionKey>;
}

export type ContentCaller = UserContentCaller | ServiceContentCaller;
```

Helper: `callerFromAuthorized(authz: Authorized): UserContentCaller` bridges `requirePermission` / `requireActionPermission` directly into content services.

### 4.2 Unified Failure Contract (`ContentFailure`)

```ts
export interface ContentReferenceUsage {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly label: string;
  readonly isPublished: boolean;
}

export type RevalidateFailureReason =
  | "not-configured"
  | "misconfigured-url"
  | "production-host-blocked"
  | "http-error"
  | "network-error";

export type ContentFailure =
  | {
      readonly ok: false;
      readonly reason: "forbidden";
      readonly requiredPermission: PermissionKey;
    }
  | { readonly ok: false; readonly reason: "not-found" }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly fieldErrors: Record<string, string[]>;
    }
  | {
      readonly ok: false;
      readonly reason: "conflict";
      readonly updatedBy: string;
      readonly updatedByLabel?: string;
      readonly updatedAt: Date;
      readonly currentRevision: number;
    }
  | {
      readonly ok: false;
      readonly reason: "duplicate-key";
      readonly field: string;
      readonly fieldErrors: Record<string, string[]>;
    }
  | {
      readonly ok: false;
      readonly reason: "operation-not-allowed";
      readonly detail: "fixed-entry" | "library-entry" | "immutable-field";
      readonly field?: string;
    }
  | {
      readonly ok: false;
      readonly reason: "in-use";
      readonly usedBy: readonly ContentReferenceUsage[];
    }
  | { readonly ok: false; readonly reason: "published-must-unpublish" }
  | { readonly ok: false; readonly reason: "nothing-to-discard" }
  | { readonly ok: false; readonly reason: "not-published" };
```

### 4.3 Service Entry Points & Permission Matrix

| Function                                                                                                                | Required permission(s)                                                                                                                                                                          | Result (`ok: true`)                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getContentById(caller, collection, docId)`                                                                             | `content:read`                                                                                                                                                                                  | `{ ok: true; doc: ContentDoc<T>; status: ContentStatus; updatedByLabel?: string }` (returns `not-found` for unregistered fixed entries)                                                                                                                                                                                                                                                                             |
| `getContentByNaturalKey(caller, collection, key)`                                                                       | `content:read`                                                                                                                                                                                  | Same as above; per-collection `key` shape: fixed collections → `string` (`machineName`, filtered by `isRegisteredFixedEntry`), `posts`/`sermons` → `string` (`draft.slug`), `bible_verses` → `string \| BibleVerseKeyInput` (`_naturalKey`), `topics` → `{ readonly locale: Locale; readonly slug: string }` (queries `draft.slug.${locale}`). `authors` has no natural key (use `getContentById` / `listContent`). |
| `listContent(caller, collection, options?)`                                                                             | `content:read`                                                                                                                                                                                  | `{ ok: true; items: ContentListItem<T>[]; total: number }` (fixed collections filtered through `isRegisteredFixedEntry`)                                                                                                                                                                                                                                                                                            |
| `findContentUsages(caller, target, options?)`                                                                           | `content:read`                                                                                                                                                                                  | `{ ok: true; usedBy: ContentReferenceUsage[] }`                                                                                                                                                                                                                                                                                                                                                                     |
| `findMediaUsages(caller, mediaId)`                                                                                      | `content:read` **or** `media:manage` (`ICR-196` AC5/AC7)                                                                                                                                        | `{ ok: true; usedBy: ContentReferenceUsage[] }`                                                                                                                                                                                                                                                                                                                                                                     |
| `createContent(caller, { collection, draft })`                                                                          | `content:write` (+ `content:publish-protected` if `topic` with `protected: true`; fixed entries always refused)                                                                                 | `{ ok: true; doc: ContentDoc<T>; status: "draft" }`                                                                                                                                                                                                                                                                                                                                                                 |
| `saveDraft(caller, { collection, docId, patch, expectedRevision, overwrite? })`                                         | `content:write` (+ `content:publish-protected` if `topic.protected` changes in either direction)                                                                                                | `{ ok: true; doc: ContentDoc<T>; status: ContentStatus; changedFields: string[]; noOp: boolean }`                                                                                                                                                                                                                                                                                                                   |
| `publishContent(caller, { collection, docId, expectedRevision, overwrite?, draftPatch?, notify?, approvedConfirmed? })` | `content:publish` (+ `content:write` if `draftPatch` has changes; + `content:publish-protected` if `belief_collections` or `topic` with `published?.protected \|\| draft.protected`)            | `{ ok: true; doc: ContentDoc<T>; status: "published"; revalidated: boolean; revalidateReason?: RevalidateFailureReason; cascaded: ContentReference[]; notified: boolean }`                                                                                                                                                                                                                                          |
| `unpublishContent(caller, { collection, docId, expectedRevision, overwrite? })`                                         | `content:publish` (+ `content:publish-protected` if protected topic; fixed & library entries always refused)                                                                                    | `{ ok: true; doc: ContentDoc<T>; status: "draft"; revalidated: boolean; revalidateReason?: RevalidateFailureReason }`                                                                                                                                                                                                                                                                                               |
| `discardChanges(caller, { collection, docId, expectedRevision, overwrite? })`                                           | `content:write`                                                                                                                                                                                 | `{ ok: true; doc: ContentDoc<T>; status: "published"; noOp: boolean }`                                                                                                                                                                                                                                                                                                                                              |
| `deleteContent(caller, { collection, docId, expectedRevision, overwrite? })`                                            | `content:write` (unpublished non-protected) / `content:publish` (published library) / `content:publish-protected` (protected topic); fixed entries & published post/sermon/topic always refused | `{ ok: true; docId: string; wasPublished: false } \| { ok: true; docId: string; wasPublished: true; revalidated: boolean; revalidateReason?: RevalidateFailureReason }`                                                                                                                                                                                                                                             |
| `retryRevalidation(caller, collection, docId)`                                                                          | `content:publish`                                                                                                                                                                               | `{ ok: true; revalidated: true } \| { ok: true; revalidated: false; revalidateReason: RevalidateFailureReason }`                                                                                                                                                                                                                                                                                                    |
| `updateSermonPdfMedia(caller, { docId, pdfSummaryMediaId, expectedContentHash })`                                       | Service caller (`kind === "service"`) with `content:write`                                                                                                                                      | `{ ok: true; updatedDraft: boolean; updatedPublished: boolean; previousMediaIds: string[]; revalidated: boolean; revalidateReason?: RevalidateFailureReason }` (gates draft/published on `expectedContentHash`, recomputes `_refs`, logs `content.pdf-update` without bumping `revision` or human `updatedBy`, revalidates only when `updatedPublished === true`)                                                   |

Typed per-collection facades (`postService`, `sermonService`, `topicService`, `authorService`, `bibleVerseService`, `sectionService`, `beliefCollectionService`, `eventBannerService`, `seoEntryService`, `globalService`) wrap the core with exact `TFields` types and omit unsupported operations (e.g. `create`/`unpublish`/`delete` on fixed facades) at the TypeScript level while keeping runtime enforcement inside the core.

### 4.4 Outbound Site Refresh Contract

- **Request:** `POST <origin>/api/revalidate`
  - Headers: `content-type: application/json`, `x-vercel-reval-key: <WEBSITE_REVALIDATE_SECRET>`
  - Body: `{ type: ContentType, id: string, notify: boolean }`
  - Timeout: `10_000 ms` via `AbortSignal.timeout(10_000)`
- **Web route note:** Until `ICR-205` re-keys `apps/web/src/app/api/revalidate/route.ts`, this body triggers `revalidateTag("site-content", "max")` and `notifyOnPublish` silently skips (expected). `ICR-205` will make `notifyOnPublish` respect `body.notify === true`.

---

## 5. New / Modified Files

### Modified Files

| File                                              | Purpose                                                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/src/service/database.service.ts`      | Add `withContentTransaction<T>(fn)` bound to `getWebsiteClient()`, asserting `getContentDb()` before starting session.                  |
| `apps/admin/src/service/database.service.test.ts` | Unit tests for `withContentTransaction` (fail-closed DB guard, session lifecycle, `endSession` in `finally`, website client isolation). |
| `apps/admin/src/lib/rbac/permissions.ts`          | Append 5 content/media keys (`15 → 20`).                                                                                                |
| `apps/admin/src/lib/rbac/permissions.test.ts`     | Update count `15 → 20`, expected sorted list, and kebab-case action regex `/^[a-z]+:[a-z]+(?:-[a-z]+)*$/`.                              |
| `apps/admin/messages/es-AR.json`                  | Add `permissions.{content:*,media:manage}.{label,description}` and `permissions.groups.{content,media}`.                                |
| `apps/admin/messages/en-US.json`                  | Same in English.                                                                                                                        |
| `apps/admin/src/i18n/messages.test.ts`            | Update `permissionGroupKeys` from 6 to 8 groups (`content`, `media`).                                                                   |
| `apps/admin/src/service/role.service.test.ts`     | Update test label `"seeds Admin with all 15 keys"` → `"seeds Admin with all 20 registry keys"`.                                         |
| `apps/admin/src/types/environment.d.ts`           | Declare `WEBSITE_REVALIDATE_URL`, `WEBSITE_REVALIDATE_SECRET`, `CONTENT_PUBLISH_EMAILS`, and optional `VERCEL_TARGET_ENV`.              |
| `apps/admin/.env.example`                         | Document the new server-only vars (names & comments only, blank values).                                                                |
| `apps/admin/package.json`                         | Add `"grant:content-permissions": "tsx scripts/grant-content-permissions.ts"`.                                                          |

### New Files

| File                                                          | Purpose                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/src/service/content-audit.service.ts`             | `appendContentAuditEntry(entry, session)`, `ensureContentAuditIndexes()`, `contentAuditEntrySchema`.                                                                                                                                                                                  |
| `apps/admin/src/service/content-audit.service.test.ts`        | Unit tests: website DB binding, required session, server-side `at`, compact shape (no snapshots), memoized indexes.                                                                                                                                                                   |
| `apps/admin/src/lib/rbac/grant-content-permissions.ts`        | Pure testable grant orchestration (`CONTENT_PERMISSION_KEYS`, arg parser, `grantContentPermissions(args, deps)`).                                                                                                                                                                     |
| `apps/admin/src/lib/rbac/grant-content-permissions.test.ts`   | Unit tests: existing Admin role updated with `$addToSet`, idempotent second run writes no audit, non-Admin roles untouched, dry-run, DB guard refusal.                                                                                                                                |
| `apps/admin/scripts/grant-content-permissions.ts`             | Human-run CLI wrapper mirroring `scripts/seed-admin.ts` (`CI` guard, redacted host banner, TTY confirmation, JSON stdout).                                                                                                                                                            |
| `apps/admin/src/lib/content/revalidate.ts`                    | `PRODUCTION_WEBSITE_HOSTS`, `isPublishEmailsEnabled`, `shouldNotifySubscribers`, `validateRevalidateConfig`, `revalidateWebsite`.                                                                                                                                                     |
| `apps/admin/src/lib/content/revalidate.test.ts`               | Unit tests: fail-closed unset vars, `VERCEL_TARGET_ENV !== "production"` blocks all 6 prod hosts (incl. uppercase/trailing dot), production allows them, `CONTENT_PUBLISH_EMAILS` switch + first-publish + post/sermon + opt-in matrix, HTTP/network failure returns `{ ok: false }`. |
| `apps/admin/src/lib/content/caller.ts`                        | `ContentCaller`, `UserContentCaller`, `ServiceContentCaller`, `callerFromAuthorized`, `getCallerActor`.                                                                                                                                                                               |
| `apps/admin/src/lib/content/errors.ts`                        | `ContentFailure`, result types, `formatZodFieldErrors`, `mapDuplicateKeyToField`.                                                                                                                                                                                                     |
| `apps/admin/src/lib/content/guards.ts`                        | Pure domain guards: protected check, fixed-entry immutability, `contactForm.fields` structural lock, `diffChangedFields`, `buildMongoPatch`, `REFERENCING_COLLECTIONS_BY_TARGET` derived from `REFERENCE_PATHS`.                                                                      |
| `apps/admin/src/lib/content/guards.test.ts`                   | Unit tests for all pure guards and diff/unset logic (including `undefined` → `$unset`, never BSON `null`).                                                                                                                                                                            |
| `apps/admin/src/service/content/indexes.ts`                   | Memoized `ensureContentIndexes(collection)` across all 10 collections.                                                                                                                                                                                                                |
| `apps/admin/src/service/content/content-core.service.ts`      | Core transactional content operations (`get`, `list`, `create`, `saveDraft`, `publish`, `unpublish`, `discard`, `delete`, `findContentUsages`, `findMediaUsages`, `retryRevalidation`, `updateSermonPdfMedia`).                                                                       |
| `apps/admin/src/service/content/collections.ts`               | Typed per-collection service facades (`postService`, `sermonService`, …, `globalService`).                                                                                                                                                                                            |
| `apps/admin/src/service/content/index.ts`                     | Barrel export for content services and contracts.                                                                                                                                                                                                                                     |
| `apps/admin/src/service/content/content-core.service.test.ts` | Comprehensive service-level test suite covering AC1–AC9 and edge cases 1–12 (mocked Mongo collections/sessions + mocked fetch).                                                                                                                                                       |

---

## 6. Component Hierarchy

Not applicable — `ICR-195` is server/service-only (zero UI components; the permission matrix in `(app)/roles/permission-matrix.tsx` automatically renders the 5 new keys and 2 new groups from `PERMISSIONS` + `messages` with zero UI code edits).

---

## 7. Edge Cases

1. **Transaction retry safety:** `withContentTransaction` callbacks may be retried by MongoDB on transient write conflicts. All side effects (`revalidateWebsite`) run strictly AFTER `withContentTransaction` resolves; a test verifies `fetch` is never called during an aborted/retried transaction and is called strictly after commit.
2. **Post-commit refresh failure / timeout:** If `fetch` returns non-2xx, rejects, or times out after commit, the DB write stays committed and the result reports `{ ok: true, ..., revalidated: false, revalidateReason }`. `retryRevalidation` repeats only the refresh call with `notify: false`.
3. **Staging misconfigured with production URL:** When `VERCEL_TARGET_ENV !== "production"` (including `"staging"`, `"preview"`, `"development"`, or unset), any target resolving to `idcredentor.org`, `www.idcredentor.org`, `idcredentor.com`, `www.idcredentor.com`, `idc-redentor-web.vercel.app`, or `idc-redentor-website.vercel.app` (case-insensitive, trailing-dot stripped) is refused before `fetch` with `revalidateReason: "production-host-blocked"`.
4. **Unpublish dependency guard:** Unpublishing a post/sermon referenced by another **published** post/sermon's `published` snapshot is refused with `{ ok: false, reason: "in-use", usedBy }`. A reference that exists ONLY in another entry's unpublished `draft` does NOT block unpublish.
5. **Delete reference guard:** Deleting any entry referenced by another entry's `draft` OR `published` snapshot in either locale (plain field, array, item list, or rich text) is refused with `{ ok: false, reason: "in-use", usedBy }`. Self-references are excluded.
6. **Protected topic flip-off-then-publish bypass:** Without `content:publish-protected`, attempting to set `protected: false` (or `undefined`) on a protected topic in `saveDraft` is refused (`forbidden`); attempting to publish a topic where `published.protected === true` OR `draft.protected === true` is refused (`forbidden`); attempting to unpublish or delete a protected topic is refused (`forbidden`).
7. **Protected bilingual completeness:** Publishing a `belief_collections` entry or a `protected: true` `topics` entry with missing `en-US` text fails `@idcr/content`'s strict `publishable` schema (`invalid` + `fieldErrors`). Non-protected entries publish with Spanish only.
8. **Unpublish then re-publish (email deduplication):** `firstPublishedAt` is set on the first publish and never cleared by `unpublishContent`. Re-publishing sees `firstPublishedAt !== undefined` → `isFirstPublish = false` → `notify: false`.
9. **Service-created draft edited by a human:** `createContent` with `ServiceContentCaller` sets `updatedBy = caller.serviceId` (e.g. `"service:predica-ingest"`). The next human `saveDraft` updates `updatedBy = caller.userId` (clearing the "Para revisar" derived signpost for `ICR-197`/`ICR-200`).
10. **No-op save writes nothing:** Saving a draft where every patched field is `canonicalEqual` to `existing.draft` performs zero DB writes, does not increment `revision`, does not change `updatedAt`/`updatedBy`, and appends zero `content_audit` rows.
11. **Fixed entries immutable, registry-filtered & non-deletable:** `create`, `unpublish`, `delete` are refused on all 5 fixed-entry collections; mutating `machineName`, `section.layout`, `global.kind`, or `contactForm.fields[].{inputId,type,required}` / count / order is refused. On reads (`listContent`, `getContentById`, `getContentByNaturalKey`), any DB document in a fixed collection whose `machineName` is absent from `FIXED_ENTRIES` is excluded (`listContent`) or returns `not-found` (`getContentById` / `getContentByNaturalKey`). On `globals` `saveDraft`, the concrete schema is resolved from `existing.draft.kind` so fields from another global kind are rejected.
12. **Slug / natural-key collision:** Mongo `E11000` inside a transaction explicitly calls `await session.abortTransaction()` and returns `{ ok: false, reason: "duplicate-key", field, fieldErrors }` — never throws.
13. **Clearing optional fields (`undefined` vs BSON `null`):** Explicitly clearing an optional draft field converts to `$unset: { "draft.<field>": "" }`, never `$set: { "draft.<field>": null }` (avoiding Zod `.optional()` read-back corruption, mirroring `role.service.ts`).
14. **Cascade publish atomicity:** If a parent references a never-published author or verse whose draft fails its strict `publishable` schema (or whose doc ID does not exist), the entire transaction aborts — neither the parent nor any other referenced entry is published.
15. **PDF worker background write (`updateSermonPdfMedia`):** Gates `draft.pdfSummaryMediaId` update on `draft.contentHash === expectedContentHash` and `published.pdfSummaryMediaId` update on `published?.contentHash === expectedContentHash` (stale jobs become a safe no-op); recomputes `_refs` in the same transaction; returns `previousMediaIds` (superseded PDF media ids); appends a `content.pdf-update` audit row (`actorKind: "service"`) without bumping `revision` or replacing human `updatedBy`/`updatedByLabel`; revalidates post-commit only when `updatedPublished === true`.
16. **Media-only role checking usage (`ICR-196`):** A caller holding `media:manage` without `content:read` is allowed to call `findMediaUsages(caller, mediaId)` so unused-media cleanup and delete guards work for media-only roles.

---

## 8. i18n

Added to both `apps/admin/messages/es-AR.json` and `apps/admin/messages/en-US.json` under `permissions`:

| Key                                                 | `es-AR`                                                                                              | `en-US`                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `permissions.content:read.label`                    | Ver contenido                                                                                        | View content                                                                            |
| `permissions.content:read.description`              | Permite ver las entradas de contenido del sitio y sus borradores.                                    | Lets you view site content entries and their drafts.                                    |
| `permissions.content:write.label`                   | Crear/editar contenido                                                                               | Create/edit content                                                                     |
| `permissions.content:write.description`             | Permite crear, guardar y eliminar borradores de contenido del sitio.                                 | Lets you create, save, and delete drafts of site content.                               |
| `permissions.content:publish.label`                 | Publicar contenido                                                                                   | Publish content                                                                         |
| `permissions.content:publish.description`           | Permite publicar y despublicar contenido del sitio, y eliminar entradas publicadas de la biblioteca. | Lets you publish and unpublish site content, and delete published library entries.      |
| `permissions.content:publish-protected.label`       | Publicar contenido protegido (legal y doctrinal)                                                     | Publish protected content (legal and doctrinal)                                         |
| `permissions.content:publish-protected.description` | Permite publicar, despublicar y modificar la protección de textos legales y contenido doctrinal.     | Lets you publish, unpublish, and change protection on legal text and doctrinal content. |
| `permissions.media:manage.label`                    | Gestionar imágenes y archivos                                                                        | Manage images and files                                                                 |
| `permissions.media:manage.description`              | Permite subir, editar y eliminar archivos de la biblioteca multimedia.                               | Lets you upload, edit, and delete files in the media library.                           |
| `permissions.groups.content`                        | Contenido                                                                                            | Content                                                                                 |
| `permissions.groups.media`                          | Multimedia                                                                                           | Media                                                                                   |

---

## 9. Testing Strategy

- **Unit & service tests (`pnpm test`, Vitest single-run):**
  - `database.service.test.ts`: `withContentTransaction` uses website client, asserts DB name allowlist, passes session, closes session on resolve & reject.
  - `content-audit.service.test.ts`: writes to `getContentDb().collection("content_audit")`, requires session, stamps `at` server-side, stores compact fields (no snapshot), memoizes indexes.
  - `permissions.test.ts` + `messages.test.ts` + `permission-matrix.test.tsx`: 20 keys, kebab-case action format, all 20 labels/descriptions + 8 groups in both locales, roles matrix renders new groups automatically.
  - `grant-content-permissions.test.ts`: starts from an existing stored `{ key: "admin" }` doc (15 keys) + Leader/Member/custom docs; first run adds 5 keys via `$addToSet` and appends 1 `rbacAudit` entry; second run modifies nothing and writes 0 audit entries; non-Admin roles untouched; dry-run writes nothing; DB guard fails closed.
  - `revalidate.test.ts`: fail-closed when URL or secret unset; all 6 prod hosts blocked whenever `VERCEL_TARGET_ENV !== "production"` (incl. `"staging"`, `"preview"`, uppercase, trailing dot); allowed when `VERCEL_TARGET_ENV === "production"`; never reads `NEXT_PUBLIC_WEBSITE_URL`; `CONTENT_PUBLISH_EMAILS` switch matrix (off default, on + first publish + post/sermon + notify=true, on + second publish, on + notify=false, on + non-post/sermon, draft save never calls fetch); HTTP 500 & network throw return `{ ok: false }`.
  - `guards.test.ts` + `content-core.service.test.ts`:
    - Permission checks per entry point (write-only saves draft, refused on publish; read-only refused on save).
    - Every mutation runs inside `withContentTransaction` and appends compact `content_audit` in the same session.
    - Concurrency: two saves on same revision → second gets `{ ok: false, reason: "conflict", updatedBy, updatedAt }` and writes nothing; `overwrite: true` succeeds; zero-change save writes nothing & writes no audit; untouched rich-text/slug not re-validated or written.
    - Publish: strict schema refusal (with draft preserved when `draftPatch` passed); valid publish sets `publishedAt` + `firstPublishedAt` once; cascades never-published `authors` + `bible_verses` in same tx; invalid cascade aborts whole tx.
    - Protected: without `content:publish-protected`, publish/unpublish/delete of protected topic & publish of `belief_collections` refused; flip `protected: true → false` then publish refused (dedicated test); missing `en-US` fails publish; authorized protected publish logs `content.publish-protected`.
    - Fixed entries: create/unpublish/delete refused; immutable `machineName`/`layout`/`kind`/`contactForm.fields` structure refused; unregistered DB entries hidden from `listContent` and return `not-found` from `getContentById`/`getContentByNaturalKey`; `globals` `saveDraft` validates against concrete `existing.draft.kind` schema.
    - Guards & lookup: unpublish blocked when referenced by published entry; delete blocked when referenced by draft or published entry (with `usedBy`); delete of published post/sermon/topic refused (`published-must-unpublish`); delete of unused published author/verse succeeds and revalidates; `findMediaUsages` succeeds for `media:manage`-only caller; `getContentByNaturalKey` supports localized `{ locale, slug }` lookup on `topics`.
    - PDF background write: `updateSermonPdfMedia` checks `expectedContentHash` for draft and published independently, recomputes `_refs`, returns `previousMediaIds`, appends `content.pdf-update` audit row without incrementing `revision` or overwriting human `updatedBy`, and revalidates post-commit only when `updatedPublished === true`.
    - Post-commit order: mocked `fetch` asserts call happens strictly AFTER commit, never inside tx callback; failed `fetch` leaves commit intact and returns `{ ok: true, revalidated: false }`.
    - Duplicate-key E11000 aborts tx and returns `duplicate-key` fieldError.
- **Full workspace verify:** `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm build` (linking `apps/web/.env.local` if needed per `tasks/lessons.md`).
- **Pre-merge / Staging QA:**
  - `qaType` = `chore` (no new admin UI routes; existing `/roles` page renders the 5 new keys automatically via `PERMISSIONS` — we can also verify `/es-AR/roles` & `/en-US/roles` on `previewAdmin` if coordinator grants a previewAdmin slot, plus inspect `ministry-admin-staging` / `website-staging` via `ICR-223`'s `qa-db-read.ts` once merged).
  - Playwright suites: `apps/admin/src/service` maps to `apiAdmin`, `e2eAdmin` (Phase 1 has no pre-authored specs).

---

## 10. Implementation Checkpoints (6 checkpoints — ≤ 8, no split needed)

1. **Checkpoint 1 — Content transaction + compact content audit**
   - Files: `apps/admin/src/service/database.service.ts`, `database.service.test.ts`, `apps/admin/src/service/content-audit.service.ts`, `content-audit.service.test.ts`
   - Verify: `pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin test`
   - Commit: `feat(ICR-195): add withContentTransaction and compact content audit service`
2. **Checkpoint 2 — RBAC keys + bilingual messages + registry tests**
   - Files: `apps/admin/src/lib/rbac/permissions.ts`, `permissions.test.ts`, `apps/admin/messages/{es-AR,en-US}.json`, `apps/admin/src/i18n/messages.test.ts`, `apps/admin/src/service/role.service.test.ts`
   - Verify: `pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin test`
   - Commit: `feat(ICR-195): add content and media RBAC permissions with bilingual labels`
3. **Checkpoint 3 — Idempotent Admin role grant script**
   - Files: `apps/admin/src/lib/rbac/grant-content-permissions.ts`, `grant-content-permissions.test.ts`, `apps/admin/scripts/grant-content-permissions.ts`, `apps/admin/package.json`
   - Verify: `pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin test`
   - Commit: `feat(ICR-195): add idempotent grant-content-permissions script for Admin role`
4. **Checkpoint 4 — Post-commit site refresh, env guard & email switch**
   - Files: `apps/admin/src/lib/content/revalidate.ts`, `revalidate.test.ts`, `apps/admin/src/types/environment.d.ts`, `apps/admin/.env.example`
   - Verify: `pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin test`
   - Commit: `feat(ICR-195): add post-commit site revalidation with production host guard and email switch`
5. **Checkpoint 5 — Content service core, guards & indexes**
   - Files: `apps/admin/src/lib/content/{caller,errors,guards}.ts`, `guards.test.ts`, `apps/admin/src/service/content/{indexes,content-core.service}.ts`
   - Verify: `pnpm --filter @idcr/admin type-check && pnpm --filter @idcr/admin test`
   - Commit: `feat(ICR-195): implement transactional content service core with concurrency and protection guards`
6. **Checkpoint 6 — Typed per-collection facades & full AC test matrix**
   - Files: `apps/admin/src/service/content/{collections,index}.ts`, `content-core.service.test.ts`
   - Verify: `pnpm type-check && pnpm lint && pnpm test && pnpm build`
   - Commit: `feat(ICR-195): add typed per-collection content facades and service test suite`

---

## 11. Open Questions & Resolution Status

All open questions resolved (PM #47/#50; Owner #117):

1. **Q1 — Admin-only grant scope:** **Approved Option A** (`grant:content-permissions` touches `{ key: "admin" }` only; settled in `01-decisions.md` L48–50).
2. **Q2 — Protected-publish "reviewed and approved" tick:** **Approved Option A (Owner)** — `content:publish-protected` permission alone gates protected publish in v1; optional `meta.approvedConfirmed?: boolean` reserved on `content_audit`.
3. **Q3 — Global publish-email switch storage:** **Approved Option A (Owner)** — server-only env var `CONTENT_PUBLISH_EMAILS` (default off; enabled only on exact `"true"`); UI trial-mode flag deferred to `ICR-197`.
4. **Q4 — Delete permission for unpublished non-protected drafts:** **Approved Option A (PM)** — `content:write` deletes unpublished non-protected entries; `content:publish` deletes published library entries; `content:publish-protected` required for protected topics; §8 i18n descriptions aligned.
5. **Q5 — Production deployment discriminator:** **Approved Option A (PM)** — `process.env.VERCEL_TARGET_ENV === "production"`, failing closed to non-production when unset.
