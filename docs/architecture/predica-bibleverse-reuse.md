# /predica — Bible verse reuse (dedup)

How the `/predica` pipeline avoids creating duplicate `bible_verses` documents in MongoDB (`website*.bible_verses`):
the **same passage in the same Spanish translation is stored once and reused across sermons**, and re-running a
sermon never piles up duplicates.

## The dedup key — a derived, version-scoped natural key

Every `bible_verses` document carries a server-computed `_naturalKey` built by `@idcr/content`'s `bibleVerseKey()`
(`packages/content/src/natural-keys.ts`) with a unique index on `{ _naturalKey: 1 }`:

```text
<book_es>|<chapter>|<fromVerse>|<toVerse>|<version_es>   (NFC, trimmed, collapsed whitespace, lowercased)
  → "joel|2|13|13|nvi"   ·   "mateo|9|12|13|nvi"   ·   "efesios|2|11|22|rvr1960"
```

Mirrored locally by `buildBibleVerseNaturalKey()` in `.claude/scripts/predica/build-sermon-payload.mjs`. Consequences:

- **Same passage → same key → reuse.** Two sermons that both quote Joel 2:13 (NVI) resolve to the identical
  `_naturalKey`, so both reference the **same** `bible_verses` document.
- **Version-scoped on purpose.** `"joel|2|13|13|nvi"` and `"joel|2|13|13|rvr1960"` are distinct keys, so a
  translation difference never reuses the wrong text, and the admin sermon editor displays each verse's real stored
  version label verbatim.
- **Stable across runs.** Because the key is derived server-side from structured coordinates (never authored by an
  LLM), writers only need to use **full canonical Spanish book names** (`Efesios`, `1 Corintios`).

## Enforcement — server-side upsert in `POST /api/predica/sermons`

Reuse is enforced deterministically on the admin server (`apps/admin/src/service/predica/ingest.service.ts` →
`resolveOrCreateBibleVerse()`), never left to an agent remembering to search:

1. Compute `bibleVerseKey(...)` and query `bibleVerseService.getByNaturalKey(caller, naturalKey)`.
2. On a hit → reuse the existing `_id` verbatim (`reused: true`) without modifying the shared verse.
3. On `not-found` → create a draft verse via `bibleVerseService.create(caller, draft)` (`reused: false`). If a
   concurrent ingest races on the unique `_naturalKey` index (`duplicate-key`), re-fetch and return the winner's `_id`.

## Re-run safety for the sermon draft

The same passage is reused, and the **sermon** itself never silently duplicates either. **Gate 0** calls
`GET /api/predica/sermons/lookup` and, on human approval, updates the existing draft in place by `docId` +
`expectedRevision` (`POST /api/predica/sermons` with `mode: "update"`). See
[`predica-rerun-idempotency.md`](./predica-rerun-idempotency.md).

## Files

| File                                               | Role                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `packages/content/src/natural-keys.ts`             | Canonical `bibleVerseKey()` natural-key builder                              |
| `apps/admin/src/service/predica/ingest.service.ts` | `resolveOrCreateBibleVerse()` server-side idempotent upsert                  |
| `.claude/scripts/predica/build-sermon-payload.mjs` | Local validator + `buildBibleVerseNaturalKey()` + payload builder            |
| `.claude/agents/predica-publisher.md`              | Uploads media and calls `predica-ingest-client.mjs ingest`                   |
| `.claude/agents/predica-writer.md`                 | Scripture contract: no authored `internalName`; canonical Spanish book names |
