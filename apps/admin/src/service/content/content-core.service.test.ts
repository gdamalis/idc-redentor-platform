import { ObjectId } from "mongodb";
import type { ClientSession, Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@src/lib/rbac/permissions";
import type { ContentAuditEntry } from "@src/service/content-audit.service";
import type {
  ServiceContentCaller,
  UserContentCaller,
} from "@src/lib/content/caller";
import {
  authorService,
  beliefCollectionService,
  bibleVerseService,
  globalService,
  postService,
  sectionService,
  sermonService,
  topicService,
} from "./collections";
import {
  createContent,
  deleteContent,
  discardChanges,
  findMediaUsages,
  getContentById,
  getContentByNaturalKey,
  listContent,
  retryRevalidation,
  unpublishContent,
  updateSermonPdfMedia,
  type ContentServiceDeps,
} from "./content-core.service";

// ── Minimal transactional in-memory MongoDB harness ─────────────────────────

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
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    if (!cur[part] || typeof cur[part] !== "object") {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function unsetByPath(obj: Record<string, unknown>, path: string): void {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cur || typeof cur !== "object") return;
    cur = (cur as Record<string, unknown>)[parts[i]!];
  }
  if (cur && typeof cur === "object") {
    delete (cur as Record<string, unknown>)[parts[parts.length - 1]!];
  }
}

function matchesFilter(doc: RawDoc, filter: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    const actual = getByPath(doc, key);

    if (
      expected &&
      typeof expected === "object" &&
      !(expected instanceof ObjectId) &&
      !(expected instanceof Date) &&
      !Array.isArray(expected)
    ) {
      const ops = expected as Record<string, unknown>;
      if ("$exists" in ops) {
        const exists = actual !== undefined;
        if (exists !== ops.$exists) return false;
      }
      if ("$ne" in ops) {
        const neVal = ops.$ne;
        if (actual instanceof ObjectId && neVal instanceof ObjectId) {
          if (actual.equals(neVal)) return false;
        } else if (actual === neVal) {
          return false;
        }
      }
      if ("$elemMatch" in ops) {
        if (!Array.isArray(actual)) return false;
        const matcher = ops.$elemMatch as Record<string, unknown>;
        const matched = actual.some(
          (item) =>
            item &&
            typeof item === "object" &&
            Object.entries(matcher).every(
              ([mk, mv]) => (item as Record<string, unknown>)[mk] === mv,
            ),
        );
        if (!matched) return false;
      }
      continue;
    }

    if (Array.isArray(actual) && !Array.isArray(expected)) {
      if (!actual.includes(expected)) return false;
      continue;
    }

    if (actual instanceof ObjectId && expected instanceof ObjectId) {
      if (!actual.equals(expected)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

const UNIQUE_KEYS_BY_COLLECTION: Readonly<Record<string, readonly string[]>> = {
  posts: ["draft.slug", "published.slug"],
  sermons: ["draft.slug", "published.slug"],
  topics: [
    "draft.slug.es-AR",
    "draft.slug.en-US",
    "published.slug.es-AR",
    "published.slug.en-US",
  ],
  bible_verses: ["_naturalKey"],
  sections: ["draft.machineName"],
  belief_collections: ["draft.machineName"],
  event_banners: ["draft.machineName"],
  seo_entries: ["draft.machineName"],
  globals: ["draft.machineName"],
};

function createTestHarness(options?: {
  initial?: Partial<Record<string, RawDoc[]>>;
  isEmailSwitchOn?: boolean;
  revalidateResult?:
    | { readonly ok: true }
    | {
        readonly ok: false;
        readonly reason: "http-error" | "network-error" | "not-configured";
      };
}) {
  let committedStore = new Map<string, RawDoc[]>();
  for (const [col, docs] of Object.entries(options?.initial ?? {})) {
    committedStore.set(col, (docs ?? []).map(cloneDoc));
  }

  let workingStore = committedStore;
  let committedAudit: Array<Omit<ContentAuditEntry, "_id" | "at">> = [];
  let workingAudit = committedAudit;
  let inTransaction = false;
  let clock = new Date("2026-11-21T12:00:00Z").getTime();
  const events: string[] = [];

  function getColDocs(name: string): RawDoc[] {
    let list = workingStore.get(name);
    if (!list) {
      list = [];
      workingStore.set(name, list);
    }
    return list;
  }

  function assertUniqueness(name: string, doc: RawDoc, skipId?: ObjectId): void {
    const keys = UNIQUE_KEYS_BY_COLLECTION[name] ?? [];
    const list = getColDocs(name);
    for (const key of keys) {
      const val = getByPath(doc, key);
      if (typeof val !== "string" || val === "") continue;
      const collision = list.find(
        (other) =>
          (!skipId || !other._id.equals(skipId)) && getByPath(other, key) === val,
      );
      if (collision) {
        const err = Object.assign(new Error(`E11000 duplicate key on ${key}`), {
          code: 11000,
          keyPattern: { [key]: 1 },
        });
        throw err;
      }
    }
  }

  function collectionHandle(name: string) {
    return {
      findOne: async (filter: Record<string, unknown>) => {
        const found = getColDocs(name).find((d) => matchesFilter(d, filter));
        return found ? cloneDoc(found) : null;
      },
      find: (filter: Record<string, unknown>) => ({
        toArray: async () =>
          getColDocs(name)
            .filter((d) => matchesFilter(d, filter))
            .map(cloneDoc),
      }),
      insertOne: async (doc: Record<string, unknown>) => {
        const inserted: RawDoc = {
          ...(cloneDoc(doc) as Record<string, unknown>),
          _id: (doc._id as ObjectId | undefined) ?? new ObjectId(),
        };
        assertUniqueness(name, inserted);
        getColDocs(name).push(inserted);
        return { insertedId: inserted._id };
      },
      findOneAndUpdate: async (
        filter: Record<string, unknown>,
        update: {
          $set?: Record<string, unknown>;
          $unset?: Record<string, unknown>;
          $inc?: Record<string, number>;
        },
      ) => {
        const list = getColDocs(name);
        const idx = list.findIndex((d) => matchesFilter(d, filter));
        if (idx === -1) return null;
        const next = cloneDoc(list[idx]!);
        for (const [k, v] of Object.entries(update.$set ?? {})) {
          setByPath(next, k, cloneDoc(v));
        }
        for (const k of Object.keys(update.$unset ?? {})) {
          unsetByPath(next, k);
        }
        for (const [k, delta] of Object.entries(update.$inc ?? {})) {
          const cur = Number(getByPath(next, k) ?? 0);
          setByPath(next, k, cur + delta);
        }
        assertUniqueness(name, next, next._id);
        list[idx] = next;
        return cloneDoc(next);
      },
      updateOne: async (
        filter: Record<string, unknown>,
        update: {
          $set?: Record<string, unknown>;
          $inc?: Record<string, number>;
        },
      ) => {
        const list = getColDocs(name);
        const idx = list.findIndex((d) => matchesFilter(d, filter));
        if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
        const next = cloneDoc(list[idx]!);
        for (const [k, v] of Object.entries(update.$set ?? {})) {
          setByPath(next, k, cloneDoc(v));
        }
        for (const [k, delta] of Object.entries(update.$inc ?? {})) {
          const cur = Number(getByPath(next, k) ?? 0);
          setByPath(next, k, cur + delta);
        }
        list[idx] = next;
        return { matchedCount: 1, modifiedCount: 1 };
      },
      deleteOne: async (filter: Record<string, unknown>) => {
        const list = getColDocs(name);
        const idx = list.findIndex((d) => matchesFilter(d, filter));
        if (idx === -1) return { deletedCount: 0 };
        list.splice(idx, 1);
        return { deletedCount: 1 };
      },
    };
  }

  const db = {
    databaseName: "website-staging",
    collection: (name: string) => collectionHandle(name),
  } as unknown as Db;

  const revalidateMock = vi.fn(async () => {
    events.push(`revalidate(inTx=${inTransaction})`);
    return options?.revalidateResult ?? { ok: true as const };
  });

  const appendAuditMock = vi.fn(
    async (
      entry: Omit<ContentAuditEntry, "_id" | "at">,
      session: ClientSession,
    ) => {
      expect(inTransaction).toBe(true);
      expect(session).toBeDefined();
      workingAudit.push(cloneDoc(entry));
    },
  );

  const deps: ContentServiceDeps = {
    getContentDb: () => db,
    withContentTransaction: async (fn) => {
      let aborted = false;
      const snapshotStore = new Map<string, RawDoc[]>();
      for (const [k, v] of committedStore.entries()) {
        snapshotStore.set(k, v.map(cloneDoc));
      }
      workingStore = snapshotStore;
      workingAudit = committedAudit.map(cloneDoc);
      inTransaction = true;
      events.push("tx:start");

      const session = {
        abortTransaction: async () => {
          aborted = true;
        },
      } as unknown as ClientSession;

      try {
        const res = await fn(session);
        if (!aborted) {
          committedStore = workingStore;
          committedAudit = workingAudit;
          events.push("tx:commit");
        } else {
          events.push("tx:abort");
        }
        return res;
      } catch (err) {
        events.push("tx:error");
        throw err;
      } finally {
        workingStore = committedStore;
        workingAudit = committedAudit;
        inTransaction = false;
      }
    },
    appendContentAuditEntry: appendAuditMock,
    revalidateWebsite: revalidateMock,
    isPublishEmailsEnabled: () => options?.isEmailSwitchOn ?? false,
    ensureContentIndexes: vi.fn().mockResolvedValue(undefined),
    now: () => {
      clock += 1_000;
      return new Date(clock);
    },
  };

  return {
    deps,
    events,
    revalidateMock,
    appendAuditMock,
    getAudit: () => committedAudit,
    getDocs: (name: string) => committedStore.get(name) ?? [],
  };
}

// ── Callers & fixtures ──────────────────────────────────────────────────────

function userCaller(
  id: string,
  perms: PermissionKey[],
  displayName?: string,
): UserContentCaller {
  return {
    kind: "user",
    userId: id,
    email: `${id}@church.org`,
    displayName,
    permissions: new Set(perms),
  };
}

const reader = userCaller("reader-1", ["content:read"]);
const writer = userCaller("writer-1", ["content:read", "content:write"], "Ana");
const publisher = userCaller(
  "pub-1",
  ["content:read", "content:write", "content:publish"],
  "Pastor",
);
const protectedPublisher = userCaller(
  "admin-1",
  [
    "content:read",
    "content:write",
    "content:publish",
    "content:publish-protected",
    "media:manage",
  ],
  "Gabriel",
);
const mediaOnly = userCaller("media-1", ["media:manage"]);
const predicaService: ServiceContentCaller = {
  kind: "service",
  serviceId: "service:predica-ingest",
  label: "Predica Ingest",
  permissions: new Set(["content:write"]),
};
const pdfWorkerService: ServiceContentCaller = {
  kind: "service",
  serviceId: "service:pdf-worker",
  label: "PDF Worker",
  permissions: new Set(["content:write"]),
};

const sampleDoc = (text: string) => ({
  type: "doc" as const,
  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }],
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("AC1 & AC2 — permissions, transactions, compact audit", () => {
  it("enforces permissions at every entry point (write-only saves drafts, cannot publish)", async () => {
    const h = createTestHarness();

    // Reader cannot create
    const noCreate = await postService.create(
      reader,
      { title: { "es-AR": "Borrador" } },
      h.deps,
    );
    expect(noCreate).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    });

    // Writer creates and saves draft, each audited compactly inside a transaction
    const created = await postService.create(
      writer,
      { title: { "es-AR": "Borrador" } },
      h.deps,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.status).toBe("draft");
    expect(created.doc.revision).toBe(1);

    const saved = await postService.saveDraft(
      writer,
      {
        docId: created.doc._id,
        patch: { slug: "borrador-uno" },
        expectedRevision: 1,
      },
      h.deps,
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.changedFields).toEqual(["slug"]);
    expect(saved.doc.revision).toBe(2);

    // Writer CANNOT publish
    const pubRefused = await postService.publish(
      writer,
      { docId: created.doc._id, expectedRevision: 2 },
      h.deps,
    );
    expect(pubRefused).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    });

    // Audit records exist with compact metadata and ZERO snapshots
    expect(h.getAudit()).toHaveLength(2);
    expect(h.getAudit()[1]).toMatchObject({
      actorId: "writer-1",
      action: "content.save",
      collection: "posts",
      docId: created.doc._id,
      naturalKey: "borrador-uno",
      changedFields: ["slug"],
      revision: 2,
    });
    expect(h.getAudit()[1]).not.toHaveProperty("before");
    expect(h.getAudit()[1]).not.toHaveProperty("after");
    // Draft save never triggers site refresh
    expect(h.revalidateMock).not.toHaveBeenCalled();
  });

  it("supports service callers creating drafts and transitions updatedBy when a human edits (Edge case 9)", async () => {
    const h = createTestHarness();
    const created = await sermonService.create(
      predicaService,
      { title: { "es-AR": "Prédica auto" } },
      h.deps,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.doc.updatedBy).toBe("service:predica-ingest");

    const edited = await sermonService.saveDraft(
      writer,
      {
        docId: created.doc._id,
        patch: { title: { "es-AR": "Prédica revisada" } },
        expectedRevision: 1,
      },
      h.deps,
    );
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.doc.updatedBy).toBe("writer-1");
  });
});

