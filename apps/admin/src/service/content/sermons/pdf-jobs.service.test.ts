// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import {
  CONTENT_PDF_JOBS_COLLECTION,
  STALE_PDF_LOCK_MS,
  claimContentPdfJob,
  completeContentPdfJob,
  deriveSermonPdfUiState,
  dropContentPdfJob,
  failContentPdfJob,
  getContentPdfJob,
  isContentPdfJobRenderable,
  markSermonPdfDirty,
  nextContentPdfVersion,
  releaseStaleContentPdfClaim,
  resetContentPdfJobIndexesCacheForTest,
  selectRenderableContentPdfJobs,
  type ContentPdfJob,
  type ContentPdfJobsDeps,
} from "./pdf-jobs.service";

interface LegacyPdfJob {
  entryId: string;
  dirtyAt: Date;
  contentHash: string;
  lastRenderedHash?: string;
  version: number;
  status: "idle" | "rendering";
  lockedAt?: Date;
}

/**
 * Minimal in-memory MongoDB mock supporting two isolated collections (`pdf_jobs`
 * and `content_pdf_jobs`) plus atomic claim semantics for concurrency and AC7
 * coexistence tests.
 */
function createInMemoryWebsiteDb() {
  const contentJobs = new Map<string, ContentPdfJob>();
  const legacyJobs = new Map<string, LegacyPdfJob>();
  const createdIndexes: Array<{ collection: string; spec: unknown; opts?: unknown }> = [];

  const contentCollection = {
    createIndex: vi.fn(async (spec: unknown, opts?: unknown) => {
      createdIndexes.push({ collection: CONTENT_PDF_JOBS_COLLECTION, spec, opts });
      return "idx";
    }),
    findOne: vi.fn(async (filter: { sermonId: string }) => {
      return contentJobs.get(filter.sermonId) ?? null;
    }),
    updateOne: vi.fn(
      async (
        filter: { sermonId: string },
        update: {
          $set?: Record<string, unknown>;
          $inc?: Record<string, number>;
          $unset?: Record<string, string>;
          $setOnInsert?: Record<string, unknown>;
        },
        options?: { upsert?: boolean },
      ) => {
        const existing = contentJobs.get(filter.sermonId);
        if (!existing && !options?.upsert) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
        const doc: Record<string, unknown> = existing
          ? { ...existing }
          : { sermonId: filter.sermonId, ...(update.$setOnInsert ?? {}) };

        if (update.$set) {
          Object.assign(doc, update.$set);
        }
        if (update.$inc) {
          for (const [key, delta] of Object.entries(update.$inc)) {
            doc[key] = (typeof doc[key] === "number" ? doc[key] : 0) + delta;
          }
        }
        if (update.$unset) {
          for (const key of Object.keys(update.$unset)) {
            delete doc[key];
          }
        }
        contentJobs.set(filter.sermonId, doc as unknown as ContentPdfJob);
        return { matchedCount: 1, modifiedCount: 1 };
      },
    ),
    find: vi.fn(() => {
      const list = [...contentJobs.values()].filter(
        (j) =>
          j.contentHash !== j.lastRenderedHash ||
          (j.forceGeneration ?? 0) > (j.lastRenderedGeneration ?? 0),
      );
      return {
        sort: vi.fn(() => ({
          toArray: vi.fn(async () =>
            [...list].sort((a, b) => a.dirtyAt.getTime() - b.dirtyAt.getTime()),
          ),
        })),
      };
    }),
    findOneAndUpdate: vi.fn(
      async (
        filter: { sermonId: string; $and: unknown[] },
        update: { $set: { status: "rendering"; lockedAt: Date } },
      ) => {
        const existing = contentJobs.get(filter.sermonId);
        if (!existing) return null;
        const now = update.$set.lockedAt;
        if (!isContentPdfJobRenderable(existing, now, STALE_PDF_LOCK_MS)) {
          return null;
        }
        const next: ContentPdfJob = {
          ...existing,
          status: "rendering",
          lockedAt: now,
        };
        contentJobs.set(filter.sermonId, next);
        return next;
      },
    ),
    deleteOne: vi.fn(async (filter: { sermonId: string }) => {
      const had = contentJobs.delete(filter.sermonId);
      return { deletedCount: had ? 1 : 0 };
    }),
  };

  // Exact mirror of legacy `apps/web/src/service/predica/pdfJobs.ts` collection
  const legacyCollection = {
    find: vi.fn(() => ({
      toArray: vi.fn(async () =>
        [...legacyJobs.values()].filter((j) => j.contentHash !== j.lastRenderedHash),
      ),
    })),
    deleteOne: vi.fn(async (filter: { entryId: string }) => {
      const had = legacyJobs.delete(filter.entryId);
      return { deletedCount: had ? 1 : 0 };
    }),
  };

  const db = {
    collection: vi.fn((name: string) => {
      if (name === CONTENT_PDF_JOBS_COLLECTION) return contentCollection;
      if (name === "pdf_jobs") return legacyCollection;
      throw new Error(`Unexpected collection: ${name}`);
    }),
  } as unknown as Db;

  return { db, contentJobs, legacyJobs, createdIndexes, contentCollection, legacyCollection };
}

