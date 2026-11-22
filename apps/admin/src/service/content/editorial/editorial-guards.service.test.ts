import { ObjectId } from "mongodb";
import type { ClientSession, Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import type { PostFields, RichTextDoc, TopicFields } from "@idcr/content";
import type { PermissionKey } from "@src/lib/rbac/permissions";
import type { UserContentCaller } from "@src/lib/content/caller";
import type { ContentAuditEntry } from "@src/service/content-audit.service";
import {
  createContent,
  deleteContent,
  discardChanges,
  getContentById,
  publishContent,
  saveDraft,
  unpublishContent,
  type ContentServiceDeps,
} from "@src/service/content/content-core.service";
import {
  createGuardedPost,
  createGuardedTopic,
  saveGuardedPostDraft,
  saveGuardedTopicDraft,
  validatePostBeforePublish,
  validateTopicBeforePublish,
  type EditorialGuardsDeps,
} from "./editorial-guards.service";

// ── Minimal transactional in-memory MongoDB harness with $or support ────────

type RawDoc = Record<string, unknown> & { _id: ObjectId };

function cloneDoc<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== "object") return val;
  if (val instanceof ObjectId) {
    return new ObjectId(val.toHexString()) as unknown as T;
  }
  if (val instanceof Date) return new Date(val.getTime()) as unknown as T;
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