describe("AC5 — optimistic concurrency, explicit overwrite, and zero-change no-op", () => {
  it("refuses stale revision with conflict info, allows overwrite: true, and no-ops unchanged saves", async () => {
    const h = createTestHarness();
    const created = await postService.create(
      writer,
      { title: { "es-AR": "Original" }, slug: "original" },
      h.deps,
    );
    if (!created.ok) throw new Error("setup failed");
    const docId = created.doc._id;

    // Editor 1 saves revision 1 -> 2
    const save1 = await postService.saveDraft(
      writer,
      { docId, patch: { title: { "es-AR": "Editado por Ana" } }, expectedRevision: 1 },
      h.deps,
    );
    expect(save1.ok).toBe(true);
    expect(h.getAudit()).toHaveLength(2);

    // Editor 2 submits stale revision 1 -> conflict, writes nothing
    const stale = await postService.saveDraft(
      publisher,
      { docId, patch: { title: { "es-AR": "Editado por Pastor" } }, expectedRevision: 1 },
      h.deps,
    );
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.reason).toBe("conflict");
      if (stale.reason === "conflict") {
        expect(stale.updatedBy).toBe("writer-1");
        expect(stale.updatedByLabel).toBe("Ana");
        expect(stale.updatedAt).toBeInstanceOf(Date);
        expect(stale.currentRevision).toBe(2);
      }
    }
    expect(h.getAudit()).toHaveLength(2);

    // Explicit overwrite succeeds
    const forced = await postService.saveDraft(
      publisher,
      {
        docId,
        patch: { title: { "es-AR": "Versión ganadora" } },
        expectedRevision: 1,
        overwrite: true,
      },
      h.deps,
    );
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(forced.doc.revision).toBe(3);
    expect(h.getAudit()).toHaveLength(3);
    expect(h.getAudit()[2]?.meta).toEqual({ overwrite: true });

    // Saving with zero changed fields is a pure no-op (no revision bump, no audit)
    const noop = await postService.saveDraft(
      publisher,
      {
        docId,
        patch: { title: { "es-AR": "Versión ganadora" }, slug: "original" },
        expectedRevision: 3,
      },
      h.deps,
    );
    expect(noop.ok).toBe(true);
    if (!noop.ok) return;
    expect(noop.noOp).toBe(true);
    expect(noop.changedFields).toEqual([]);
    expect(noop.doc.revision).toBe(3);
    expect(h.getAudit()).toHaveLength(3);
  });

  it("maps duplicate slug E11000 to structured duplicate-key fieldError without throwing (Edge case 12)", async () => {
    const h = createTestHarness();
    await postService.create(
      writer,
      { title: { "es-AR": "Primero" }, slug: "mismo-slug" },
      h.deps,
    );
    const dup = await postService.create(
      writer,
      { title: { "es-AR": "Segundo" }, slug: "mismo-slug" },
      h.deps,
    );
    expect(dup).toEqual({
      ok: false,
      reason: "duplicate-key",
      field: "slug",
      fieldErrors: { slug: ["duplicate-key"] },
    });
  });
});

