import { createHash } from "node:crypto";
import { ObjectId, type ClientSession, type Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import {
  COLLECTIONS,
  extractReferences,
  type BeliefCollectionFields,
  type PostFields,
  type SectionFields,
  type SermonFields,
} from "@idcr/content";
import type { PermissionKey } from "@src/lib/rbac/permissions";
import type {
  ServiceContentCaller,
  UserContentCaller,
} from "@src/lib/content/caller";
import type { ContentAuditEntry } from "@src/service/content-audit.service";
import { MEDIA_SIZE_CAPS } from "@src/lib/media/policy";
import {
  confirmMediaUpload,
  createServerMedia,
  deleteMedia,
  getMediaById,
  getMediaByIds,
  listMedia,
  prepareMediaUpload,
  updateMediaDetails,
  type MediaServiceDeps,
  type StoredMediaDoc,
} from "./media.service";
import type { StoredContentEnvelope } from "@src/service/content/content-core.service";

// ── Minimal transactional in-memory Mongo harness ───────────────────────────

type RawDoc = Record<string, unknown> & { _id: ObjectId };

function cloneDoc<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== "object") {
    return val;
  }
  if (val instanceof ObjectId) {
    return new ObjectId(val.toHexString()) as unknown as T;
  }
  if (val instanceof Date) {
    return new Date(val.getTime()) as unknown as T;
  }
  if (Array.isArray(val)) {
    return val.map((item) => cloneDoc(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    out[k] = cloneDoc(v);
  }
  return out as T;
}

function getByPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function matchesFilter(doc: RawDoc, filter: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (key === "$or" && Array.isArray(expected)) {
      if (
        !expected.some((branch) =>
          matchesFilter(doc, branch as Record<string, unknown>),
        )
      ) {
        return false;
      }
      continue;
    }

    const actual = getByPath(doc, key);
    if (expected instanceof RegExp) {
      if (typeof actual !== "string" || !expected.test(actual)) return false;
      continue;
    }
    if (expected instanceof ObjectId) {
      if (!(actual instanceof ObjectId) || !actual.equals(expected)) return false;
      continue;
    }
    if (
      expected &&
      typeof expected === "object" &&
      !Array.isArray(expected)
    ) {
      const ops = expected as Record<string, unknown>;
      if ("$exists" in ops) {
        const exists = actual !== undefined;
        if (Boolean(ops.$exists) !== exists) return false;
      }
      if ("$in" in ops && Array.isArray(ops.$in)) {
        const matched = ops.$in.some((candidate) =>
          candidate instanceof ObjectId && actual instanceof ObjectId
            ? candidate.equals(actual)
            : candidate === actual,
        );
        if (!matched) return false;
      }
      if ("$nin" in ops && Array.isArray(ops.$nin)) {
        const matched = ops.$nin.some((candidate) =>
          candidate instanceof ObjectId && actual instanceof ObjectId
            ? candidate.equals(actual)
            : candidate === actual,
        );
        if (matched) return false;
      }
      continue;
    }
    if (Array.isArray(actual)) {
      if (!actual.includes(expected)) return false;
      continue;
    }
    if (actual !== expected) return false;
  }
  return true;
}