function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!;
    if (!cur[part] || typeof cur[part] !== "object") cur[part] = {};
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
    if (key === "$or" && Array.isArray(expected)) {
      const any = expected.some((branch) =>
        matchesFilter(doc, branch as Record<string, unknown>),
      );
      if (!any) return false;
      continue;
    }

    const actual = getByPath(doc, key);
    if (
      expected &&
      typeof expected === "object" &&
      !(expected instanceof ObjectId) &&
      !(expected instanceof Date) &&
      !Array.isArray(expected)
    ) {
      const ops = expected as Record<string, unknown>;
      if ("$exists" in ops && (actual !== undefined) !== ops.$exists) {
        return false;
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

    if (actual instanceof ObjectId && expected instanceof ObjectId) {
      if (!actual.equals(expected)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function createHarness() {
  const store = new Map<string, RawDoc[]>();
  const auditLog: Array<Omit<ContentAuditEntry, "_id" | "at">> = [];

  const getColDocs = (name: string): RawDoc[] => {
    let list = store.get(name);
    if (!list) {
      list = [];
      store.set(name, list);
    }
    return list;
  };

  const applyUpdate = (
    target: RawDoc,
    update: Record<string, Record<string, unknown>>,
  ): void => {
    if (update.$set) {
      for (const [k, v] of Object.entries(update.$set)) {
        setByPath(target, k, cloneDoc(v));
      }
    }
    if (update.$unset) {
      for (const k of Object.keys(update.$unset)) {
        unsetByPath(target, k);
      }
    }
    if (update.$inc) {
      for (const [k, delta] of Object.entries(update.$inc)) {
        const prev = Number(getByPath(target, k) ?? 0);
        setByPath(target, k, prev + Number(delta));
      }
    }
  };

  const db = {
    collection(name: string) {
      return {
        async findOne(filter: Record<string, unknown>) {
          const hit = getColDocs(name).find((d) => matchesFilter(d, filter));
          return hit ? cloneDoc(hit) : null;
        },
        find(filter: Record<string, unknown>) {
          return {
            async toArray() {
              return getColDocs(name)
                .filter((d) => matchesFilter(d, filter))
                .map((d) => cloneDoc(d));
            },
          };
        },
        async insertOne(doc: Record<string, unknown>) {
          const insertedId = new ObjectId();
          getColDocs(name).push(cloneDoc({ ...doc, _id: insertedId }) as RawDoc);
          return { insertedId };
        },
        async updateOne(
          filter: Record<string, unknown>,
          update: Record<string, Record<string, unknown>>,
        ) {
          const hit = getColDocs(name).find((d) => matchesFilter(d, filter));
          if (!hit) return { matchedCount: 0 };
          applyUpdate(hit, update);
          return { matchedCount: 1 };
        },
        async findOneAndUpdate(
          filter: Record<string, unknown>,
          update: Record<string, Record<string, unknown>>,
        ) {
          const hit = getColDocs(name).find((d) => matchesFilter(d, filter));
          if (!hit) return null;
          applyUpdate(hit, update);
          return cloneDoc(hit);
        },
        async deleteOne(filter: Record<string, unknown>) {
          const list = getColDocs(name);
          const idx = list.findIndex((d) => matchesFilter(d, filter));
          if (idx === -1) return { deletedCount: 0 };
          list.splice(idx, 1);
          return { deletedCount: 1 };
        },
        async createIndex() {
          return "ok";
        },
      };
    },
  } as unknown as Db;

  const coreDeps: ContentServiceDeps = {
    getContentDb: () => db,
    withContentTransaction: async <T>(
      fn: (session: ClientSession) => Promise<T>,
    ): Promise<T> => {
      const snapshot = new Map<string, RawDoc[]>();
      for (const [k, v] of store.entries()) snapshot.set(k, cloneDoc(v));
      const auditLen = auditLog.length;
      let aborted = false;
      const session = {
        abortTransaction: async () => {
          aborted = true;
        },
      } as unknown as ClientSession;
      const res = await fn(session);
      if (aborted) {
        store.clear();
        for (const [k, v] of snapshot.entries()) store.set(k, v);
        auditLog.length = auditLen;
      }
      return res;
    },
    appendContentAuditEntry: async (entry) => {
      auditLog.push(entry);
    },
    revalidateWebsite: vi.fn(async () => ({ ok: true as const })),
    isPublishEmailsEnabled: () => false,
    ensureContentIndexes: async () => {},
    now: () => new Date("2026-11-22T15:00:00.000Z"),
  };

  const guardDeps: EditorialGuardsDeps = {
    getContentDb: () => db,
    createContent: (caller, input) => createContent(caller, input, coreDeps),
    saveDraft: (caller, input) => saveDraft(caller, input, coreDeps),
    getContentById: (caller, col, id) => getContentById(caller, col, id, coreDeps),
    ensureContentIndexes: async () => {},
  };

  const mediaId = new ObjectId("64b0000000000000000000aa");
  store.set("media", [{ _id: mediaId, pathname: "media/test/hero.jpg" }]);

  return { db, store, auditLog, coreDeps, guardDeps };
}

function makeCaller(
  permissions: readonly PermissionKey[],
  id = "64b000000000000000000001",
  displayName = "Editor Prueba",
): UserContentCaller {
  return {
    kind: "user",
    userId: id,
    email: `${id.slice(-4)}@example.org`,
    displayName,
    permissions: new Set(permissions),
  };
}

const SAMPLE_DOC: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Contenido válido" }] }],
};

const SAMPLE_DOC_EN: RichTextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Valid content" }] }],
};

const EDITOR_PERMS: PermissionKey[] = [
  "content:read",
  "content:write",
  "content:publish",
];
const ADMIN_PERMS: PermissionKey[] = [
  ...EDITOR_PERMS,
  "content:publish-protected",
];

describe("editorial-guards.service — posts", () => {
  it("enforces cross-snapshot slug uniqueness across draft.slug and published.slug (AC3, EC2)", async () => {
    const { coreDeps, guardDeps } = createHarness();
    const editor = makeCaller(EDITOR_PERMS);

    const author = await createContent(
      editor,
      { collection: "authors", draft: { name: "Ana Test" } },
      coreDeps,
    );
    expect(author.ok).toBe(true);
    if (!author.ok) return;

    // Post A published with slug "x", then draft renamed to "y"
    const postA = await createGuardedPost(
      editor,
      {
        title: { "es-AR": "Post A" },
        slug: "slug-x",
        category: "Events",
        featuredImageId: "64b0000000000000000000aa",
        content: { "es-AR": SAMPLE_DOC },
        authorId: author.doc._id,
        publishedDate: "2026-11-20",
        seoTitle: { "es-AR": "SEO A" },
        seoDescription: { "es-AR": "Desc A" },
      },
      guardDeps,
    );
    expect(postA.ok).toBe(true);
    if (!postA.ok) return;

    const pubA = await publishContent<PostFields>(
      editor,
      { collection: "posts", docId: postA.doc._id, expectedRevision: 1 },
      coreDeps,
    );
    expect(pubA.ok).toBe(true);
    if (!pubA.ok) return;

    // Rename Post A's DRAFT slug away from "slug-x" while published.slug stays "slug-x"
    const renameA = await saveGuardedPostDraft(
      editor,
      {
        docId: postA.doc._id,
        patch: { slug: "slug-y" },
        expectedRevision: pubA.doc.revision,
      },
      guardDeps,
    );
    expect(renameA.ok).toBe(true);

    // Post B MUST NOT be able to create with "slug-x" (held by Post A's published snapshot)
    const createClash = await createGuardedPost(
      editor,
      { title: { "es-AR": "Post B" }, slug: "slug-x" },
      guardDeps,
    );
    expect(createClash).toEqual({
      ok: false,
      reason: "duplicate-key",
      field: "slug",
      fieldErrors: { slug: ["duplicate-key"] },
    });

    // Post B created with unique slug, then tries to save draft with "slug-x" OR "slug-y" -> BOTH refused
    const postB = await createGuardedPost(
      editor,
      { title: { "es-AR": "Post B" }, slug: "slug-b" },
      guardDeps,
    );
    expect(postB.ok).toBe(true);
    if (!postB.ok) return;

    const saveClashPublished = await saveGuardedPostDraft(
      editor,
      { docId: postB.doc._id, patch: { slug: "slug-x" }, expectedRevision: 1 },
      guardDeps,
    );
    expect(saveClashPublished.ok).toBe(false);
    if (!saveClashPublished.ok) expect(saveClashPublished.reason).toBe("duplicate-key");

    const saveClashDraft = await saveGuardedPostDraft(
      editor,
      { docId: postB.doc._id, patch: { slug: "slug-y" }, expectedRevision: 1 },
      guardDeps,
    );
    expect(saveClashDraft.ok).toBe(false);
    if (!saveClashDraft.ok) expect(saveClashDraft.reason).toBe("duplicate-key");

    const pubClash = await validatePostBeforePublish(
      editor,
      { docId: postB.doc._id, draftPatch: { slug: "slug-x" } },
      guardDeps,
    );
    expect(pubClash?.reason).toBe("duplicate-key");
  });

  it("enforces POST_CATEGORIES allowlist and refuses saving unknown legacy category until changed (AC4, EC7)", async () => {
    const { store, coreDeps, guardDeps } = createHarness();
    const editor = makeCaller(EDITOR_PERMS);

    const badCreate = await createGuardedPost(
      editor,
      { title: { "es-AR": "Malo" }, category: "Noticias" },
      guardDeps,
    );
    expect(badCreate).toEqual({
      ok: false,
      reason: "invalid",
      fieldErrors: { category: ["invalid-category"] },
    });

    const goodCreate = await createGuardedPost(
      editor,
      { title: { "es-AR": "Bueno" }, category: "Spiritual Growth" },
      guardDeps,
    );
    expect(goodCreate.ok).toBe(true);
    if (!goodCreate.ok) return;

    // Simulate legacy imported unknown category stored directly in DB (EC7)
    const raw = store.get("posts")![0]!;
    (raw.draft as Record<string, unknown>).category = "LegacyCategory";

    // Saving another field without fixing the unknown category is refused
    const refusedSave = await saveGuardedPostDraft(
      editor,
      {
        docId: goodCreate.doc._id,
        patch: { subtitle: { "es-AR": "Nuevo subtítulo" } },
        expectedRevision: 1,
      },
      guardDeps,
    );
    expect(refusedSave).toEqual({
      ok: false,
      reason: "invalid",
      fieldErrors: { category: ["invalid-category"] },
    });

    // Changing category to a valid option succeeds
    const fixedSave = await saveGuardedPostDraft(
      editor,
      {
        docId: goodCreate.doc._id,
        patch: { category: "Community" },
        expectedRevision: 1,
      },
      guardDeps,
    );
    expect(fixedSave.ok).toBe(true);

    // Clearing category to undefined also succeeds
    const clearedSave = await saveGuardedPostDraft(
      editor,
      {
        docId: goodCreate.doc._id,
        patch: { category: undefined },
        expectedRevision: 2,
      },
      guardDeps,
    );
    expect(clearedSave.ok).toBe(true);
    expect(
      (await getContentById<PostFields>(editor, "posts", goodCreate.doc._id, coreDeps)).ok,
    ).toBe(true);
  });

  it("refuses unpublishing a post referenced by another published post's relatedPostIds (EC5)", async () => {
    const { coreDeps, guardDeps } = createHarness();
    const editor = makeCaller(EDITOR_PERMS);

    const author = await createContent(
      editor,
      { collection: "authors", draft: { name: "Autor Rel" } },
      coreDeps,
    );
    if (!author.ok) throw new Error("author failed");

    const basePost = (slug: string, relatedPostIds?: string[]): PostFields => ({
      title: { "es-AR": `Post ${slug}` },
      slug,
      category: "Events",
      featuredImageId: "64b0000000000000000000aa",
      content: { "es-AR": SAMPLE_DOC },
      authorId: author.doc._id,
      publishedDate: "2026-11-20",
      seoTitle: { "es-AR": "SEO" },
      seoDescription: { "es-AR": "Desc" },
      ...(relatedPostIds ? { relatedPostIds } : {}),
    });

    const p1 = await createGuardedPost(editor, basePost("post-uno"), guardDeps);
    if (!p1.ok) throw new Error("p1 failed");
    const pub1 = await publishContent(
      editor,
      { collection: "posts", docId: p1.doc._id, expectedRevision: 1 },
      coreDeps,
    );
    expect(pub1.ok).toBe(true);
    if (!pub1.ok) return;

    const p2 = await createGuardedPost(
      editor,
      basePost("post-dos", [p1.doc._id]),
      guardDeps,
    );
    if (!p2.ok) throw new Error("p2 failed");
    const pub2 = await publishContent(
      editor,
      { collection: "posts", docId: p2.doc._id, expectedRevision: 1 },
      coreDeps,
    );
    expect(pub2.ok).toBe(true);

    const unpubRefused = await unpublishContent(
      editor,
      { collection: "posts", docId: p1.doc._id, expectedRevision: pub1.doc.revision },
      coreDeps,
    );
    expect(unpubRefused.ok).toBe(false);
    if (!unpubRefused.ok) {
      expect(unpubRefused.reason).toBe("in-use");
      if (unpubRefused.reason === "in-use") {
        expect(unpubRefused.usedBy.map((u) => u.docId)).toEqual([p2.doc._id]);
      }
    }
  });
});

describe("editorial-guards.service — topics & protected legal matrix", () => {
  it("refuses reserved site route slugs on create, save, and pre-existing bad drafts at publish (EC6, PM refinement #1)", async () => {
    const { store, guardDeps } = createHarness();
    const editor = makeCaller(EDITOR_PERMS);

    for (const reserved of ["blog", "predicas", "community", "come-meet-us", "who-is-jesus", "home", "api"]) {
      const res = await createGuardedTopic(
        editor,
        { name: { "es-AR": "Test" }, slug: { "es-AR": reserved } },
        guardDeps,
      );
      expect(res).toEqual({
        ok: false,
        reason: "invalid",
        fieldErrors: { "slug.es-AR": ["reserved-route-slug"] },
      });
    }

    const resEn = await createGuardedTopic(
      editor,
      {
        name: { "es-AR": "Aviso", "en-US": "Notice" },
        slug: { "es-AR": "aviso", "en-US": "community" },
      },
      guardDeps,
    );
    expect(resEn).toEqual({
      ok: false,
      reason: "invalid",
      fieldErrors: { "slug.en-US": ["reserved-route-slug"] },
    });

    // PM refinement #1: pre-existing bad draft slug in DB must be caught at publish even when draftPatch omits slug
    const topic = await createGuardedTopic(
      editor,
      {
        name: { "es-AR": "Ayuda", "en-US": "Help" },
        slug: { "es-AR": "ayuda", "en-US": "help" },
        body: { "es-AR": SAMPLE_DOC, "en-US": SAMPLE_DOC_EN },
      },
      guardDeps,
    );
    expect(topic.ok).toBe(true);
    if (!topic.ok) return;

    const raw = store.get("topics")![0]!;
    ((raw.draft as Record<string, unknown>).slug as Record<string, string>)["en-US"] =
      "blog";

    const publishCheck = await validateTopicBeforePublish(
      editor,
      { docId: topic.doc._id, draftPatch: { name: { "es-AR": "Ayuda 2" } } },
      guardDeps,
    );
    expect(publishCheck).toEqual({
      ok: false,
      reason: "invalid",
      fieldErrors: { "slug.en-US": ["reserved-route-slug"] },
    });
  });

  it("enforces per-language cross-snapshot slug uniqueness for topics (AC3)", async () => {
    const { coreDeps, guardDeps } = createHarness();
    const admin = makeCaller(ADMIN_PERMS);

    const t1 = await createGuardedTopic(
      admin,
      {
        name: { "es-AR": "Privacidad", "en-US": "Privacy" },
        slug: { "es-AR": "privacidad", "en-US": "privacy" },
        body: { "es-AR": SAMPLE_DOC, "en-US": SAMPLE_DOC_EN },
      },
      guardDeps,
    );
    if (!t1.ok) throw new Error("t1 failed");
    const pub1 = await publishContent(
      admin,
      { collection: "topics", docId: t1.doc._id, expectedRevision: 1 },
      coreDeps,
    );
    if (!pub1.ok) throw new Error("pub1 failed");

    // Rename t1's draft slugs while published keeps privacidad/privacy
    const ren = await saveGuardedTopicDraft(
      admin,
      {
        docId: t1.doc._id,
        patch: { slug: { "es-AR": "privacidad-v2", "en-US": "privacy-v2" } },
        expectedRevision: pub1.doc.revision,
      },
      guardDeps,
    );
    expect(ren.ok).toBe(true);

    // Another topic cannot claim published es-AR slug "privacidad"
    const clashEs = await createGuardedTopic(
      admin,
      { name: { "es-AR": "Otro" }, slug: { "es-AR": "privacidad" } },
      guardDeps,
    );
    expect(clashEs).toEqual({
      ok: false,
      reason: "duplicate-key",
      field: "slug.es-AR",
      fieldErrors: { "slug.es-AR": ["duplicate-key"] },
    });

    // Another topic cannot claim published en-US slug "privacy"
    const clashEn = await createGuardedTopic(
      admin,
      {
        name: { "es-AR": "Otro", "en-US": "Other" },
        slug: { "es-AR": "otro", "en-US": "privacy" },
      },
      guardDeps,
    );
    expect(clashEn).toEqual({
      ok: false,
      reason: "duplicate-key",
      field: "slug.en-US",
      fieldErrors: { "slug.en-US": ["duplicate-key"] },
    });
  });

  it("enforces full protected-topic permission matrix & bilingual publish + audit (AC5, AC6, EC1)", async () => {
    const { auditLog, coreDeps, guardDeps } = createHarness();
    const editor = makeCaller(EDITOR_PERMS, "64b000000000000000000002", "Editor Sin Permiso");
    const admin = makeCaller(ADMIN_PERMS, "64b000000000000000000001", "Admin Legal");

    // 1. Editor without content:publish-protected cannot create with protected: true
    const createProtectedRefused = await createGuardedTopic(
      editor,
      {
        name: { "es-AR": "Privacidad" },
        slug: { "es-AR": "privacidad" },
        protected: true,
      },
      guardDeps,
    );
    expect(createProtectedRefused).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    // 2. Admin creates protected privacy topic missing English -> publish refused (AC6)
    const privacy = await createGuardedTopic(
      admin,
      {
        name: { "es-AR": "Política de Privacidad" },
        shortDescription: { "es-AR": "Cómo cuidamos tus datos." },
        slug: { "es-AR": "privacidad" },
        body: { "es-AR": SAMPLE_DOC },
        protected: true,
      },
      guardDeps,
    );
    expect(privacy.ok).toBe(true);
    if (!privacy.ok) return;

    const missingEnPub = await publishContent<TopicFields>(
      admin,
      { collection: "topics", docId: privacy.doc._id, expectedRevision: 1 },
      coreDeps,
    );
    expect(missingEnPub.ok).toBe(false);
    if (!missingEnPub.ok && missingEnPub.reason === "invalid") {
      expect(missingEnPub.fieldErrors["name.en-US"]).toBeDefined();
      expect(missingEnPub.fieldErrors["slug.en-US"]).toBeDefined();
      expect(missingEnPub.fieldErrors["body.en-US"]).toBeDefined();
      expect(missingEnPub.fieldErrors["shortDescription.en-US"]).toBeDefined();
    }

    // 3. Editor WITHOUT content:publish-protected CAN save normal draft edits on protected topic
    const draftEditOk = await saveGuardedTopicDraft(
      editor,
      {
        docId: privacy.doc._id,
        patch: {
          name: { "es-AR": "Política de Privacidad", "en-US": "Privacy Policy" },
          shortDescription: {
            "es-AR": "Cómo cuidamos tus datos.",
            "en-US": "How we care for your data.",
          },
          slug: { "es-AR": "privacidad", "en-US": "privacy" },
          body: { "es-AR": SAMPLE_DOC, "en-US": SAMPLE_DOC_EN },
        },
        expectedRevision: 1,
      },
      guardDeps,
    );
    expect(draftEditOk.ok).toBe(true);
    if (!draftEditOk.ok) return;

    // 4. Downgrade-then-publish attack: editor tries to flip protected -> false, then publish -> BOTH refused
    const downgradeRefused = await saveGuardedTopicDraft(
      editor,
      {
        docId: privacy.doc._id,
        patch: { protected: false },
        expectedRevision: draftEditOk.doc.revision,
      },
      guardDeps,
    );
    expect(downgradeRefused).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    const editorPubValidateRefused = await validateTopicBeforePublish(
      editor,
      { docId: privacy.doc._id, draftPatch: { protected: false } },
      guardDeps,
    );
    expect(editorPubValidateRefused).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    const editorPubRefused = await publishContent(
      editor,
      {
        collection: "topics",
        docId: privacy.doc._id,
        expectedRevision: draftEditOk.doc.revision,
      },
      coreDeps,
    );
    expect(editorPubRefused).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    // 5. Admin publishes bilingual protected topic -> succeeds & writes content.publish-protected audit with actor
    const adminPub = await publishContent(
      admin,
      {
        collection: "topics",
        docId: privacy.doc._id,
        expectedRevision: draftEditOk.doc.revision,
      },
      coreDeps,
    );
    expect(adminPub.ok).toBe(true);
    if (!adminPub.ok) return;

    const pubAudit = auditLog.find(
      (entry) =>
        entry.action === "content.publish-protected" &&
        entry.docId === privacy.doc._id,
    );
    expect(pubAudit).toBeDefined();
    expect(pubAudit?.actorId).toBe(admin.userId);
    expect(pubAudit?.actorLabel).toBe("Admin Legal");

    // 6. Editor cannot unpublish or delete protected topic
    const editorUnpub = await unpublishContent(
      editor,
      {
        collection: "topics",
        docId: privacy.doc._id,
        expectedRevision: adminPub.doc.revision,
      },
      coreDeps,
    );
    expect(editorUnpub).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    const editorDel = await deleteContent(
      editor,
      {
        collection: "topics",
        docId: privacy.doc._id,
        expectedRevision: adminPub.doc.revision,
      },
      coreDeps,
    );
    expect(editorDel).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    // 7. Editor cannot flip an unprotected topic to protected: true either
    const normalTopic = await createGuardedTopic(
      editor,
      { name: { "es-AR": "Info" }, slug: { "es-AR": "info" } },
      guardDeps,
    );
    if (!normalTopic.ok) throw new Error("normalTopic failed");
    const upgradeRefused = await saveGuardedTopicDraft(
      editor,
      {
        docId: normalTopic.doc._id,
        patch: { protected: true },
        expectedRevision: 1,
      },
      guardDeps,
    );
    expect(upgradeRefused).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    // 8. Admin can unpublish and delete protected topic cleanly
    const adminUnpub = await unpublishContent(
      admin,
      {
        collection: "topics",
        docId: privacy.doc._id,
        expectedRevision: adminPub.doc.revision,
      },
      coreDeps,
    );
    expect(adminUnpub.ok).toBe(true);
    if (!adminUnpub.ok) return;

    const adminDel = await deleteContent(
      admin,
      {
        collection: "topics",
        docId: privacy.doc._id,
        expectedRevision: adminUnpub.doc.revision,
      },
      coreDeps,
    );
    expect(adminDel.ok).toBe(true);

    // 9. Discard flipping protected flag refused for editor without permission
    const protDraft = await createGuardedTopic(
      admin,
      {
        name: { "es-AR": "Legal", "en-US": "Legal" },
        slug: { "es-AR": "legal", "en-US": "legal-en" },
        body: { "es-AR": SAMPLE_DOC, "en-US": SAMPLE_DOC_EN },
        protected: false,
      },
      guardDeps,
    );
    if (!protDraft.ok) throw new Error("protDraft failed");
    const pubNorm = await publishContent(
      admin,
      { collection: "topics", docId: protDraft.doc._id, expectedRevision: 1 },
      coreDeps,
    );
    if (!pubNorm.ok) throw new Error("pubNorm failed");
    const flagged = await saveGuardedTopicDraft(
      admin,
      {
        docId: protDraft.doc._id,
        patch: { protected: true },
        expectedRevision: pubNorm.doc.revision,
      },
      guardDeps,
    );
    if (!flagged.ok) throw new Error("flagged failed");
    const discardRefused = await discardChanges(
      editor,
      {
        collection: "topics",
        docId: protDraft.doc._id,
        expectedRevision: flagged.doc.revision,
      },
      coreDeps,
    );
    expect(discardRefused).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });
  });

  it("refuses deleting an author referenced by a post or sermon and allows deleting unused authors (AC8)", async () => {
    const { coreDeps, guardDeps } = createHarness();
    const editor = makeCaller(EDITOR_PERMS);

    const usedAuthor = await createContent(
      editor,
      {
        collection: "authors",
        draft: { name: "Pastor Demo", email: "pastor@example.org" },
      },
      coreDeps,
    );
    const unusedAuthor = await createContent(
      editor,
      { collection: "authors", draft: { name: "Invitado Sin Uso" } },
      coreDeps,
    );
    if (!usedAuthor.ok || !unusedAuthor.ok) throw new Error("authors failed");

    const post = await createGuardedPost(
      editor,
      {
        title: { "es-AR": "Artículo con autor" },
        authorId: usedAuthor.doc._id,
      },
      guardDeps,
    );
    expect(post.ok).toBe(true);
    if (!post.ok) return;

    const delRefused = await deleteContent(
      editor,
      {
        collection: "authors",
        docId: usedAuthor.doc._id,
        expectedRevision: 1,
      },
      coreDeps,
    );
    expect(delRefused.ok).toBe(false);
    if (!delRefused.ok) {
      expect(delRefused.reason).toBe("in-use");
      if (delRefused.reason === "in-use") {
        expect(delRefused.usedBy).toEqual([
          expect.objectContaining({
            collection: "posts",
            docId: post.doc._id,
            label: "Artículo con autor",
          }),
        ]);
      }
    }

    const delUnused = await deleteContent(
      editor,
      {
        collection: "authors",
        docId: unusedAuthor.doc._id,
        expectedRevision: 1,
      },
      coreDeps,
    );
    expect(delUnused.ok).toBe(true);
  });
});