describe("AC4, AC7, AC9 — strict publish, atomic cascade, post-commit revalidation & email switch", () => {
  it("refuses incomplete draft on publish, preserves draftPatch, and cascades never-published author & verse atomically", async () => {
    const h = createTestHarness({ isEmailSwitchOn: true });

    // Create never-published author & bible verse
    const authorRes = await authorService.create(
      writer,
      { name: "Pastor Juan" },
      h.deps,
    );
    const verseRes = await bibleVerseService.create(
      writer,
      {
        book: { "es-AR": "Juan" },
        chapter: 3,
        fromVerse: 16,
        text: { "es-AR": "Porque de tal manera amó Dios al mundo..." },
        version: { "es-AR": "NVI" },
      },
      h.deps,
    );
    if (!authorRes.ok || !verseRes.ok) throw new Error("setup failed");

    // Create incomplete sermon draft
    const sermonRes = await sermonService.create(
      writer,
      { title: { "es-AR": "La gracia" } },
      h.deps,
    );
    if (!sermonRes.ok) throw new Error("setup failed");

    // Attempt publish with incomplete draftPatch -> fails strict schema, STILL saves draftPatch
    const invalidPub = await sermonService.publish(
      publisher,
      {
        docId: sermonRes.doc._id,
        expectedRevision: 1,
        draftPatch: { slug: "la-gracia" },
      },
      h.deps,
    );
    expect(invalidPub.ok).toBe(false);
    if (!invalidPub.ok) expect(invalidPub.reason).toBe("invalid");
    expect(h.revalidateMock).not.toHaveBeenCalled();

    // Draft patch was preserved (revision advanced to 2)
    const afterInvalid = await sermonService.getById(
      reader,
      sermonRes.doc._id,
      h.deps,
    );
    expect(afterInvalid.ok && afterInvalid.doc.draft.slug).toBe("la-gracia");
    expect(afterInvalid.ok && afterInvalid.doc.revision).toBe(2);

    // Complete sermon referencing the never-published author & verse, and publish with notify: true
    const published = await sermonService.publish(
      publisher,
      {
        docId: sermonRes.doc._id,
        expectedRevision: 2,
        notify: true,
        draftPatch: {
          thesis: { "es-AR": "Dios ama al mundo" },
          mainPoints: { "es-AR": ["Punto 1"] },
          excerpt: { "es-AR": "Resumen" },
          sermonDate: "2026-11-21",
          content: { "es-AR": sampleDoc("Texto de la prédica") },
          featuredImageId: "media-img-1",
          preacherId: authorRes.doc._id,
          scriptureRefIds: [verseRes.doc._id],
          seoTitle: { "es-AR": "La gracia" },
          seoDescription: { "es-AR": "Descripción SEO" },
        },
      },
      h.deps,
    );

    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.status).toBe("published");
    expect(published.doc.publishedAt).toBeInstanceOf(Date);
    expect(published.doc.firstPublishedAt).toBeInstanceOf(Date);
    expect(published.revalidated).toBe(true);
    expect(published.notified).toBe(true);
    expect(published.cascaded).toEqual([
      { collection: "authors", id: authorRes.doc._id },
      { collection: "bible_verses", id: verseRes.doc._id },
    ]);

    // Verify cascade targets are now published
    const pubAuthor = await authorService.getById(reader, authorRes.doc._id, h.deps);
    const pubVerse = await bibleVerseService.getById(reader, verseRes.doc._id, h.deps);
    expect(pubAuthor.ok && pubAuthor.status).toBe("published");
    expect(pubVerse.ok && pubVerse.status).toBe("published");

    // Verify revalidate ran strictly AFTER transaction commit (never inside tx)
    const commitIdx = h.events.lastIndexOf("tx:commit");
    const revalIdx = h.events.lastIndexOf("revalidate(inTx=false)");
    expect(revalIdx).toBeGreaterThan(commitIdx);
    expect(h.events).not.toContain("revalidate(inTx=true)");

    // Verify revalidate payload included notify: true on first publish
    expect(h.revalidateMock).toHaveBeenLastCalledWith({
      type: "sermon",
      id: sermonRes.doc._id,
      notify: true,
    });

    // Unpublish -> re-publish is NOT a first publish -> notify: false (Edge case 8)
    const unpub = await sermonService.unpublish(
      publisher,
      { docId: sermonRes.doc._id, expectedRevision: published.doc.revision },
      h.deps,
    );
    expect(unpub.ok).toBe(true);
    if (!unpub.ok) return;
    expect(unpub.doc.firstPublishedAt).toEqual(published.doc.firstPublishedAt);

    const repub = await sermonService.publish(
      publisher,
      {
        docId: sermonRes.doc._id,
        expectedRevision: unpub.doc.revision,
        notify: true,
      },
      h.deps,
    );
    expect(repub.ok).toBe(true);
    if (!repub.ok) return;
    expect(repub.notified).toBe(false);
    expect(h.revalidateMock).toHaveBeenLastCalledWith({
      type: "sermon",
      id: sermonRes.doc._id,
      notify: false,
    });
  });

  it("keeps publish committed and reports revalidated: false when site refresh fails (AC7)", async () => {
    const h = createTestHarness({
      isEmailSwitchOn: false,
      revalidateResult: { ok: false, reason: "network-error" },
    });

    const author = await authorService.create(writer, { name: "Autor" }, h.deps);
    if (!author.ok) throw new Error("setup failed");

    const pub = await authorService.publish(
      publisher,
      { docId: author.doc._id, expectedRevision: 1 },
      h.deps,
    );
    expect(pub.ok).toBe(true);
    if (!pub.ok) return;
    expect(pub.revalidated).toBe(false);
    expect(pub.revalidateReason).toBe("network-error");
    expect(pub.notified).toBe(false);

    // Committed in DB despite refresh failure
    const reloaded = await authorService.getById(reader, author.doc._id, h.deps);
    expect(reloaded.ok && reloaded.status).toBe("published");

    // Manual retry repeats only the refresh call
    const retry = await retryRevalidation(
      publisher,
      "authors",
      author.doc._id,
      h.deps,
    );
    expect(retry).toEqual({
      ok: true,
      revalidated: false,
      revalidateReason: "network-error",
    });
  });
});

describe("AC6 — downgrade-proof protected publishing & belief collections", () => {
  it("blocks flip-off-then-publish, unpublish, and delete without content:publish-protected, and audits protected publishes", async () => {
    const h = createTestHarness();

    // Non-protected-publisher cannot create a protected topic
    const createDenied = await topicService.create(
      publisher,
      {
        name: { "es-AR": "Privacidad", "en-US": "Privacy" },
        slug: { "es-AR": "privacidad", "en-US": "privacy" },
        body: { "es-AR": sampleDoc("ES"), "en-US": sampleDoc("EN") },
        protected: true,
      },
      h.deps,
    );
    expect(createDenied).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    // Authorized user creates & publishes protected topic
    const created = await topicService.create(
      protectedPublisher,
      {
        name: { "es-AR": "Privacidad", "en-US": "Privacy" },
        slug: { "es-AR": "privacidad", "en-US": "privacy" },
        body: { "es-AR": sampleDoc("ES"), "en-US": sampleDoc("EN") },
        protected: true,
      },
      h.deps,
    );
    if (!created.ok) throw new Error("setup failed");

    const pub = await topicService.publish(
      protectedPublisher,
      { docId: created.doc._id, expectedRevision: 1 },
      h.deps,
    );
    expect(pub.ok).toBe(true);
    if (!pub.ok) return;
    expect(h.getAudit().at(-1)?.action).toBe("content.publish-protected");

    // Flip-off-then-publish bypass attempt by regular publisher (has write+publish, lacks publish-protected)
    const flipAttempt = await topicService.saveDraft(
      publisher,
      {
        docId: created.doc._id,
        patch: { protected: false },
        expectedRevision: pub.doc.revision,
      },
      h.deps,
    );
    expect(flipAttempt).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    // Regular writer CAN still edit non-protected fields on the draft (F §2.9) and discard
    const draftEdit = await topicService.saveDraft(
      writer,
      {
        docId: created.doc._id,
        patch: { body: { "es-AR": sampleDoc("ES nuevo"), "en-US": sampleDoc("EN new") } },
        expectedRevision: pub.doc.revision,
      },
      h.deps,
    );
    expect(draftEdit.ok).toBe(true);
    if (!draftEdit.ok) return;

    // Regular publisher CANNOT publish, unpublish, or delete it
    expect(
      await topicService.publish(
        publisher,
        { docId: created.doc._id, expectedRevision: draftEdit.doc.revision },
        h.deps,
      ),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });
    expect(
      await topicService.unpublish(
        publisher,
        { docId: created.doc._id, expectedRevision: draftEdit.doc.revision },
        h.deps,
      ),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });
    expect(
      await topicService.delete(
        publisher,
        { docId: created.doc._id, expectedRevision: draftEdit.doc.revision },
        h.deps,
      ),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    // Writer CAN discard changes on a protected topic (F §2.9)
    const discarded = await discardChanges(
      writer,
      {
        collection: "topics",
        docId: created.doc._id,
        expectedRevision: draftEdit.doc.revision,
      },
      h.deps,
    );
    expect(discarded.ok && discarded.status).toBe("published");

    // Localized natural-key lookup works for both es-AR and en-US (PM #10)
    const byEn = await topicService.getByNaturalKey(
      reader,
      { locale: "en-US", slug: "privacy" },
      h.deps,
    );
    expect(byEn.ok && byEn.doc._id).toBe(created.doc._id);
  });

  it("protects belief_collections by type and requires both locales at publish", async () => {
    const creedId = new ObjectId();
    const h = createTestHarness({
      initial: {
        belief_collections: [
          {
            _id: creedId,
            draft: {
              machineName: "our-creed",
              title: { "es-AR": "Nuestro credo" }, // missing en-US
              items: [
                {
                  title: { "es-AR": "Dios" },
                  description: { "es-AR": sampleDoc("Uno") },
                  kind: "Creed",
                },
              ],
            },
            revision: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            updatedBy: "importer",
            _refs: { mediaIds: [], contentRefs: [] },
          },
        ],
      },
    });

    // Regular publisher refused by type
    const denied = await beliefCollectionService.publish(
      publisher,
      { docId: creedId.toHexString(), expectedRevision: 1 },
      h.deps,
    );
    expect(denied).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    // Protected publisher fails strict schema when en-US missing
    const missingEn = await beliefCollectionService.publish(
      protectedPublisher,
      { docId: creedId.toHexString(), expectedRevision: 1 },
      h.deps,
    );
    expect(missingEn.ok).toBe(false);
    if (!missingEn.ok) expect(missingEn.reason).toBe("invalid");
  });
});