function createHarness(options: { readonly retryTxOnce?: boolean } = {}) {
  const collections = new Map<string, RawDoc[]>();
  const auditEntries: Omit<ContentAuditEntry, "_id" | "at">[] = [];
  const callOrder: string[] = [];

  const getStore = (name: string): RawDoc[] => {
    let arr = collections.get(name);
    if (!arr) {
      arr = [];
      collections.set(name, arr);
    }
    return arr;
  };

  const db = {
    collection: (name: string) => ({
      createIndex: vi.fn(async () => "idx"),
      findOne: vi.fn(async (filter: Record<string, unknown>) => {
        const found = getStore(name).find((d) => matchesFilter(d, filter));
        return found ? cloneDoc(found) : null;
      }),
      find: vi.fn((filter: Record<string, unknown> = {}) => {
        let items = getStore(name)
          .filter((d) => matchesFilter(d, filter))
          .map((d) => cloneDoc(d));
        const cursor = {
          sort: (spec: Record<string, number>) => {
            if ("createdAt" in spec) {
              const dir = spec.createdAt ?? -1;
              items.sort((a, b) => {
                const ta = (a.createdAt as Date).getTime();
                const tb = (b.createdAt as Date).getTime();
                return dir * (ta - tb);
              });
            }
            return cursor;
          },
          skip: (n: number) => {
            items = items.slice(n);
            return cursor;
          },
          limit: (n: number) => {
            items = items.slice(0, n);
            return cursor;
          },
          toArray: async () => items,
        };
        return cursor;
      }),
      countDocuments: vi.fn(async (filter: Record<string, unknown> = {}) => {
        return getStore(name).filter((d) => matchesFilter(d, filter)).length;
      }),
      distinct: vi.fn(async () => {
        // Mirror MongoDB Atlas Stable API v1 (strict: true), which bans `distinct` (`QA-F1`).
        throw Object.assign(
          new Error(
            "Provided apiStrict:true, but the command distinct is not in API Version 1",
          ),
          { codeName: "APIStrictError" },
        );
      }),
      insertOne: vi.fn(async (doc: RawDoc) => {
        const store = getStore(name);
        if (
          name === COLLECTIONS.media &&
          store.some((d) => d.pathname === doc.pathname)
        ) {
          const dupErr = Object.assign(new Error("E11000"), { code: 11000 });
          throw dupErr;
        }
        store.push(cloneDoc(doc));
        return { insertedId: doc._id };
      }),
      updateOne: vi.fn(
        async (
          filter: Record<string, unknown>,
          update: { $set?: Record<string, unknown>; $unset?: Record<string, ""> },
        ) => {
          const store = getStore(name);
          const idx = store.findIndex((d) => matchesFilter(d, filter));
          if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
          const target = store[idx]!;
          if (update.$set) {
            for (const [k, v] of Object.entries(update.$set)) {
              target[k] = cloneDoc(v);
            }
          }
          if (update.$unset) {
            for (const k of Object.keys(update.$unset)) {
              delete target[k];
            }
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
      ),
      deleteOne: vi.fn(async (filter: Record<string, unknown>) => {
        const store = getStore(name);
        const idx = store.findIndex((d) => matchesFilter(d, filter));
        if (idx === -1) return { deletedCount: 0 };
        store.splice(idx, 1);
        return { deletedCount: 1 };
      }),
    }),
  } as unknown as Db;

  let txAttempts = 0;

  const deps: MediaServiceDeps = {
    getContentDb: () => db,
    withContentTransaction: async (fn) => {
      const runOnce = async () => {
        txAttempts += 1;
        const snapshotCollections = new Map<string, RawDoc[]>();
        for (const [k, v] of collections.entries()) {
          snapshotCollections.set(k, cloneDoc(v));
        }
        const auditLen = auditEntries.length;
        let aborted = false;
        const session = {
          abortTransaction: vi.fn(async () => {
            aborted = true;
          }),
        } as unknown as ClientSession;

        try {
          const res = await fn(session);
          if (aborted) {
            collections.clear();
            for (const [k, v] of snapshotCollections.entries()) {
              collections.set(k, v);
            }
            auditEntries.length = auditLen;
            return res;
          }
          callOrder.push("tx-commit");
          return res;
        } catch (err) {
          collections.clear();
          for (const [k, v] of snapshotCollections.entries()) {
            collections.set(k, v);
          }
          auditEntries.length = auditLen;
          throw err;
        }
      };

      if (options.retryTxOnce) {
        // Simulate transient Mongo write-conflict retry on first attempt
        const snapshotCollections = new Map<string, RawDoc[]>();
        for (const [k, v] of collections.entries()) {
          snapshotCollections.set(k, cloneDoc(v));
        }
        const auditLen = auditEntries.length;
        const session = { abortTransaction: vi.fn(async () => {}) } as unknown as ClientSession;
        await fn(session);
        // Rollback first simulated retry attempt cleanly before real commit
        collections.clear();
        for (const [k, v] of snapshotCollections.entries()) {
          collections.set(k, v);
        }
        auditEntries.length = auditLen;
        callOrder.push("tx-retry-rolled-back");
      }

      return runOnce();
    },
    appendContentAuditEntry: vi.fn(async (entry) => {
      auditEntries.push(entry);
    }),
    findMediaUsages: vi.fn(async () => ({ ok: true as const, usedBy: [] })),
    putBlob: vi.fn(async (_cls, pathname, _body, opts) => ({
      ok: true as const,
      blob: {
        url: `https://abc123.public.blob.vercel-storage.com/${pathname}`,
        downloadUrl: `https://abc123.public.blob.vercel-storage.com/${pathname}?download=1`,
        pathname,
        contentType: opts.contentType,
        contentDisposition: "inline",
        etag: "etag",
      },
    })),
    headBlob: vi.fn(async (_cls, url) => {
      const parsed = new URL(url);
      const pathname = parsed.pathname.slice(1);
      const ext = pathname.split(".").pop();
      const contentType =
        ext === "pdf"
          ? "application/pdf"
          : ext === "mp3"
            ? "audio/mpeg"
            : "image/jpeg";
      return {
        ok: true as const,
        blob: {
          url,
          downloadUrl: `${url}?download=1`,
          pathname,
          contentType,
          size: 5_000_000,
          uploadedAt: new Date("2026-11-22T08:00:00Z"),
          contentDisposition: "inline",
          cacheControl: "public, max-age=2592000",
          etag: "etag",
        },
      };
    }),
    delBlob: vi.fn(async () => {
      callOrder.push("delBlob");
      return { ok: true as const };
    }),
    ensureMediaIndexes: vi.fn(async () => {}),
    allocateObjectId: () => new ObjectId(),
    now: () => new Date("2026-11-22T08:00:00Z"),
  };

  return {
    collections,
    getStore,
    auditEntries,
    callOrder,
    deps,
    getTxAttempts: () => txAttempts,
  };
}

const ADMIN: UserContentCaller = {
  kind: "user",
  userId: "65f1234567890abcdef12345",
  email: "admin@example.org",
  displayName: "Ana",
  permissions: new Set<PermissionKey>([
    "content:read",
    "content:write",
    "media:manage",
  ]),
};

const WRITER_ONLY: UserContentCaller = {
  kind: "user",
  userId: "65f1234567890abcdef12346",
  email: "writer@example.org",
  permissions: new Set<PermissionKey>(["content:read", "content:write"]),
};

const SERVICE_CALLER: ServiceContentCaller = {
  kind: "service",
  serviceId: "service:predica-ingest",
  label: "Predica Ingest",
  permissions: new Set<PermissionKey>(["content:write", "media:manage"]),
};

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function makeStoredMedia(
  overrides: Partial<StoredMediaDoc> = {},
): StoredMediaDoc {
  const _id = overrides._id ?? new ObjectId();
  const hex = _id.toHexString();
  const pathname = overrides.pathname ?? `media/${hex}/sample.jpg`;
  return {
    _id,
    pathname,
    url: `https://abc123.public.blob.vercel-storage.com/${pathname}`,
    filename: "sample.jpg",
    contentType: "image/jpeg",
    size: 120_000,
    sha256: SHA_A,
    width: 1200,
    height: 800,
    title: { "es-AR": "Foto iglesia" },
    alt: { "es-AR": "Congregación cantando" },
    createdBy: ADMIN.userId,
    createdAt: new Date("2026-11-22T08:00:00Z"),
    ...overrides,
  };
}

describe("media.service — upload, dedup, verification & service caller", () => {
  it("prepareMediaUpload enforces media:manage, allocates pathname, and detects SHA-256 duplicates", async () => {
    const h = createHarness();

    const denied = await prepareMediaUpload(
      WRITER_ONLY,
      { filename: "a.jpg", contentType: "image/jpeg", size: 1000, sha256: SHA_A },
      h.deps,
    );
    expect(denied).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    });

    const ready = await prepareMediaUpload(
      SERVICE_CALLER,
      { filename: "sermon.mp3", contentType: "audio/mpeg", size: 20_000_000, sha256: SHA_A },
      h.deps,
    );
    expect(ready.ok).toBe(true);
    if (ready.ok && ready.status === "ready") {
      expect(ready.multipart).toBe(true);
      expect(ready.pathname).toBe(`media/${ready.mediaId}/sermon.mp3`);
    }

    // Seed existing item with SHA_A -> next prepare returns duplicate
    const existing = makeStoredMedia({ sha256: SHA_A });
    h.getStore(COLLECTIONS.media).push(existing as unknown as RawDoc);

    const dup = await prepareMediaUpload(
      ADMIN,
      { filename: "copy.jpg", contentType: "image/jpeg", size: 120_000, sha256: SHA_A },
      h.deps,
    );
    expect(dup.ok).toBe(true);
    if (dup.ok) {
      expect(dup.status).toBe("duplicate");
      if (dup.status === "duplicate") {
        expect(dup.existing._id).toBe(existing._id.toHexString());
      }
    }
  });

  it("confirmMediaUpload verifies head(), enforces image alt/decorative (AC3), and deletes spoofed blobs (Edge case #9)", async () => {
    const h = createHarness();
    const id = new ObjectId().toHexString();
    const pathname = `media/${id}/portada.jpg`;
    const url = `https://abc123.public.blob.vercel-storage.com/${pathname}`;

    // Missing Spanish alt and not decorative -> refused with invalid
    const noAlt = await confirmMediaUpload(
      ADMIN,
      {
        mediaId: id,
        pathname,
        url,
        filename: "portada.jpg",
        sha256: SHA_A,
        width: 1600,
        height: 900,
        title: { "es-AR": "Portada" },
      },
      h.deps,
    );
    expect(noAlt.ok).toBe(false);
    if (!noAlt.ok) expect(noAlt.reason).toBe("invalid");

    // Valid decorative image via ServiceContentCaller succeeds & writes media.create audit
    const ok = await confirmMediaUpload(
      SERVICE_CALLER,
      {
        mediaId: id,
        pathname,
        url,
        filename: "portada.jpg",
        sha256: SHA_A,
        width: 1600,
        height: 900,
        title: { "es-AR": "Portada" },
        decorative: true,
      },
      h.deps,
    );
    expect(ok.ok).toBe(true);
    expect(h.auditEntries).toHaveLength(1);
    expect(h.auditEntries[0]?.action).toBe("media.create");
    expect(h.auditEntries[0]?.actorKind).toBe("service");

    // Spoofed MIME type returned by head() -> deletes blob and inserts nothing
    const id2 = new ObjectId().toHexString();
    const pathname2 = `media/${id2}/spoof.jpg`;
    const url2 = `https://abc123.public.blob.vercel-storage.com/${pathname2}`;
    vi.mocked(h.deps.headBlob).mockResolvedValueOnce({
      ok: true,
      blob: {
        url: url2,
        downloadUrl: url2,
        pathname: pathname2,
        contentType: "text/html",
        size: 1000,
        uploadedAt: new Date(),
        contentDisposition: "inline",
        cacheControl: "",
        etag: "e",
      },
    });

    const spoofed = await confirmMediaUpload(
      ADMIN,
      {
        mediaId: id2,
        pathname: pathname2,
        url: url2,
        filename: "spoof.jpg",
        sha256: SHA_B,
        title: { "es-AR": "Spoof" },
        decorative: true,
      },
      h.deps,
    );
    expect(spoofed.ok).toBe(false);
    if (!spoofed.ok) expect(spoofed.reason).toBe("policy-violation");
    expect(h.deps.delBlob).toHaveBeenCalledWith("public-media", url2);
    expect(h.getStore(COLLECTIONS.media)).toHaveLength(1);

    // M7: off-store URL is rejected BEFORE calling headBlob
    const headCallsBefore = vi.mocked(h.deps.headBlob).mock.calls.length;
    const idOffStore = new ObjectId().toHexString();
    const pathnameOffStore = `media/${idOffStore}/evil.jpg`;
    const offStore = await confirmMediaUpload(
      ADMIN,
      {
        mediaId: idOffStore,
        pathname: pathnameOffStore,
        url: `https://evil.example.com/${pathnameOffStore}`,
        filename: "evil.jpg",
        sha256: SHA_B,
        title: { "es-AR": "Off store" },
        decorative: true,
      },
      h.deps,
    );
    expect(offStore.ok).toBe(false);
    if (!offStore.ok) expect(offStore.reason).toBe("policy-violation");
    expect(vi.mocked(h.deps.headBlob).mock.calls.length).toBe(headCallsBefore);

    // M9: headBlob reporting size > cap deletes blob and returns policy-violation
    const idOversized = new ObjectId().toHexString();
    const pathnameOversized = `media/${idOversized}/huge.jpg`;
    const urlOversized = `https://abc123.public.blob.vercel-storage.com/${pathnameOversized}`;
    vi.mocked(h.deps.headBlob).mockResolvedValueOnce({
      ok: true,
      blob: {
        url: urlOversized,
        downloadUrl: urlOversized,
        pathname: pathnameOversized,
        contentType: "image/jpeg",
        size: MEDIA_SIZE_CAPS.image + 1,
        uploadedAt: new Date(),
        contentDisposition: "inline",
        cacheControl: "",
        etag: "e2",
      },
    });
    const oversized = await confirmMediaUpload(
      ADMIN,
      {
        mediaId: idOversized,
        pathname: pathnameOversized,
        url: urlOversized,
        filename: "huge.jpg",
        sha256: SHA_B,
        title: { "es-AR": "Oversized" },
        decorative: true,
      },
      h.deps,
    );
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.reason).toBe("policy-violation");
    expect(h.deps.delBlob).toHaveBeenCalledWith("public-media", urlOversized);
    expect(h.getStore(COLLECTIONS.media)).toHaveLength(1);
  });

  it("createServerMedia checks { sha256 } BEFORE putBlob by default (ICR-203 dedup), supports dedupeBySha256: false & { buffer } (ICR-200), and supports ServiceContentCaller", async () => {
    const h = createHarness();
    const pdfBytes = Buffer.from("%PDF-1.7 sermon summary");
    const expectedSha = createHash("sha256").update(pdfBytes).digest("hex");

    const first = await createServerMedia(
      SERVICE_CALLER,
      {
        filename: "predica.es-AR.pdf",
        contentType: "application/pdf",
        body: pdfBytes,
        title: { "es-AR": "Resumen prédica" },
      },
      h.deps,
    );
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.status).toBe("created");
      expect(first.reused).toBe(false);
      expect(first.doc.sha256).toBe(expectedSha);
    }
    expect(h.deps.putBlob).toHaveBeenCalledTimes(1);

    // Second call with identical bytes reuses existing doc with ZERO putBlob call
    const second = await createServerMedia(
      SERVICE_CALLER,
      {
        filename: "predica-copy.es-AR.pdf",
        contentType: "application/pdf",
        body: pdfBytes,
        title: { "es-AR": "Resumen prédica" },
      },
      h.deps,
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.status).toBe("duplicate");
      expect(second.reused).toBe(true);
    }
    expect(h.deps.putBlob).toHaveBeenCalledTimes(1);

    // M12 + C2.3: dedupeBySha256: false with `{ buffer }` uploads a fresh copy
    const third = await createServerMedia(
      SERVICE_CALLER,
      {
        filename: "predica-fresh.es-AR.pdf",
        contentType: "application/pdf",
        buffer: pdfBytes,
        title: { "es-AR": "Resumen prédica nueva" },
        dedupeBySha256: false,
      },
      h.deps,
    );
    expect(third.ok).toBe(true);
    if (third.ok) {
      expect(third.status).toBe("created");
      expect(third.reused).toBe(false);
    }
    expect(h.deps.putBlob).toHaveBeenCalledTimes(2);
  });
});

