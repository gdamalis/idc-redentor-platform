import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientSession } from "mongodb";

const createIndex = vi.fn().mockResolvedValue("ok");
const insertOne = vi.fn().mockResolvedValue({ insertedId: "audit-1" });
const collection = vi.fn(() => ({ createIndex, insertOne }));

vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({ collection }),
}));

async function loadService() {
  vi.resetModules();
  return import("./rbac-audit.service");
}

beforeEach(() => vi.clearAllMocks());

const session = { id: "session" } as unknown as ClientSession;

describe("appendAuditEntry", () => {
  it("inserts the entry joined to the caller's session", async () => {
    const { appendAuditEntry } = await loadService();

    await appendAuditEntry(
      {
        actorUserId: "u1",
        actorEmail: "a@b.co",
        action: "role.update",
        targetId: "r1",
        before: { name: "Old" },
        after: { name: "New" },
      },
      session,
    );

    expect(insertOne).toHaveBeenCalledTimes(1);
    const [doc, options] = insertOne.mock.calls[0] ?? [];
    expect(doc).toMatchObject({
      actorUserId: "u1",
      actorEmail: "a@b.co",
      action: "role.update",
      targetId: "r1",
      before: { name: "Old" },
      after: { name: "New" },
    });
    expect(options).toEqual({ session });
  });

  it("sets `at` server-side, never from caller input", async () => {
    const { appendAuditEntry } = await loadService();
    const before = Date.now();

    await appendAuditEntry(
      {
        actorUserId: "u1",
        actorEmail: "a@b.co",
        action: "role.create",
        targetId: "r1",
        before: null,
        after: { name: "New" },
      },
      session,
    );
    const after = Date.now();

    const [doc] = insertOne.mock.calls[0] ?? [];
    expect(doc.at).toBeInstanceOf(Date);
    expect(doc.at.getTime()).toBeGreaterThanOrEqual(before);
    expect(doc.at.getTime()).toBeLessThanOrEqual(after);
  });

  it("creates the rbacAudit indexes before writing", async () => {
    const { appendAuditEntry } = await loadService();

    await appendAuditEntry(
      {
        actorUserId: "u1",
        actorEmail: "a@b.co",
        action: "role.delete",
        targetId: "r1",
        before: { name: "Old" },
        after: null,
      },
      session,
    );

    expect(createIndex).toHaveBeenCalledWith({ at: -1 });
    expect(createIndex).toHaveBeenCalledWith({ targetId: 1, at: -1 });
  });
});

describe("ensureRbacAuditIndexes", () => {
  it("creates the at and targetId+at indexes", async () => {
    const { ensureRbacAuditIndexes } = await loadService();
    await ensureRbacAuditIndexes();

    expect(createIndex).toHaveBeenCalledWith({ at: -1 });
    expect(createIndex).toHaveBeenCalledWith({ targetId: 1, at: -1 });
  });

  it("is memoized across calls", async () => {
    const { ensureRbacAuditIndexes } = await loadService();
    await ensureRbacAuditIndexes();
    const after = createIndex.mock.calls.length;
    await ensureRbacAuditIndexes();
    expect(createIndex.mock.calls.length).toBe(after);
  });
});