describe("Guards, fixed-entry filtering, media usage, and sermon PDF worker (PM #6-#10)", () => {
  it("hides unregistered fixed entries on reads, locks contactForm structure, and resolves global kind on saveDraft", async () => {
    const knownSecId = new ObjectId();
    const rogueSecId = new ObjectId();
    const contactId = new ObjectId();
    const h = createTestHarness({
      initial: {
        sections: [
          {
            _id: knownSecId,
            draft: { machineName: "our-mission", layout: "hero" },
            revision: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            updatedBy: "seed",
            _refs: { mediaIds: [], contentRefs: [] },
          },
          {
            _id: rogueSecId,
            draft: { machineName: "unregistered-rogue", layout: "cta" },
            revision: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            updatedBy: "seed",
            _refs: { mediaIds: [], contentRefs: [] },
          },
        ],
        globals: [
          {
            _id: contactId,
            draft: {
              kind: "contactForm",
              machineName: "contact-form",
              fields: [
                {
                  inputId: "name",
                  type: "text",
                  required: true,
                  name: { "es-AR": "Nombre" },
                },
              ],
            },
            revision: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            updatedBy: "seed",
            _refs: { mediaIds: [], contentRefs: [] },
          },
        ],
      },
    });

    // listContent & getById/getByNaturalKey filter out unregistered fixed entries (PM #7)
    const listed = await sectionService.list(reader, {}, h.deps);
    expect(listed.ok && listed.items.map((i) => i.doc._id)).toEqual([
      knownSecId.toHexString(),
    ]);
    expect(
      await getContentById(reader, "sections", rogueSecId.toHexString(), h.deps),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(
      await getContentByNaturalKey(reader, "sections", "unregistered-rogue", h.deps),
    ).toEqual({ ok: false, reason: "not-found" });

    // Fixed entries refuse create, unpublish, delete
    expect(
      await createContent(
        protectedPublisher,
        { collection: "sections", draft: { machineName: "x" } },
        h.deps,
      ),
    ).toMatchObject({ ok: false, reason: "operation-not-allowed", detail: "fixed-entry" });
    expect(
      await unpublishContent(
        protectedPublisher,
        { collection: "sections", docId: knownSecId.toHexString(), expectedRevision: 1 },
        h.deps,
      ),
    ).toMatchObject({ ok: false, reason: "operation-not-allowed", detail: "fixed-entry" });
    expect(
      await deleteContent(
        protectedPublisher,
        { collection: "sections", docId: knownSecId.toHexString(), expectedRevision: 1 },
        h.deps,
      ),
    ).toMatchObject({ ok: false, reason: "operation-not-allowed", detail: "fixed-entry" });

    // Globals saveDraft resolves concrete schema from existing.draft.kind (PM #8)
    // Rejects fields from another global kind (e.g. `socialLinks` from footer on contactForm)
    const wrongKindField = await globalService.saveDraft(
      writer,
      {
        docId: contactId.toHexString(),
        patch: { socialLinks: [] } as Record<string, unknown>,
        expectedRevision: 1,
      },
      h.deps,
    );
    expect(wrongKindField.ok).toBe(false);
    if (!wrongKindField.ok) expect(wrongKindField.reason).toBe("invalid");

    // Rejects contactForm structural change
    const badFields = await globalService.saveDraft(
      writer,
      {
        docId: contactId.toHexString(),
        patch: {
          fields: [
            { inputId: "email", type: "text", required: true, name: { "es-AR": "X" } },
          ],
        },
        expectedRevision: 1,
      },
      h.deps,
    );
    expect(badFields).toEqual({
      ok: false,
      reason: "operation-not-allowed",
      detail: "immutable-field",
      field: "fields",
    });
  });

  it("guards delete on references & published editorial entries, allows delete of unused published library entries with refresh, and lets media:manage check usages", async () => {
    const h = createTestHarness();

    const author = await authorService.create(
      writer,
      { name: "Autor Usado", avatarMediaId: "media-avatar-1" },
      h.deps,
    );
    if (!author.ok) throw new Error("setup failed");

    const post = await postService.create(
      writer,
      {
        title: { "es-AR": "Artículo" },
        slug: "articulo-1",
        authorId: author.doc._id,
        featuredImageId: "media-feat-1",
        content: { "es-AR": sampleDoc("Cuerpo") },
        publishedDate: "2026-11-21",
        seoTitle: { "es-AR": "SEO" },
        seoDescription: { "es-AR": "SEO desc" },
      },
      h.deps,
    );
    if (!post.ok) throw new Error("setup failed");

    // media:manage-only caller CAN call findMediaUsages (PM #6)
    const usages = await findMediaUsages(mediaOnly, "media-feat-1", h.deps);
    expect(usages.ok).toBe(true);
    if (usages.ok) {
      expect(usages.usedBy).toHaveLength(1);
      expect(usages.usedBy[0]?.docId).toBe(post.doc._id);
    }

    // Cannot delete author while referenced by draft post
    const delAuthorBlocked = await authorService.delete(
      publisher,
      { docId: author.doc._id, expectedRevision: 1 },
      h.deps,
    );
    expect(delAuthorBlocked.ok).toBe(false);
    if (!delAuthorBlocked.ok) {
      expect(delAuthorBlocked.reason).toBe("in-use");
      if (delAuthorBlocked.reason === "in-use") {
        expect(delAuthorBlocked.usedBy[0]?.docId).toBe(post.doc._id);
      }
    }

    // Publish post (cascades author too), then deleting published post is refused
    const pubPost = await postService.publish(
      publisher,
      { docId: post.doc._id, expectedRevision: 1 },
      h.deps,
    );
    expect(pubPost.ok).toBe(true);
    if (!pubPost.ok) return;

    expect(
      await postService.delete(
        publisher,
        { docId: post.doc._id, expectedRevision: pubPost.doc.revision },
        h.deps,
      ),
    ).toEqual({ ok: false, reason: "published-must-unpublish" });

    // Unpublish post, then writer deletes unpublished draft (Q4 Option A)
    const unpubPost = await postService.unpublish(
      publisher,
      { docId: post.doc._id, expectedRevision: pubPost.doc.revision },
      h.deps,
    );
    if (!unpubPost.ok) throw new Error("unpublish failed");

    const delPost = await postService.delete(
      writer,
      { docId: post.doc._id, expectedRevision: unpubPost.doc.revision },
      h.deps,
    );
    expect(delPost).toEqual({
      ok: true,
      docId: post.doc._id,
      wasPublished: false,
    });

    // Now author is unused (and published via cascade): writer cannot delete published library entry, publisher CAN and revalidates (AC7)
    const latestAuthor = await authorService.getById(reader, author.doc._id, h.deps);
    if (!latestAuthor.ok) throw new Error("read failed");

    expect(
      await authorService.delete(
        writer,
        { docId: author.doc._id, expectedRevision: latestAuthor.doc.revision },
        h.deps,
      ),
    ).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    });

    const delAuthor = await authorService.delete(
      publisher,
      { docId: author.doc._id, expectedRevision: latestAuthor.doc.revision },
      h.deps,
    );
    expect(delAuthor).toEqual({
      ok: true,
      docId: author.doc._id,
      wasPublished: true,
      revalidated: true,
    });
  });

  it("updateSermonPdfMedia checks contentHash, updates _refs, returns previousMediaIds, audits without bumping revision, and revalidates only when published updates (PM #9)", async () => {
    const h = createTestHarness();
    const preacher = await authorService.create(
      writer,
      { name: "Predicador PDF" },
      h.deps,
    );
    if (!preacher.ok) throw new Error("setup failed");
    const sermon = await sermonService.create(
      writer,
      {
        title: { "es-AR": "Sermón PDF" },
        slug: "sermon-pdf",
        thesis: { "es-AR": "Tesis" },
        mainPoints: { "es-AR": ["P1"] },
        excerpt: { "es-AR": "Ext" },
        sermonDate: "2026-11-21",
        content: { "es-AR": sampleDoc("Cuerpo") },
        featuredImageId: "media-img",
        preacherId: preacher.doc._id,
        pdfSummaryMediaId: { "es-AR": "pdf-old-es" },
        seoTitle: { "es-AR": "SEO" },
        seoDescription: { "es-AR": "SEO" },
        contentHash: "hash-v1",
      },
      h.deps,
    );
    if (!sermon.ok) throw new Error("setup failed");

    // Stale hash -> safe no-op, no audit, no revalidate
    const stale = await updateSermonPdfMedia(
      pdfWorkerService,
      {
        docId: sermon.doc._id,
        pdfSummaryMediaId: { "es-AR": "pdf-new-es" },
        expectedContentHash: "hash-old",
      },
      h.deps,
    );
    expect(stale).toEqual({
      ok: true,
      updatedDraft: false,
      updatedPublished: false,
      previousMediaIds: [],
      revalidated: false,
    });

    // Matching hash on unpublished draft -> updates draft, keeps revision=1 & human updatedBy="writer-1", no revalidate
    const updatedDraftOnly = await updateSermonPdfMedia(
      pdfWorkerService,
      {
        docId: sermon.doc._id,
        pdfSummaryMediaId: { "es-AR": "pdf-new-es", "en-US": "pdf-new-en" },
        expectedContentHash: "hash-v1",
      },
      h.deps,
    );
    expect(updatedDraftOnly).toEqual({
      ok: true,
      updatedDraft: true,
      updatedPublished: false,
      previousMediaIds: ["pdf-old-es"],
      revalidated: false,
    });
    expect(h.revalidateMock).not.toHaveBeenCalled();

    const reloaded = await sermonService.getById(reader, sermon.doc._id, h.deps);
    expect(reloaded.ok && reloaded.doc.revision).toBe(1);
    expect(reloaded.ok && reloaded.doc.updatedBy).toBe("writer-1");
    expect(h.getAudit().at(-1)?.action).toBe("content.pdf-update");

    // Old PDF is no longer in _refs; new PDFs ARE in _refs
    const oldUsage = await findMediaUsages(mediaOnly, "pdf-old-es", h.deps);
    const newUsage = await findMediaUsages(mediaOnly, "pdf-new-es", h.deps);
    expect(oldUsage.ok && oldUsage.usedBy).toHaveLength(0);
    expect(newUsage.ok && newUsage.usedBy).toHaveLength(1);
  });

  it("refuses unpublish when another PUBLISHED entry references the target (Edge case 4)", async () => {
    const h = createTestHarness();
    const author = await authorService.create(writer, { name: "A" }, h.deps);
    if (!author.ok) throw new Error("setup failed");

    const postA = await postService.create(
      writer,
      {
        title: { "es-AR": "Post A" },
        slug: "post-a",
        authorId: author.doc._id,
        featuredImageId: "m1",
        content: { "es-AR": sampleDoc("A") },
        publishedDate: "2026-11-20",
        seoTitle: { "es-AR": "A" },
        seoDescription: { "es-AR": "A" },
      },
      h.deps,
    );
    if (!postA.ok) throw new Error("setup failed");
    const pubA = await postService.publish(
      publisher,
      { docId: postA.doc._id, expectedRevision: 1 },
      h.deps,
    );
    if (!pubA.ok) throw new Error("setup failed");

    const postB = await postService.create(
      writer,
      {
        title: { "es-AR": "Post B" },
        slug: "post-b",
        authorId: author.doc._id,
        featuredImageId: "m1",
        content: { "es-AR": sampleDoc("B") },
        publishedDate: "2026-11-21",
        seoTitle: { "es-AR": "B" },
        seoDescription: { "es-AR": "B" },
        relatedPostIds: [postA.doc._id],
      },
      h.deps,
    );
    if (!postB.ok) throw new Error("setup failed");
    await postService.publish(
      publisher,
      { docId: postB.doc._id, expectedRevision: 1 },
      h.deps,
    );

    // Unpublishing Post A while published Post B references it is refused
    const blockedUnpub = await postService.unpublish(
      publisher,
      { docId: postA.doc._id, expectedRevision: pubA.doc.revision },
      h.deps,
    );
    expect(blockedUnpub.ok).toBe(false);
    if (!blockedUnpub.ok) {
      expect(blockedUnpub.reason).toBe("in-use");
      if (blockedUnpub.reason === "in-use") {
        expect(blockedUnpub.usedBy[0]?.docId).toBe(postB.doc._id);
      }
    }
  });
});