describe("media.service — AC5 delete guard per reference kind & post-commit delete order", () => {
  it.each([
    [
      "plain media field (post draft featuredImageId)",
      COLLECTIONS.posts,
      (mediaId: string): StoredContentEnvelope<PostFields> => {
        const draft: PostFields = {
          title: { "es-AR": "Artículo borrador" },
          slug: "articulo-borrador",
          featuredImageId: mediaId,
        };
        return {
          _id: new ObjectId(),
          draft,
          revision: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ADMIN.userId,
          _refs: extractReferences("post", { draft }),
        };
      },
    ],
    [
      "plain media field (post published featuredImageId only)",
      COLLECTIONS.posts,
      (mediaId: string): StoredContentEnvelope<PostFields> => {
        const draft: PostFields = {
          title: { "es-AR": "Artículo publicado" },
          slug: "articulo-publicado",
        };
        const published: PostFields = {
          ...draft,
          featuredImageId: mediaId,
        };
        return {
          _id: new ObjectId(),
          draft,
          published,
          revision: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ADMIN.userId,
          _refs: extractReferences("post", { draft, published }),
        };
      },
    ],
    [
      "mediaArray field (section.images)",
      COLLECTIONS.sections,
      (mediaId: string): StoredContentEnvelope<SectionFields> => {
        const draft: SectionFields = {
          machineName: "info-community",
          layout: "textBlock",
          headline: { "es-AR": "Comunidad" },
          images: [mediaId],
        };
        return {
          _id: new ObjectId(),
          draft,
          published: draft,
          revision: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ADMIN.userId,
          _refs: extractReferences("section", { draft, published: draft }),
        };
      },
    ],
    [
      "localizedMedia field (sermon pdfSummaryMediaId en-US)",
      COLLECTIONS.sermons,
      (mediaId: string): StoredContentEnvelope<SermonFields> => {
        const draft: SermonFields = {
          title: { "es-AR": "Prédica con PDF EN" },
          slug: "predica-pdf-en",
          pdfSummaryMediaId: { "es-AR": "other-id", "en-US": mediaId },
        };
        return {
          _id: new ObjectId(),
          draft,
          revision: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ADMIN.userId,
          _refs: extractReferences("sermon", { draft }),
        };
      },
    ],
    [
      "itemList media field (belief_collections.items[].imageId)",
      COLLECTIONS.beliefCollections,
      (mediaId: string): StoredContentEnvelope<BeliefCollectionFields> => {
        const draft: BeliefCollectionFields = {
          machineName: "our-creed",
          title: { "es-AR": "Credo" },
          items: [
            {
              title: { "es-AR": "La Biblia" },
              kind: "Creed",
              imageId: mediaId,
            },
          ],
        };
        return {
          _id: new ObjectId(),
          draft,
          published: draft,
          revision: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ADMIN.userId,
          _refs: extractReferences("beliefCollection", {
            draft,
            published: draft,
          }),
        };
      },
    ],
    [
      "rich-text embeddedMedia in es-AR draft",
      COLLECTIONS.sermons,
      (mediaId: string): StoredContentEnvelope<SermonFields> => {
        const draft: SermonFields = {
          title: { "es-AR": "Prédica embebida ES" },
          slug: "predica-embebida-es",
          content: {
            "es-AR": {
              type: "doc",
              content: [{ type: "embeddedMedia", attrs: { mediaId } }],
            },
          },
        };
        return {
          _id: new ObjectId(),
          draft,
          revision: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ADMIN.userId,
          _refs: extractReferences("sermon", { draft }),
        };
      },
    ],
    [
      "rich-text embeddedMedia in en-US published",
      COLLECTIONS.sermons,
      (mediaId: string): StoredContentEnvelope<SermonFields> => {
        const draft: SermonFields = {
          title: { "es-AR": "Prédica embebida EN" },
          slug: "predica-embebida-en",
        };
        const published: SermonFields = {
          ...draft,
          content: {
            "es-AR": { type: "doc", content: [{ type: "paragraph" }] },
            "en-US": {
              type: "doc",
              content: [{ type: "embeddedMedia", attrs: { mediaId } }],
            },
          },
        };
        return {
          _id: new ObjectId(),
          draft,
          published,
          revision: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          updatedBy: ADMIN.userId,
          _refs: extractReferences("sermon", { draft, published }),
        };
      },
    ],
  ])(
    "refuses delete when referenced via %s",
    async (_label, collection, buildRefDoc) => {
      const h = createHarness();
      const media = makeStoredMedia();
      const mediaId = media._id.toHexString();
      h.getStore(COLLECTIONS.media).push(media as unknown as RawDoc);
      h.getStore(collection).push(buildRefDoc(mediaId) as unknown as RawDoc);

      const res = await deleteMedia(SERVICE_CALLER, mediaId, h.deps);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe("in-use");
        if (res.reason === "in-use") {
          expect(res.usedBy).toHaveLength(1);
          expect(res.usedBy[0]?.collection).toBe(collection);
        }
      }
      expect(h.getStore(COLLECTIONS.media)).toHaveLength(1);
      expect(h.deps.delBlob).not.toHaveBeenCalled();
    },
  );

  it("deletes unused media in tx and calls delBlob strictly ONCE after commit even if tx retries", async () => {
    const h = createHarness({ retryTxOnce: true });
    const media = makeStoredMedia();
    const mediaId = media._id.toHexString();
    h.getStore(COLLECTIONS.media).push(media as unknown as RawDoc);

    const res = await deleteMedia(ADMIN, mediaId, h.deps);
    expect(res).toEqual({ ok: true, docId: mediaId, blobDeleted: true });
    expect(h.getStore(COLLECTIONS.media)).toHaveLength(0);
    expect(h.deps.delBlob).toHaveBeenCalledTimes(1);
    expect(h.callOrder).toEqual(["tx-retry-rolled-back", "tx-commit", "delBlob"]);
    expect(h.auditEntries).toHaveLength(1);
    expect(h.auditEntries[0]?.action).toBe("media.delete");
  });

  it("keeps DB deletion committed when post-commit delBlob fails", async () => {
    const h = createHarness();
    const media = makeStoredMedia();
    const mediaId = media._id.toHexString();
    h.getStore(COLLECTIONS.media).push(media as unknown as RawDoc);
    vi.mocked(h.deps.delBlob).mockResolvedValueOnce({
      ok: false,
      reason: "error",
      message: "Blob timeout",
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await deleteMedia(ADMIN, mediaId, h.deps);
    warnSpy.mockRestore();

    expect(res).toEqual({ ok: true, docId: mediaId, blobDeleted: false });
    expect(h.getStore(COLLECTIONS.media)).toHaveLength(0);
  });
});

describe("media.service — metadata updates, reads & unused filter", () => {
  it("lists media by kind, search query, and unused filter; content:write can read/pick", async () => {
    const h = createHarness();
    const usedImg = makeStoredMedia({
      filename: "hero.jpg",
      title: { "es-AR": "Portada principal" },
    });
    const unusedAudio = makeStoredMedia({
      filename: "sermon.mp3",
      contentType: "audio/mpeg",
      title: { "es-AR": "Prédica de gracia" },
      alt: undefined,
      width: undefined,
      height: undefined,
      durationSeconds: 2100,
    });
    h.getStore(COLLECTIONS.media).push(
      usedImg as unknown as RawDoc,
      unusedAudio as unknown as RawDoc,
    );
    const draft: PostFields = {
      title: { "es-AR": "Post" },
      featuredImageId: usedImg._id.toHexString(),
    };
    h.getStore(COLLECTIONS.posts).push({
      _id: new ObjectId(),
      draft,
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: ADMIN.userId,
      _refs: extractReferences("post", { draft }),
    } as unknown as RawDoc);

    // content:write user can list & pick without media:manage (AC6)
    const imagesOnly = await listMedia(WRITER_ONLY, { kind: "image" }, h.deps);
    expect(imagesOnly.ok).toBe(true);
    if (imagesOnly.ok) {
      expect(imagesOnly.items.map((i) => i._id)).toEqual([
        usedImg._id.toHexString(),
      ]);
    }

    // Unused filter excludes usedImg (AC7)
    const unusedRes = await listMedia(ADMIN, { unused: true }, h.deps);
    expect(unusedRes.ok).toBe(true);
    if (unusedRes.ok) {
      expect(unusedRes.items.map((i) => i._id)).toEqual([
        unusedAudio._id.toHexString(),
      ]);
    }

    // Batch lookup preserves requested order
    const batch = await getMediaByIds(
      WRITER_ONLY,
      [unusedAudio._id.toHexString(), usedImg._id.toHexString()],
      h.deps,
    );
    expect(batch.ok).toBe(true);
    if (batch.ok) {
      expect(batch.items.map((i) => i._id)).toEqual([
        unusedAudio._id.toHexString(),
        usedImg._id.toHexString(),
      ]);
    }

    const single = await getMediaById(
      WRITER_ONLY,
      usedImg._id.toHexString(),
      h.deps,
    );
    expect(single.ok).toBe(true);
  });

  it("updateMediaDetails enforces image alt invariant, blocks immutable fields, and allows setting missing audio duration once", async () => {
    const h = createHarness();
    const img = makeStoredMedia();
    const audioNoDuration = makeStoredMedia({
      filename: "imported.mp3",
      contentType: "audio/mpeg",
      alt: undefined,
      width: undefined,
      height: undefined,
      durationSeconds: undefined,
    });
    h.getStore(COLLECTIONS.media).push(
      img as unknown as RawDoc,
      audioNoDuration as unknown as RawDoc,
    );

    // Reject immutable field mutation
    const immutableRes = await updateMediaDetails(
      ADMIN,
      { mediaId: img._id.toHexString(), patch: { pathname: "media/evil.jpg" } },
      h.deps,
    );
    expect(immutableRes.ok).toBe(false);

    // Reject clearing Spanish alt without setting decorative: true
    const clearAltRes = await updateMediaDetails(
      ADMIN,
      {
        mediaId: img._id.toHexString(),
        patch: { alt: { "es-AR": "" }, decorative: false },
      },
      h.deps,
    );
    expect(clearAltRes.ok).toBe(false);

    // Allow setting decorative: true (clears alt)
    const decRes = await updateMediaDetails(
      ADMIN,
      {
        mediaId: img._id.toHexString(),
        patch: { title: { "es-AR": "Foto editada" }, decorative: true },
      },
      h.deps,
    );
    expect(decRes.ok).toBe(true);
    if (decRes.ok) {
      expect(decRes.doc.decorative).toBe(true);
      expect(decRes.doc.alt).toBeUndefined();
    }

    // Allow setting durationSeconds once on imported audio missing duration (Edge case #6)
    const setDur = await updateMediaDetails(
      ADMIN,
      {
        mediaId: audioNoDuration._id.toHexString(),
        patch: { durationSeconds: 2400 },
      },
      h.deps,
    );
    expect(setDur.ok).toBe(true);

    // Second attempt to overwrite already-set duration is refused
    const overwriteDur = await updateMediaDetails(
      ADMIN,
      {
        mediaId: audioNoDuration._id.toHexString(),
        patch: { durationSeconds: 1800 },
      },
      h.deps,
    );
    expect(overwriteDur.ok).toBe(false);
  });
});
