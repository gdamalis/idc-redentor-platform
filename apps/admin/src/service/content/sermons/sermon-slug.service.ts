import { ObjectId, type Db } from "mongodb";
import { getContentDb } from "@src/service/database.service";
import type { SerializedContentFailure } from "@src/app/[locale]/(app)/content/actions";

export interface SermonSlugCheckDeps {
  readonly getContentDb: () => Db;
}

const defaultDeps: SermonSlugCheckDeps = {
  getContentDb,
};

/**
 * Cross-snapshot sermon slug uniqueness guard (`ICR-200` C1):
 * `indexes.ts` maintains separate partial unique indexes on `draft.slug` and
 * `published.slug`, so without an application check Sermon B could claim a
 * `draft.slug` that collides with Sermon A's `published.slug` (when Sermon A
 * renamed its draft) and hijack `/predicas/<slug>` in Draft Mode.
 */
export async function checkSermonSlugConflict(
  slug: string | undefined,
  excludeDocId?: string,
  deps: SermonSlugCheckDeps = defaultDeps,
): Promise<Extract<SerializedContentFailure, { reason: "duplicate-key" }> | null> {
  const trimmed = slug?.trim();
  if (!trimmed) return null;

  const filter: Record<string, unknown> = {
    $or: [{ "draft.slug": trimmed }, { "published.slug": trimmed }],
  };
  if (excludeDocId && ObjectId.isValid(excludeDocId)) {
    filter._id = { $ne: new ObjectId(excludeDocId) };
  }

  const existing = await deps
    .getContentDb()
    .collection("sermons")
    .findOne(filter, { projection: { _id: 1 } });

  if (!existing) return null;

  return {
    ok: false,
    reason: "duplicate-key",
    field: "slug",
    fieldErrors: { slug: ["duplicate-key"] },
  };
}