// Keep listContent import exercised cleanly
describe("listContent pagination & status filter", () => {
  it("filters by derived status and paginates", async () => {
    const h = createTestHarness();
    const a1 = await authorService.create(writer, { name: "A1" }, h.deps);
    await authorService.create(writer, { name: "A2" }, h.deps);
    if (!a1.ok) throw new Error("setup failed");
    await authorService.publish(
      publisher,
      { docId: a1.doc._id, expectedRevision: 1 },
      h.deps,
    );

    const draftsOnly = await listContent(
      reader,
      "authors",
      { status: "draft", page: 1, pageSize: 10 },
      h.deps,
    );
    expect(draftsOnly.ok && draftsOnly.total).toBe(1);
    const allPaged = await listContent(
      reader,
      "authors",
      { page: 1, pageSize: 1 },
      h.deps,
    );
    expect(allPaged.ok && allPaged.total).toBe(2);
    expect(allPaged.ok && allPaged.items).toHaveLength(1);
  });

  it("unsets cleared optional fields via $unset (never BSON null) and skips unchanged fields (H #5)", async () => {
    const h = createTestHarness();
    const created = await postService.create(
      writer,
      {
        title: { "es-AR": "Título" },
        subtitle: { "es-AR": "Subtítulo" },
        slug: "mi-post",
      },
      h.deps,
    );
    if (!created.ok) throw new Error("setup failed");

    // Clearing optional `subtitle` removes the key completely (never null)
    const cleared = await postService.saveDraft(
      writer,
      {
        docId: created.doc._id,
        patch: { subtitle: undefined },
        expectedRevision: 1,
      },
      h.deps,
    );
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.changedFields).toEqual(["subtitle"]);
    expect(cleared.doc.draft).not.toHaveProperty("subtitle");
    expect(JSON.stringify(h.getDocs("posts")[0])).not.toContain("null");
  });

  it("aborts the entire publish transaction atomically if a cascaded never-published verse fails strict validation (Edge case 14)", async () => {
    const h = createTestHarness();
    const author = await authorService.create(writer, { name: "Predicador" }, h.deps);
    // Incomplete verse draft: missing `text` and `version` required by publishable schema
    const badVerse = await bibleVerseService.create(
      writer,
      { book: { "es-AR": "Salmos" }, chapter: 23, fromVerse: 1 },
      h.deps,
    );
    if (!author.ok || !badVerse.ok) throw new Error("setup failed");

    const sermon = await sermonService.create(
      writer,
      {
        title: { "es-AR": "El buen pastor" },
        slug: "el-buen-pastor",
        thesis: { "es-AR": "Tesis" },
        mainPoints: { "es-AR": ["P1"] },
        excerpt: { "es-AR": "Ext" },
        sermonDate: "2026-11-21",
        content: { "es-AR": sampleDoc("Cuerpo") },
        featuredImageId: "media-1",
        preacherId: author.doc._id,
        scriptureRefIds: [badVerse.doc._id],
        seoTitle: { "es-AR": "SEO" },
        seoDescription: { "es-AR": "SEO" },
      },
      h.deps,
    );
    if (!sermon.ok) throw new Error("setup failed");

    const failedPub = await sermonService.publish(
      publisher,
      { docId: sermon.doc._id, expectedRevision: 1 },
      h.deps,
    );
    expect(failedPub.ok).toBe(false);
    if (!failedPub.ok) expect(failedPub.reason).toBe("invalid");

    // Atomic rollback: neither author nor sermon was published, and revalidate never fired
    const authorAfter = await authorService.getById(reader, author.doc._id, h.deps);
    const sermonAfter = await sermonService.getById(reader, sermon.doc._id, h.deps);
    expect(authorAfter.ok && authorAfter.status).toBe("draft");
    expect(sermonAfter.ok && sermonAfter.status).toBe("draft");
    expect(h.revalidateMock).not.toHaveBeenCalled();
  });

  it("updateSermonPdfMedia updates published copy and revalidates when published contentHash matches", async () => {
    const h = createTestHarness();
    const author = await authorService.create(writer, { name: "Predicador" }, h.deps);
    if (!author.ok) throw new Error("setup failed");

    const sermon = await sermonService.create(
      writer,
      {
        title: { "es-AR": "Sermón live PDF" },
        slug: "sermon-live-pdf",
        thesis: { "es-AR": "Tesis" },
        mainPoints: { "es-AR": ["P1"] },
        excerpt: { "es-AR": "Ext" },
        sermonDate: "2026-11-21",
        content: { "es-AR": sampleDoc("Cuerpo") },
        featuredImageId: "media-1",
        preacherId: author.doc._id,
        pdfSummaryMediaId: { "es-AR": "pdf-v1" },
        seoTitle: { "es-AR": "SEO" },
        seoDescription: { "es-AR": "SEO" },
        contentHash: "hash-live",
      },
      h.deps,
    );
    if (!sermon.ok) throw new Error("setup failed");

    const pub = await sermonService.publish(
      publisher,
      { docId: sermon.doc._id, expectedRevision: 1 },
      h.deps,
    );
    if (!pub.ok) throw new Error("publish failed");
    h.revalidateMock.mockClear();

    const updated = await updateSermonPdfMedia(
      pdfWorkerService,
      {
        docId: sermon.doc._id,
        pdfSummaryMediaId: { "es-AR": "pdf-v2" },
        expectedContentHash: "hash-live",
      },
      h.deps,
    );
    expect(updated).toEqual({
      ok: true,
      updatedDraft: true,
      updatedPublished: true,
      previousMediaIds: ["pdf-v1"],
      revalidated: true,
    });
    expect(h.revalidateMock).toHaveBeenCalledTimes(1);
    expect(h.revalidateMock).toHaveBeenCalledWith({
      type: "sermon",
      id: sermon.doc._id,
      notify: false,
    });

    // Status stays "published" (did not flip to "changed") and revision did not bump
    const after = await sermonService.getById(reader, sermon.doc._id, h.deps);
    expect(after.ok && after.status).toBe("published");
    expect(after.ok && after.doc.revision).toBe(pub.doc.revision);
  });

  it("records removed/$unset optional fields in content.publish and content.discard audit changedFields (C1)", async () => {
    const h = createTestHarness();
    const author = await authorService.create(writer, { name: "A" }, h.deps);
    if (!author.ok) throw new Error("setup failed");

    const post = await postService.create(
      writer,
      {
        title: { "es-AR": "Post" },
        subtitle: { "es-AR": "Sub" },
        slug: "post-unset-audit",
        authorId: author.doc._id,
        featuredImageId: "m1",
        content: { "es-AR": sampleDoc("Body") },
        publishedDate: "2026-11-21",
        seoTitle: { "es-AR": "SEO" },
        seoDescription: { "es-AR": "SEO" },
      },
      h.deps,
    );
    if (!post.ok) throw new Error("setup failed");

    const pub1 = await postService.publish(
      publisher,
      { docId: post.doc._id, expectedRevision: 1 },
      h.deps,
    );
    if (!pub1.ok) throw new Error("pub1 failed");

    // Remove optional `subtitle` in draft, then publish -> `subtitle` MUST appear in publish audit
    const unsetSave = await postService.saveDraft(
      writer,
      {
        docId: post.doc._id,
        patch: { subtitle: undefined },
        expectedRevision: pub1.doc.revision,
      },
      h.deps,
    );
    if (!unsetSave.ok) throw new Error("save failed");

    const pub2 = await postService.publish(
      publisher,
      { docId: post.doc._id, expectedRevision: unsetSave.doc.revision },
      h.deps,
    );
    expect(pub2.ok).toBe(true);
    if (!pub2.ok) return;
    expect(h.getAudit().at(-1)).toMatchObject({
      action: "content.publish",
      changedFields: ["subtitle"],
    });

    // Add optional `subtitle` in draft (absent in published), then discard -> `subtitle` MUST appear in discard audit
    const addSave = await postService.saveDraft(
      writer,
      {
        docId: post.doc._id,
        patch: { subtitle: { "es-AR": "Temporal" } },
        expectedRevision: pub2.doc.revision,
      },
      h.deps,
    );
    if (!addSave.ok) throw new Error("addSave failed");

    const disc = await postService.discardChanges(
      writer,
      { docId: post.doc._id, expectedRevision: addSave.doc.revision },
      h.deps,
    );
    expect(disc.ok).toBe(true);
    expect(h.getAudit().at(-1)).toMatchObject({
      action: "content.discard",
      changedFields: ["subtitle"],
    });
  });

  it("refuses discardChanges without content:publish-protected when draft.protected differs from published.protected (C2)", async () => {
    const h = createTestHarness();
    const topic = await topicService.create(
      writer,
      {
        name: { "es-AR": "Legal", "en-US": "Legal" },
        slug: { "es-AR": "legal", "en-US": "legal" },
        body: { "es-AR": sampleDoc("ES"), "en-US": sampleDoc("EN") },
      },
      h.deps,
    );
    if (!topic.ok) throw new Error("setup failed");

    // Publish unprotected (`published.protected` is absent)
    const pub = await topicService.publish(
      publisher,
      { docId: topic.doc._id, expectedRevision: 1 },
      h.deps,
    );
    if (!pub.ok) throw new Error("pub failed");

    // Authorized admin flips `draft.protected = true` in preparation
    const flagged = await topicService.saveDraft(
      protectedPublisher,
      {
        docId: topic.doc._id,
        patch: { protected: true },
        expectedRevision: pub.doc.revision,
      },
      h.deps,
    );
    if (!flagged.ok) throw new Error("flagged failed");

    // Writer without `content:publish-protected` CANNOT revert `draft.protected` via discardChanges
    const refused = await topicService.discardChanges(
      writer,
      { docId: topic.doc._id, expectedRevision: flagged.doc.revision },
      h.deps,
    );
    expect(refused).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    // Authorized protectedPublisher CAN discard it
    const allowed = await topicService.discardChanges(
      protectedPublisher,
      { docId: topic.doc._id, expectedRevision: flagged.doc.revision },
      h.deps,
    );
    expect(allowed.ok && allowed.status).toBe("published");
  });

  it("rejects untrusted runtime locale values in topics getContentByNaturalKey (C3)", async () => {
    const h = createTestHarness();
    await topicService.create(
      writer,
      {
        name: { "es-AR": "Info" },
        slug: { "es-AR": "info" },
      },
      h.deps,
    );

    const badLocale = await getContentByNaturalKey(
      reader,
      "topics",
      { locale: "fr-FR" as "es-AR", slug: "info" },
      h.deps,
    );
    expect(badLocale).toEqual({ ok: false, reason: "not-found" });

    const dottedLocale = await getContentByNaturalKey(
      reader,
      "topics",
      { locale: "es-AR.$ne" as "es-AR", slug: "info" },
      h.deps,
    );
    expect(dottedLocale).toEqual({ ok: false, reason: "not-found" });
  });
});

