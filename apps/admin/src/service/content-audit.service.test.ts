import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientSession } from "mongodb";
import { CONTENT_AUDIT_ACTIONS } from "./content-audit.service";

const createIndex = vi.fn().mockResolvedValue("ok");
const insertOne = vi.fn().mockResolvedValue({ insertedId: "audit-1" });
const collection = vi.fn(() => ({ createIndex, insertOne }));

vi.mock("@src/service/database.service", () => ({
  getContentDb: () => ({ collection }),
}));

async function loadService() {
  vi.resetModules();
  return import("./content-audit.service");
}

const session = { id: "website-session" } as unknown as ClientSession;

beforeEach(() => vi.clearAllMocks());

describe("appendContentAuditEntry", () => {
  it("writes compact entries to website content_audit joined to the caller's session", async () => {
    const { appendContentAuditEntry, CONTENT_AUDIT_COLLECTION } =
      await loadService();

    await appendContentAuditEntry(
      {
        actorId: "user-1",
        actorLabel: "editor@church.org",
        actorKind: "user",
        action: "content.save",
        collection: "posts",
        docId: "507f1f77bcf86cd799439011",
        naturalKey: "bienvenidos",
        changedFields: ["title", "content"],
        revision: 3,
      },
      session,
    );

    expect(collection).toHaveBeenCalledWith(CONTENT_AUDIT_COLLECTION);
    expect(insertOne).toHaveBeenCalledTimes(1);
    const [doc, options] = insertOne.mock.calls[0] ?? [];
    expect(doc).toMatchObject({
      actorId: "user-1",
      actorLabel: "editor@church.org",
      actorKind: "user",
      action: "content.save",
      collection: "posts",
      docId: "507f1f77bcf86cd799439011",
      naturalKey: "bienvenidos",
      changedFields: ["title", "content"],
      revision: 3,
    });
    expect(doc).not.toHaveProperty("before");
    expect(doc).not.toHaveProperty("after");
    expect(doc).not.toHaveProperty("meta");
    expect(options).toEqual({ session });
  });

  it("stamps `at` server-side and never serializes undefined optional fields to null", async () => {
    const { appendContentAuditEntry } = await loadService();
    const before = Date.now();

    await appendContentAuditEntry(
      {
        actorId: "service:pdf-worker",
        actorLabel: "PDF Worker",
        actorKind: "service",
        action: "content.pdf-update",
        collection: "sermons",
        docId: "507f1f77bcf86cd799439012",
        naturalKey: undefined,
        changedFields: ["pdfSummaryMediaId"],
        revision: 2,
        meta: { overwrite: undefined },
      },
      session,
    );
    const after = Date.now();

    const [doc] = insertOne.mock.calls[0] ?? [];
    expect(doc.at).toBeInstanceOf(Date);
    expect(doc.at.getTime()).toBeGreaterThanOrEqual(before);
    expect(doc.at.getTime()).toBeLessThanOrEqual(after);
    expect(doc).not.toHaveProperty("naturalKey");
    expect(doc).not.toHaveProperty("meta");
    expect(JSON.stringify(doc)).not.toContain("null");
  });

  it("supports media.* and protected-publish audit actions with compact metadata", async () => {
    const { appendContentAuditEntry } = await loadService();

    expect(CONTENT_AUDIT_ACTIONS).toContain("media.create");
    expect(CONTENT_AUDIT_ACTIONS).toContain("media.update");
    expect(CONTENT_AUDIT_ACTIONS).toContain("media.delete");
    expect(CONTENT_AUDIT_ACTIONS).toContain("content.pdf-update");
    expect(CONTENT_AUDIT_ACTIONS).toContain("content.publish-protected");

    await appendContentAuditEntry(
      {
        actorId: "user-2",
        actorLabel: "admin@church.org",
        actorKind: "user",
        action: "content.publish-protected",
        collection: "belief_collections",
        docId: "507f1f77bcf86cd799439013",
        naturalKey: "our-creed",
        changedFields: ["items"],
        revision: 4,
        meta: { approvedConfirmed: true },
      },
      session,
    );

    const [doc] = insertOne.mock.calls[0] ?? [];
    expect(doc.meta).toEqual({ approvedConfirmed: true });
  });
});

describe("ensureContentAuditIndexes", () => {
  it("creates at, collection+docId+at, and actorId+at indexes and memoizes", async () => {
    const { ensureContentAuditIndexes } = await loadService();

    await ensureContentAuditIndexes();
    expect(createIndex).toHaveBeenCalledWith({ at: -1 });
    expect(createIndex).toHaveBeenCalledWith({
      collection: 1,
      docId: 1,
      at: -1,
    });
    expect(createIndex).toHaveBeenCalledWith({ actorId: 1, at: -1 });

    const countAfterFirst = createIndex.mock.calls.length;
    await ensureContentAuditIndexes();
    expect(createIndex.mock.calls.length).toBe(countAfterFirst);
  });
});
