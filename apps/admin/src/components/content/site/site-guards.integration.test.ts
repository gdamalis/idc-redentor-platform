import { ObjectId } from "mongodb";
import type { ClientSession, Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import type {
  BeliefCollectionFields,
  ContactFormFields,
  FooterFields,
  NavigationMenuFields,
  RichTextDoc,
  SectionFields,
} from "@idcr/content";
import type { PermissionKey } from "@src/lib/rbac/permissions";
import type { UserContentCaller } from "@src/lib/content/caller";
import type { ContentAuditEntry } from "@src/service/content-audit.service";
import {
  beliefCollectionService,
  globalService,
  sectionService,
} from "@src/service/content/collections";
import {
  createContent,
  deleteContent,
  unpublishContent,
  type ContentServiceDeps,
} from "@src/service/content/content-core.service";

type RawDoc = Record<string, unknown> & { _id: ObjectId };

function cloneDoc<T>(val: T): T {
  if (val === null || val === undefined || typeof val !== "object") return val;
  if (val instanceof ObjectId) {
    return new ObjectId(val.toHexString()) as unknown as T;
  }
  if (val instanceof Date) return new Date(val.getTime()) as unknown as T;
  if (Array.isArray(val)) return val.map((item) => cloneDoc(item)) as unknown as T;
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

function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
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
    if (expected instanceof ObjectId) {
      if (!(actual instanceof ObjectId) || !actual.equals(expected)) {
        return false;
      }
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function createFakeEnv() {
  const stores = new Map<string, RawDoc[]>();
  const audit: Omit<ContentAuditEntry, "_id" | "at">[] = [];
  const getCol = (name: string) => {
    let list = stores.get(name);
    if (!list) {
      list = [];
      stores.set(name, list);
    }
    return list;
  };

  const db = {
    collection: (name: string) => ({
      findOne: async (filter: Record<string, unknown>) => {
        const hit = getCol(name).find((d) => matchesFilter(d, filter));
        return hit ? cloneDoc(hit) : null;
      },
      find: (filter: Record<string, unknown>) => ({
        toArray: async () =>
          getCol(name)
            .filter((d) => matchesFilter(d, filter))
            .map((d) => cloneDoc(d)),
      }),
      updateOne: async (
        filter: Record<string, unknown>,
        update: Record<string, Record<string, unknown>>,
      ) => {
        const hit = getCol(name).find((d) => matchesFilter(d, filter));
        if (!hit) return { matchedCount: 0, modifiedCount: 0 };
        if (update.$inc) {
          for (const [k, delta] of Object.entries(update.$inc)) {
            const cur = getByPath(hit, k);
            setByPath(
              hit,
              k,
              (typeof cur === "number" ? cur : 0) + Number(delta),
            );
          }
        }
        return { matchedCount: 1, modifiedCount: 1 };
      },
      findOneAndUpdate: async (
        filter: Record<string, unknown>,
        update: Record<string, Record<string, unknown>>,
      ) => {
        const hit = getCol(name).find((d) => matchesFilter(d, filter));
        if (!hit) return null;
        if (update.$set) {
          for (const [k, v] of Object.entries(update.$set)) {
            setByPath(hit, k, cloneDoc(v));
          }
        }
        if (update.$unset) {
          for (const k of Object.keys(update.$unset)) {
            unsetByPath(hit, k);
          }
        }
        if (update.$inc) {
          for (const [k, delta] of Object.entries(update.$inc)) {
            const cur = getByPath(hit, k);
            setByPath(
              hit,
              k,
              (typeof cur === "number" ? cur : 0) + Number(delta),
            );
          }
        }
        return cloneDoc(hit);
      },
    }),
  } as unknown as Db;

  const session = {
    abortTransaction: vi.fn(async () => undefined),
  } as unknown as ClientSession;

  const deps: ContentServiceDeps = {
    getContentDb: () => db,
    withContentTransaction: async (fn) => fn(session),
    appendContentAuditEntry: async (entry) => {
      audit.push(entry);
    },
    revalidateWebsite: vi.fn(async () => ({ ok: true as const })),
    isPublishEmailsEnabled: () => false,
    ensureContentIndexes: vi.fn(async () => undefined),
    now: () => new Date("2026-11-22T12:00:00.000Z"),
  };

  return {
    deps,
    audit,
    seed: (col: string, doc: RawDoc) => getCol(col).push(cloneDoc(doc)),
    getDocs: (col: string) => getCol(col),
  };
}

function makeCaller(perms: readonly PermissionKey[]): UserContentCaller {
  return {
    kind: "user",
    userId: "user-1",
    email: "editor@example.org",
    displayName: "Editor Test",
    permissions: new Set(perms),
  };
}

const paragraphDoc = (text: string): RichTextDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("ICR-198 service-level guard integration tests", () => {
  it("refuses create, delete, and unpublish on all 5 fixed collections (AC2)", async () => {
    const env = createFakeEnv();
    const admin = makeCaller([
      "content:read",
      "content:write",
      "content:publish",
      "content:publish-protected",
    ]);
    const fixedCollections = [
      "sections",
      "belief_collections",
      "event_banners",
      "seo_entries",
      "globals",
    ] as const;

    for (const collection of fixedCollections) {
      const id = new ObjectId().toHexString();
      const created = await createContent(
        admin,
        { collection, draft: { machineName: "x" } },
        env.deps,
      );
      expect(created).toEqual({
        ok: false,
        reason: "operation-not-allowed",
        detail: "fixed-entry",
      });

      const deleted = await deleteContent(
        admin,
        { collection, docId: id, expectedRevision: 1 },
        env.deps,
      );
      expect(deleted).toEqual({
        ok: false,
        reason: "operation-not-allowed",
        detail: "fixed-entry",
      });

      const unpublished = await unpublishContent(
        admin,
        { collection, docId: id, expectedRevision: 1 },
        env.deps,
      );
      expect(unpublished).toEqual({
        ok: false,
        reason: "operation-not-allowed",
        detail: "fixed-entry",
      });
    }
  });

  it("refuses mutating contactForm field id, type, required, count, or order (AC3)", async () => {
    const env = createFakeEnv();
    const admin = makeCaller(["content:read", "content:write", "content:publish"]);
    const docId = new ObjectId();
    const initial: ContactFormFields = {
      kind: "contactForm",
      machineName: "contact-form",
      title: { "es-AR": "Contacto" },
      description: { "es-AR": "Escribinos" },
      ctaText: { "es-AR": "Enviar" },
      agreementNote: { "es-AR": paragraphDoc("Acepto") },
      fields: [
        {
          inputId: "name",
          type: "Short text",
          required: true,
          name: { "es-AR": "Nombre" },
        },
        {
          inputId: "subject",
          type: "Dropdown",
          required: true,
          name: { "es-AR": "Asunto" },
          values: { "es-AR": ["Información", "Oración"] },
        },
      ],
    };

    env.seed("globals", {
      _id: docId,
      draft: initial,
      published: initial,
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "seed",
      _refs: { mediaIds: [], contentRefs: [] },
    });

    // Changing inputId is refused
    const badId = await globalService.saveDraft(
      admin,
      {
        docId: docId.toHexString(),
        expectedRevision: 1,
        patch: {
          fields: [
            { ...initial.fields![0]!, inputId: "fullName" },
            initial.fields![1]!,
          ],
        },
      },
      env.deps,
    );
    expect(badId).toMatchObject({
      ok: false,
      reason: "operation-not-allowed",
      detail: "immutable-field",
      field: "fields",
    });

    // Changing field order is refused
    const badOrder = await globalService.saveDraft(
      admin,
      {
        docId: docId.toHexString(),
        expectedRevision: 1,
        patch: {
          fields: [initial.fields![1]!, initial.fields![0]!],
        },
      },
      env.deps,
    );
    expect(badOrder).toMatchObject({
      ok: false,
      reason: "operation-not-allowed",
      detail: "immutable-field",
      field: "fields",
    });

    // Editing label & dropdown options only SUCCEEDS
    const okEdit = await globalService.saveDraft(
      admin,
      {
        docId: docId.toHexString(),
        expectedRevision: 1,
        patch: {
          fields: [
            { ...initial.fields![0]!, name: { "es-AR": "Tu nombre" } },
            {
              ...initial.fields![1]!,
              values: { "es-AR": ["Consulta general", "Pedido de oración"] },
            },
          ],
        },
      },
      env.deps,
    );
    expect(okEdit.ok).toBe(true);
  });

  it("refuses headings/lists in inline rich text and out-of-list page targets / social platforms (AC4, AC7)", async () => {
    const env = createFakeEnv();
    const admin = makeCaller(["content:read", "content:write", "content:publish"]);
    const secId = new ObjectId();
    const secInitial: SectionFields = {
      machineName: "our-mission",
      layout: "hero",
      headline: { "es-AR": "Bienvenidos" },
      body: { "es-AR": paragraphDoc("Texto") },
      ctaText: { "es-AR": "Conocenos" },
      targetPage: "come-meet-us",
      image: "67a000000000000000000001",
    };

    env.seed("sections", {
      _id: secId,
      draft: secInitial,
      published: secInitial,
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "seed",
      _refs: { mediaIds: [], contentRefs: [] },
    });

    // Heading inside section inline body is refused
    const badRichText = await sectionService.saveDraft(
      admin,
      {
        docId: secId.toHexString(),
        expectedRevision: 1,
        patch: {
          body: {
            "es-AR": {
              type: "doc",
              content: [
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: "Nope" }],
                },
              ],
            } as unknown as RichTextDoc,
          },
        },
      },
      env.deps,
    );
    expect(badRichText).toMatchObject({ ok: false, reason: "invalid" });

    // Out-of-list targetPage is refused
    const badPage = await sectionService.saveDraft(
      admin,
      {
        docId: secId.toHexString(),
        expectedRevision: 1,
        patch: { targetPage: "not-a-real-page" as never },
      },
      env.deps,
    );
    expect(badPage).toMatchObject({ ok: false, reason: "invalid" });

    // Out-of-list social platform is refused
    const footerId = new ObjectId();
    const footerInitial: FooterFields = {
      kind: "footer",
      machineName: "footer",
      logo: "67a000000000000000000002",
      shortDescription: { "es-AR": "Iglesia" },
      socialLinks: [],
    };
    env.seed("globals", {
      _id: footerId,
      draft: footerInitial,
      published: footerInitial,
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "seed",
      _refs: { mediaIds: [], contentRefs: [] },
    });
    const badPlatform = await globalService.saveDraft(
      admin,
      {
        docId: footerId.toHexString(),
        expectedRevision: 1,
        patch: {
          socialLinks: [
            { platform: "tiktok" as never, url: "https://tiktok.com/@x" },
          ],
        },
      },
      env.deps,
    );
    expect(badPlatform).toMatchObject({ ok: false, reason: "invalid" });

    // Out-of-list menu groupLink is refused
    const menuId = new ObjectId();
    const menuInitial: NavigationMenuFields = {
      kind: "navigationMenu",
      machineName: "main-menu",
      menuItems: [{ groupName: { "es-AR": "Inicio" }, groupLink: "home" }],
    };
    env.seed("globals", {
      _id: menuId,
      draft: menuInitial,
      published: menuInitial,
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "seed",
      _refs: { mediaIds: [], contentRefs: [] },
    });
    const badMenuLink = await globalService.saveDraft(
      admin,
      {
        docId: menuId.toHexString(),
        expectedRevision: 1,
        patch: {
          menuItems: [
            { groupName: { "es-AR": "Otro" }, groupLink: "invalid" as never },
          ],
        },
      },
      env.deps,
    );
    expect(badMenuLink).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("gates belief_collections publish behind content:publish-protected, requires ES+EN, audits actor, and cascades never-published verse (AC5, AC6, AC8)", async () => {
    const env = createFakeEnv();
    const regularEditor = makeCaller([
      "content:read",
      "content:write",
      "content:publish",
    ]);
    const protectedPublisher = makeCaller([
      "content:read",
      "content:write",
      "content:publish",
      "content:publish-protected",
    ]);

    const verseId = new ObjectId();
    env.seed("bible_verses", {
      _id: verseId,
      draft: {
        book: { "es-AR": "Juan", "en-US": "John" },
        chapter: 3,
        fromVerse: 16,
        version: { "es-AR": "NVI", "en-US": "NIV" },
        text: { "es-AR": "Porque de tal manera amó Dios al mundo." },
      },
      // Never published!
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "seed",
      _naturalKey: "juan:3:16:nvi",
      _refs: { mediaIds: [], contentRefs: [] },
    });

    const bcId = new ObjectId();
    const bcIncompleteEn: BeliefCollectionFields = {
      machineName: "our-creed",
      title: { "es-AR": "Nuestro credo" },
      items: [
        {
          title: { "es-AR": "Unidad" },
          description: { "es-AR": paragraphDoc("Un cuerpo") },
          kind: "Creed",
          bibleVerseId: verseId.toHexString(),
        },
      ],
    };

    env.seed("belief_collections", {
      _id: bcId,
      draft: bcIncompleteEn,
      published: bcIncompleteEn,
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: "seed",
      _refs: {
        mediaIds: [],
        contentRefs: [
          { collection: "bible_verses", id: verseId.toHexString() },
        ],
      },
    });

    // Regular editor CAN save draft, CANNOT publish
    const draftSaved = await beliefCollectionService.saveDraft(
      regularEditor,
      {
        docId: bcId.toHexString(),
        expectedRevision: 1,
        patch: { title: { "es-AR": "Nuestro credo actualizado" } },
      },
      env.deps,
    );
    expect(draftSaved.ok).toBe(true);

    const forbiddenPublish = await beliefCollectionService.publish(
      regularEditor,
      { docId: bcId.toHexString(), expectedRevision: 2 },
      env.deps,
    );
    expect(forbiddenPublish).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish-protected",
    });

    // Protected publisher is refused when English is missing (AC8)
    const missingEnPublish = await beliefCollectionService.publish(
      protectedPublisher,
      { docId: bcId.toHexString(), expectedRevision: 2 },
      env.deps,
    );
    expect(missingEnPublish).toMatchObject({ ok: false, reason: "invalid" });

    // Completing both ES & EN allows protected publish + cascades never-published verse + audits actor
    const published = await beliefCollectionService.publish(
      protectedPublisher,
      {
        docId: bcId.toHexString(),
        expectedRevision: 2,
        draftPatch: {
          title: { "es-AR": "Nuestro credo", "en-US": "Our creed" },
          items: [
            {
              title: { "es-AR": "Unidad", "en-US": "Unity" },
              description: {
                "es-AR": paragraphDoc("Un cuerpo"),
                "en-US": paragraphDoc("One body"),
              },
              kind: "Creed",
              bibleVerseId: verseId.toHexString(),
            },
          ],
        },
      },
      env.deps,
    );
    expect(published.ok).toBe(true);
    if (published.ok) {
      expect(published.status).toBe("published");
      expect(published.cascaded).toEqual([
        { collection: "bible_verses", id: verseId.toHexString() },
      ]);
    }
    expect(
      env.audit.some(
        (a) =>
          a.action === "content.publish-protected" &&
          a.collection === "belief_collections" &&
          a.actorId === "user-1",
      ),
    ).toBe(true);
  });
});
