// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { checkSermonSlugConflict } from "./sermon-slug.service";

interface SermonStub {
  _id: ObjectId;
  draft: { slug?: string };
  published?: { slug?: string };
}

function createStubDb(docs: SermonStub[]): Db {
  const findOne = vi.fn(async (filter: Record<string, unknown>) => {
    const excludeNe = (filter._id as { $ne?: ObjectId } | undefined)?.$ne;
    const orList = filter.$or as Array<Record<string, string>>;
    return (
      docs.find((doc) => {
        if (excludeNe && doc._id.equals(excludeNe)) return false;
        return orList.some((clause) => {
          if ("draft.slug" in clause) return doc.draft.slug === clause["draft.slug"];
          if ("published.slug" in clause) {
            return doc.published?.slug === clause["published.slug"];
          }
          return false;
        });
      }) ?? null
    );
  });

  return {
    collection: vi.fn((name: string) => {
      if (name !== "sermons") throw new Error(`Unexpected collection: ${name}`);
      return { findOne };
    }),
  } as unknown as Db;
}

describe("sermon-slug.service (C1)", () => {
  it("blocks draft.slug colliding with another sermon's published.slug and vice-versa, while allowing self-match", async () => {
    const sermonAId = new ObjectId("65f000000000000000000001");
    const sermonBId = new ObjectId("65f000000000000000000002");

    // Sermon A is published at "la-gracia" and renamed its draft to "la-gracia-2"
    const db = createStubDb([
      {
        _id: sermonAId,
        draft: { slug: "la-gracia-2" },
        published: { slug: "la-gracia" },
      },
      {
        _id: sermonBId,
        draft: { slug: "esperanza" },
      },
    ]);

    // Sermon B trying to claim Sermon A's published slug -> BLOCKED
    const conflictPublished = await checkSermonSlugConflict(
      "la-gracia",
      sermonBId.toHexString(),
      { getContentDb: () => db },
    );
    expect(conflictPublished).toEqual({
      ok: false,
      reason: "duplicate-key",
      field: "slug",
      fieldErrors: { slug: ["duplicate-key"] },
    });

    // Brand new sermon trying to claim Sermon B's draft slug -> BLOCKED
    const conflictDraft = await checkSermonSlugConflict(
      "esperanza",
      undefined,
      { getContentDb: () => db },
    );
    expect(conflictDraft?.reason).toBe("duplicate-key");

    // Sermon A reverting its own draft back to its own published slug -> ALLOWED
    const selfMatch = await checkSermonSlugConflict(
      "la-gracia",
      sermonAId.toHexString(),
      { getContentDb: () => db },
    );
    expect(selfMatch).toBeNull();

    // Unique slug -> ALLOWED
    const unique = await checkSermonSlugConflict(
      "slug-nuevo",
      sermonBId.toHexString(),
      { getContentDb: () => db },
    );
    expect(unique).toBeNull();
  });
});