// ── Concurrent snapshot-isolation harness for reference write-skew tests ────

interface TxContext {
  readonly id: number;
  readonly snapshotVersion: number;
  readonly store: Map<string, RawDoc[]>;
  readonly audit: Array<Omit<ContentAuditEntry, "_id" | "at">>;
  readonly writtenKeys: Set<string>;
  aborted: boolean;
}

const WRITE_CONFLICT_TAG = Symbol("SimulatedWriteConflict");

function createWriteConflictError(key: string): Error & { [WRITE_CONFLICT_TAG]: true } {
  return Object.assign(new Error(`WriteConflict on ${key}`), {
    [WRITE_CONFLICT_TAG]: true as const,
  });
}

function isSimulatedWriteConflict(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as unknown as Record<symbol, unknown>)[WRITE_CONFLICT_TAG] === true
  );
}

function createSnapshotIsolationHarness(options?: {
  onBeforeUpdateOne?: (
    collection: string,
    txId: number,
    attempt: number,
  ) => Promise<void>;
}) {
  let committedVersion = 0;
  const committedStore = new Map<string, RawDoc[]>();
  let committedAudit: Array<Omit<ContentAuditEntry, "_id" | "at">> = [];
  const committedKeyVersion = new Map<string, number>();
  let nextTxId = 0;
  let clock = new Date("2026-11-21T15:00:00Z").getTime();
  const retryCounts = new Map<number, number>();

  function cloneStoreMap(src: Map<string, RawDoc[]>): Map<string, RawDoc[]> {
    const out = new Map<string, RawDoc[]>();
    for (const [k, v] of src.entries()) {
      out.set(k, v.map(cloneDoc));
    }
    return out;
  }

  function getTx(session?: ClientSession): TxContext | null {
    return (
      (session as unknown as { __tx?: TxContext } | undefined)?.__tx ?? null
    );
  }

  function getStoreFor(session?: ClientSession): Map<string, RawDoc[]> {
    return getTx(session)?.store ?? committedStore;
  }

  function getDocsIn(
    store: Map<string, RawDoc[]>,
    name: string,
  ): RawDoc[] {
    let list = store.get(name);
    if (!list) {
      list = [];
      store.set(name, list);
    }
    return list;
  }

  function assertNoWriteConflict(tx: TxContext | null, key: string): void {
    if (!tx) return;
    const latestVer = committedKeyVersion.get(key) ?? 0;
    if (latestVer > tx.snapshotVersion) {
      throw createWriteConflictError(key);
    }
    tx.writtenKeys.add(key);
  }

  function collectionHandle(name: string) {
    return {
      findOne: async (
        filter: Record<string, unknown>,
        opts?: { session?: ClientSession },
      ) => {
        const list = getDocsIn(getStoreFor(opts?.session), name);
        const found = list.find((d) => matchesFilter(d, filter));
        return found ? cloneDoc(found) : null;
      },
      find: (
        filter: Record<string, unknown>,
        opts?: { session?: ClientSession },
      ) => ({
        toArray: async () =>
          getDocsIn(getStoreFor(opts?.session), name)
            .filter((d) => matchesFilter(d, filter))
            .map(cloneDoc),
      }),
      insertOne: async (
        doc: Record<string, unknown>,
        opts?: { session?: ClientSession },
      ) => {
        const tx = getTx(opts?.session);
        const store = getStoreFor(opts?.session);
        const inserted: RawDoc = {
          ...(cloneDoc(doc) as Record<string, unknown>),
          _id: (doc._id as ObjectId | undefined) ?? new ObjectId(),
        };
        const key = `${name}:${inserted._id.toHexString()}`;
        assertNoWriteConflict(tx, key);
        getDocsIn(store, name).push(inserted);
        return { insertedId: inserted._id };
      },
      findOneAndUpdate: async (
        filter: Record<string, unknown>,
        update: {
          $set?: Record<string, unknown>;
          $unset?: Record<string, unknown>;
          $inc?: Record<string, number>;
        },
        opts?: { session?: ClientSession },
      ) => {
        const tx = getTx(opts?.session);
        const store = getStoreFor(opts?.session);
        const list = getDocsIn(store, name);
        const idx = list.findIndex((d) => matchesFilter(d, filter));
        if (idx === -1) return null;
        const key = `${name}:${list[idx]!._id.toHexString()}`;
        assertNoWriteConflict(tx, key);
        const next = cloneDoc(list[idx]!);
        for (const [k, v] of Object.entries(update.$set ?? {})) {
          setByPath(next, k, cloneDoc(v));
        }
        for (const k of Object.keys(update.$unset ?? {})) {
          unsetByPath(next, k);
        }
        for (const [k, delta] of Object.entries(update.$inc ?? {})) {
          const cur = Number(getByPath(next, k) ?? 0);
          setByPath(next, k, cur + delta);
        }
        list[idx] = next;
        return cloneDoc(next);
      },
      updateOne: async (
        filter: Record<string, unknown>,
        update: {
          $set?: Record<string, unknown>;
          $inc?: Record<string, number>;
        },
        opts?: { session?: ClientSession },
      ) => {
        const tx = getTx(opts?.session);
        if (tx && options?.onBeforeUpdateOne) {
          const attempt = (retryCounts.get(tx.id) ?? 0) + 1;
          await options.onBeforeUpdateOne(name, tx.id, attempt);
        }
        const store = getStoreFor(opts?.session);
        const list = getDocsIn(store, name);
        const idx = list.findIndex((d) => matchesFilter(d, filter));
        if (idx === -1) return { matchedCount: 0, modifiedCount: 0 };
        const key = `${name}:${list[idx]!._id.toHexString()}`;
        assertNoWriteConflict(tx, key);
        const next = cloneDoc(list[idx]!);
        for (const [k, v] of Object.entries(update.$set ?? {})) {
          setByPath(next, k, cloneDoc(v));
        }
        for (const [k, delta] of Object.entries(update.$inc ?? {})) {
          const cur = Number(getByPath(next, k) ?? 0);
          setByPath(next, k, cur + delta);
        }
        list[idx] = next;
        return { matchedCount: 1, modifiedCount: 1 };
      },
      deleteOne: async (
        filter: Record<string, unknown>,
        opts?: { session?: ClientSession },
      ) => {
        const tx = getTx(opts?.session);
        const store = getStoreFor(opts?.session);
        const list = getDocsIn(store, name);
        const idx = list.findIndex((d) => matchesFilter(d, filter));
        if (idx === -1) return { deletedCount: 0 };
        const key = `${name}:${list[idx]!._id.toHexString()}`;
        assertNoWriteConflict(tx, key);
        list.splice(idx, 1);
        return { deletedCount: 1 };
      },
    };
  }

  const db = {
    databaseName: "website-staging",
    collection: (name: string) => collectionHandle(name),
  } as unknown as Db;

  const deps: ContentServiceDeps = {
    getContentDb: () => db,
    withContentTransaction: async (fn) => {
      const txId = ++nextTxId;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const tx: TxContext = {
          id: txId,
          snapshotVersion: committedVersion,
          store: cloneStoreMap(committedStore),
          audit: committedAudit.map(cloneDoc),
          writtenKeys: new Set(),
          aborted: false,
        };
        const session = {
          __tx: tx,
          abortTransaction: async () => {
            tx.aborted = true;
          },
        } as unknown as ClientSession;

        try {
          const res = await fn(session);
          if (!tx.aborted) {
            for (const key of tx.writtenKeys) {
              if ((committedKeyVersion.get(key) ?? 0) > tx.snapshotVersion) {
                throw createWriteConflictError(key);
              }
            }
            committedVersion += 1;
            // Apply only the collections/docs written by this tx onto committedStore
            for (const key of tx.writtenKeys) {
              const [colName, idHex] = key.split(":") as [string, string];
              const targetCol = getDocsIn(committedStore, colName);
              const srcDoc = getDocsIn(tx.store, colName).find(
                (d) => d._id.toHexString() === idHex,
              );
              const existingIdx = targetCol.findIndex(
                (d) => d._id.toHexString() === idHex,
              );
              if (!srcDoc) {
                if (existingIdx !== -1) targetCol.splice(existingIdx, 1);
              } else if (existingIdx === -1) {
                targetCol.push(cloneDoc(srcDoc));
              } else {
                targetCol[existingIdx] = cloneDoc(srcDoc);
              }
              committedKeyVersion.set(key, committedVersion);
            }
            const addedAudit = tx.audit.slice(committedAudit.length);
            committedAudit = [...committedAudit, ...addedAudit];
          }
          return res;
        } catch (err) {
          if (isSimulatedWriteConflict(err) && attempt < 5) {
            retryCounts.set(txId, (retryCounts.get(txId) ?? 0) + 1);
            continue;
          }
          throw err;
        }
      }
      throw new Error("Exhausted transaction retries");
    },
    appendContentAuditEntry: async (entry, session) => {
      const tx = getTx(session);
      if (tx) {
        tx.audit.push(cloneDoc(entry));
      } else {
        committedAudit.push(cloneDoc(entry));
      }
    },
    revalidateWebsite: vi.fn().mockResolvedValue({ ok: true as const }),
    isPublishEmailsEnabled: () => false,
    ensureContentIndexes: vi.fn().mockResolvedValue(undefined),
    now: () => {
      clock += 1_000;
      return new Date(clock);
    },
  };

  return {
    deps,
    getDocs: (name: string) => committedStore.get(name) ?? [],
    getTotalRetries: () =>
      [...retryCounts.values()].reduce((sum, n) => sum + n, 0),
  };
}