describe("pdf-jobs.service", () => {
  beforeEach(() => {
    resetContentPdfJobIndexesCacheForTest();
  });

  it("creates unique sermonId index and collapses repeated dirty marks into one job (AC3)", async () => {
    const { db, contentJobs, createdIndexes } = createInMemoryWebsiteDb();
    let tick = 1000;
    const deps: ContentPdfJobsDeps = {
      getContentDb: () => db,
      now: () => new Date((tick += 1000)),
    };

    expect(await markSermonPdfDirty("65f000000000000000000001", "hash-1", {}, deps)).toBe(true);
    expect(await markSermonPdfDirty("65f000000000000000000001", "hash-2", {}, deps)).toBe(true);

    expect(contentJobs.size).toBe(1);
    const job = await getContentPdfJob("65f000000000000000000001", deps);
    expect(job).toMatchObject({
      sermonId: "65f000000000000000000001",
      contentHash: "hash-2",
      version: 0,
      status: "idle",
      forceGeneration: 0,
      lastRenderedGeneration: 0,
    });
    expect(createdIndexes).toContainEqual({
      collection: CONTENT_PDF_JOBS_COLLECTION,
      spec: { sermonId: 1 },
      opts: { unique: true },
    });
  });

  it("supports concurrent atomic claims: only one worker wins until lock expires", async () => {
    const { db } = createInMemoryWebsiteDb();
    const t0 = new Date("2026-11-22T12:00:00Z");
    const deps: ContentPdfJobsDeps = {
      getContentDb: () => db,
      now: () => t0,
    };

    await markSermonPdfDirty("s1", "h1", {}, deps);

    // Concurrent claims at t0: exactly one wins
    const [claim1, claim2] = await Promise.all([
      claimContentPdfJob("s1", t0, deps),
      claimContentPdfJob("s1", t0, deps),
    ]);
    expect([Boolean(claim1), Boolean(claim2)].filter(Boolean)).toHaveLength(1);

    // Still locked at +2 min
    const t2 = new Date(t0.getTime() + 2 * 60 * 1000);
    expect(await claimContentPdfJob("s1", t2, deps)).toBeNull();

    // Reclaimable once stale (>= 5 min)
    const t6 = new Date(t0.getTime() + STALE_PDF_LOCK_MS);
    const reclaimed = await claimContentPdfJob("s1", t6, deps);
    expect(reclaimed?.status).toBe("rendering");
    expect(reclaimed?.lockedAt).toEqual(t6);
  });

  it("handles force regeneration even when contentHash already matches lastRenderedHash", async () => {
    const { db } = createInMemoryWebsiteDb();
    const t0 = new Date("2026-11-22T12:00:00Z");
    const deps: ContentPdfJobsDeps = {
      getContentDb: () => db,
      now: () => t0,
    };

    await markSermonPdfDirty("s1", "h1", {}, deps);
    const claimed = await claimContentPdfJob("s1", t0, deps);
    expect(claimed).not.toBeNull();
    await completeContentPdfJob("s1", "h1", claimed!.forceGeneration, 1, t0, deps);

    expect(await selectRenderableContentPdfJobs(t0, deps)).toEqual([]);

    // User clicks "Regenerar" without editing text
    await markSermonPdfDirty("s1", "h1", { force: true }, deps);
    const renderable = await selectRenderableContentPdfJobs(t0, deps);
    expect(renderable).toHaveLength(1);
    expect(renderable[0]?.forceGeneration).toBe(1);
    expect(nextContentPdfVersion(renderable[0]!)).toBe(2);
  });

  it("supports stale claim release, failure recovery, and drop", async () => {
    const { db } = createInMemoryWebsiteDb();
    const t0 = new Date("2026-11-22T12:00:00Z");
    const deps: ContentPdfJobsDeps = {
      getContentDb: () => db,
      now: () => t0,
    };

    await markSermonPdfDirty("s1", "h1", {}, deps);
    await claimContentPdfJob("s1", t0, deps);
    await releaseStaleContentPdfClaim("s1", deps);
    const released = await getContentPdfJob("s1", deps);
    expect(released?.status).toBe("idle");
    expect(released?.lockedAt).toBeUndefined();
    expect(released?.lastRenderedHash).toBeUndefined();

    await claimContentPdfJob("s1", t0, deps);
    await failContentPdfJob("s1", "Chromium timeout", t0, deps);
    const failed = await getContentPdfJob("s1", deps);
    expect(failed?.status).toBe("idle");
    expect(failed?.lastError).toBe("Chromium timeout");
    expect(deriveSermonPdfUiState({ job: failed, hasPdfForLocale: true })).toBe(
      "failed",
    );

    // Next dirty mark clears lastError and returns to pending
    await markSermonPdfDirty("s1", "h1", { force: true }, deps);
    const retried = await getContentPdfJob("s1", deps);
    expect(retried?.lastError).toBeUndefined();
    expect(deriveSermonPdfUiState({ job: retried, hasPdfForLocale: true })).toBe(
      "pending",
    );

    await dropContentPdfJob("s1", deps);
    expect(await getContentPdfJob("s1", deps)).toBeNull();
  });

  it("derives all 4 UX §2.10 PDF UI states accurately", () => {
    const baseJob: ContentPdfJob = {
      sermonId: "s1",
      dirtyAt: new Date(),
      contentHash: "h1",
      lastRenderedHash: "h1",
      forceGeneration: 0,
      lastRenderedGeneration: 0,
      version: 1,
      status: "idle",
      lastRenderedAt: new Date(),
    };

    expect(deriveSermonPdfUiState({ job: baseJob, hasPdfForLocale: true })).toBe("ok");
    expect(deriveSermonPdfUiState({ job: null, hasPdfForLocale: true })).toBe("ok");
    expect(deriveSermonPdfUiState({ job: null, hasPdfForLocale: false })).toBe("none");
    expect(
      deriveSermonPdfUiState({
        job: { ...baseJob, contentHash: "h2" },
        hasPdfForLocale: true,
      }),
    ).toBe("pending");
    expect(
      deriveSermonPdfUiState({
        job: { ...baseJob, status: "rendering" },
        hasPdfForLocale: true,
      }),
    ).toBe("pending");
    expect(
      deriveSermonPdfUiState({
        job: { ...baseJob, contentHash: "h2", lastError: "Boom" },
        hasPdfForLocale: true,
      }),
    ).toBe("failed");
  });

  it("AC7 coexistence: legacy apps/web pdf_jobs cron neither processes nor drops content_pdf_jobs", async () => {
    const { db, contentJobs, legacyJobs, legacyCollection } =
      createInMemoryWebsiteDb();
    const now = new Date("2026-11-22T12:00:00Z");
    const deps: ContentPdfJobsDeps = { getContentDb: () => db, now: () => now };

    // Seed two new-style jobs in content_pdf_jobs (would E11000 if stored in pdf_jobs!)
    await markSermonPdfDirty("65f000000000000000000001", "new-hash-1", {}, deps);
    await markSermonPdfDirty("65f000000000000000000002", "new-hash-2", {}, deps);

    // Seed one legacy Contentful job in pdf_jobs
    legacyJobs.set("ctfEntry123", {
      entryId: "ctfEntry123",
      dirtyAt: new Date(now.getTime() - 120_000),
      contentHash: "ctf-hash",
      version: 1,
      status: "idle",
    });

    // Simulate legacy apps/web cron selecting from `pdf_jobs`
    const legacyCandidates = await db.collection("pdf_jobs").find({}).toArray();
    expect(legacyCandidates).toHaveLength(1);
    expect((legacyCandidates[0] as unknown as LegacyPdfJob).entryId).toBe(
      "ctfEntry123",
    );

    // Simulate legacy cron dropping a vanished Contentful entry — new jobs stay intact
    await legacyCollection.deleteOne({ entryId: "ctfEntry123" });
    expect(contentJobs.size).toBe(2);
    expect(await selectRenderableContentPdfJobs(now, deps)).toHaveLength(2);
  });
});