describe("Reference write/delete serialization (write-skew guard)", () => {
  it("rejects createContent and saveDraft referencing non-existent targets and only bumps _refGuardRev on newly added refs", async () => {
    const h = createTestHarness();
    const missingAuthorId = new ObjectId().toHexString();

    // Creating a post referencing a missing/deleted author fails closed
    const badCreate = await postService.create(
      writer,
      { title: { "es-AR": "Post huérfano" }, authorId: missingAuthorId },
      h.deps,
    );
    expect(badCreate.ok).toBe(false);
    if (!badCreate.ok) {
      expect(badCreate.reason).toBe("invalid");
      if (badCreate.reason === "invalid") {
        expect(badCreate.fieldErrors.authors).toBeDefined();
      }
    }
    expect(h.getDocs("posts")).toHaveLength(0);
    expect(h.getAudit()).toHaveLength(0);

    // Valid author + post without authorId initially
    const author = await authorService.create(writer, { name: "Autor Real" }, h.deps);
    const post = await postService.create(
      writer,
      { title: { "es-AR": "Post sin autor" } },
      h.deps,
    );
    if (!author.ok || !post.ok) throw new Error("setup failed");

    // Saving draft referencing missing author fails closed without modifying post
    const badSave = await postService.saveDraft(
      writer,
      {
        docId: post.doc._id,
        patch: { authorId: missingAuthorId },
        expectedRevision: 1,
      },
      h.deps,
    );
    expect(badSave.ok).toBe(false);
    if (!badSave.ok) expect(badSave.reason).toBe("invalid");

    // Introducing valid authorId bumps _refGuardRev on author WITHOUT changing author revision
    const linked = await postService.saveDraft(
      writer,
      {
        docId: post.doc._id,
        patch: { authorId: author.doc._id },
        expectedRevision: 1,
      },
      h.deps,
    );
    expect(linked.ok).toBe(true);
    const authorAfterLink = h.getDocs("authors")[0]!;
    expect(authorAfterLink.revision).toBe(1);
    expect(authorAfterLink._refGuardRev).toBe(1);

    // Subsequent unrelated title edit does NOT touch author._refGuardRev again
    const titleOnly = await postService.saveDraft(
      writer,
      {
        docId: post.doc._id,
        patch: { title: { "es-AR": "Post con autor" } },
        expectedRevision: 2,
      },
      h.deps,
    );
    expect(titleOnly.ok).toBe(true);
    expect(h.getDocs("authors")[0]!._refGuardRev).toBe(1);
  });

  it("serializes concurrent deleteContent(author) and saveDraft(post -> author) when saveDraft commits first (delete retries and returns in-use)", async () => {
    let releaseDelete!: () => void;
    let deletePaused!: () => void;
    const deleteAtBarrier = new Promise<void>((resolve) => {
      deletePaused = resolve;
    });
    const deleteMayProceed = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    let pausedOnce = false;

    const h = createSnapshotIsolationHarness({
      onBeforeUpdateOne: async (collection, _txId, attempt) => {
        // Pause the first attempt of deleteContent right before its target guard write
        if (collection === "authors" && attempt === 1 && !pausedOnce) {
          pausedOnce = true;
          deletePaused();
          await deleteMayProceed;
        }
      },
    });

    const author = await authorService.create(writer, { name: "Autor Carrera" }, h.deps);
    const post = await postService.create(
      writer,
      { title: { "es-AR": "Post Carrera" } },
      h.deps,
    );
    if (!author.ok || !post.ok) throw new Error("setup failed");

    // Start deleteContent on snapshot before post references author
    const deletePromise = authorService.delete(
      writer,
      { docId: author.doc._id, expectedRevision: 1 },
      h.deps,
    );
    await deleteAtBarrier;

    // While deleteContent is open on the stale snapshot, saveDraft links author and commits
    const saveRes = await postService.saveDraft(
      writer,
      {
        docId: post.doc._id,
        patch: { authorId: author.doc._id },
        expectedRevision: 1,
      },
      h.deps,
    );
    expect(saveRes.ok).toBe(true);

    // Now let deleteContent resume: it hits WriteConflict on authors:<id>, retries, and sees the usage!
    releaseDelete();
    const deleteRes = await deletePromise;

    expect(deleteRes.ok).toBe(false);
    if (!deleteRes.ok) {
      expect(deleteRes.reason).toBe("in-use");
      if (deleteRes.reason === "in-use") {
        expect(deleteRes.usedBy[0]?.docId).toBe(post.doc._id);
      }
    }
    expect(h.getDocs("authors")).toHaveLength(1);
    expect(h.getTotalRetries()).toBeGreaterThanOrEqual(1);
  });

  it("serializes concurrent deleteContent(author) and saveDraft(post -> author) when deleteContent commits first (saveDraft retries and fails closed)", async () => {
    let releaseSave!: () => void;
    let savePaused!: () => void;
    const saveAtBarrier = new Promise<void>((resolve) => {
      savePaused = resolve;
    });
    const saveMayProceed = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let pausedOnce = false;

    const h = createSnapshotIsolationHarness({
      onBeforeUpdateOne: async (collection, _txId, attempt) => {
        // Pause the first attempt of saveDraft right before locking the referenced author
        if (collection === "authors" && attempt === 1 && !pausedOnce) {
          pausedOnce = true;
          savePaused();
          await saveMayProceed;
        }
      },
    });

    const author = await authorService.create(writer, { name: "Autor Borrado" }, h.deps);
    const post = await postService.create(
      writer,
      { title: { "es-AR": "Post Sin Dangling" } },
      h.deps,
    );
    if (!author.ok || !post.ok) throw new Error("setup failed");

    // Start saveDraft referencing author on snapshot where author still exists
    const savePromise = postService.saveDraft(
      writer,
      {
        docId: post.doc._id,
        patch: { authorId: author.doc._id },
        expectedRevision: 1,
      },
      h.deps,
    );
    await saveAtBarrier;

    // While saveDraft is open on the stale snapshot, deleteContent deletes the unused author and commits
    const deleteRes = await authorService.delete(
      writer,
      { docId: author.doc._id, expectedRevision: 1 },
      h.deps,
    );
    expect(deleteRes.ok).toBe(true);

    // Resume saveDraft: hits WriteConflict on authors:<id>, retries, observes missing author -> invalid!
    releaseSave();
    const saveRes = await savePromise;

    expect(saveRes.ok).toBe(false);
    if (!saveRes.ok) {
      expect(saveRes.reason).toBe("invalid");
      if (saveRes.reason === "invalid") {
        expect(saveRes.fieldErrors.authors).toBeDefined();
      }
    }
    expect(h.getDocs("authors")).toHaveLength(0);
    // Post never committed a dangling authorId
    const postDoc = h.getDocs("posts")[0]!;
    expect((postDoc.draft as Record<string, unknown>).authorId).toBeUndefined();
    expect(h.getTotalRetries()).toBeGreaterThanOrEqual(1);
  });

  it("serializes concurrent unpublishContent(postA) and publishContent(postB -> relatedPostIds: [postA])", async () => {
    let releaseUnpub!: () => void;
    let unpubPaused!: () => void;
    const unpubAtBarrier = new Promise<void>((resolve) => {
      unpubPaused = resolve;
    });
    const unpubMayProceed = new Promise<void>((resolve) => {
      releaseUnpub = resolve;
    });
    let armed = false;
    let pausedOnce = false;

    const h = createSnapshotIsolationHarness({
      onBeforeUpdateOne: async (collection, _txId, attempt) => {
        if (armed && collection === "posts" && attempt === 1 && !pausedOnce) {
          pausedOnce = true;
          unpubPaused();
          await unpubMayProceed;
        }
      },
    });

    const author = await authorService.create(writer, { name: "Autor" }, h.deps);
    if (!author.ok) throw new Error("setup failed");

    const postA = await postService.create(
      writer,
      {
        title: { "es-AR": "Post A" },
        slug: "race-post-a",
        authorId: author.doc._id,
        featuredImageId: "m1",
        content: { "es-AR": sampleDoc("A") },
        publishedDate: "2026-11-20",
        seoTitle: { "es-AR": "A" },
        seoDescription: { "es-AR": "A" },
      },
      h.deps,
    );
    if (!postA.ok) throw new Error("setup failed");
    const pubA = await postService.publish(
      publisher,
      { docId: postA.doc._id, expectedRevision: 1 },
      h.deps,
    );
    if (!pubA.ok) throw new Error("setup failed");

    const postB = await postService.create(
      writer,
      {
        title: { "es-AR": "Post B" },
        slug: "race-post-b",
        authorId: author.doc._id,
        featuredImageId: "m1",
        content: { "es-AR": sampleDoc("B") },
        publishedDate: "2026-11-21",
        seoTitle: { "es-AR": "B" },
        seoDescription: { "es-AR": "B" },
        relatedPostIds: [postA.doc._id],
      },
      h.deps,
    );
    if (!postB.ok) throw new Error("setup failed");

    // Arm barrier for unpublishContent(postA)
    armed = true;
    const unpubPromise = postService.unpublish(
      publisher,
      { docId: postA.doc._id, expectedRevision: pubA.doc.revision },
      h.deps,
    );
    await unpubAtBarrier;

    // While unpublishContent(postA) is open on stale snapshot, publishContent(postB) locks postA and commits
    const pubB = await postService.publish(
      publisher,
      { docId: postB.doc._id, expectedRevision: 1 },
      h.deps,
    );
    expect(pubB.ok).toBe(true);

    // Resume unpublishContent(postA): hits WriteConflict on posts:<postA>, retries, and returns in-use!
    releaseUnpub();
    const unpubRes = await unpubPromise;

    expect(unpubRes.ok).toBe(false);
    if (!unpubRes.ok) {
      expect(unpubRes.reason).toBe("in-use");
      if (unpubRes.reason === "in-use") {
        expect(unpubRes.usedBy[0]?.docId).toBe(postB.doc._id);
      }
    }
    expect(h.getTotalRetries()).toBeGreaterThanOrEqual(1);
  });
});
