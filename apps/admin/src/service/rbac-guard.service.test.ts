import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientSession } from "mongodb";

const updateOne = vi.fn().mockResolvedValue({ upsertedCount: 1 });
const collection = vi.fn(() => ({ updateOne }));

vi.mock("@src/service/database.service", () => ({
  getAdminDb: () => ({ collection }),
}));

async function loadService() {
  vi.resetModules();
  return import("./rbac-guard.service");
}

const session = { id: "session" } as unknown as ClientSession;

beforeEach(() => vi.clearAllMocks());

describe("touchAdministrabilityGuard", () => {
  it("upserts a single well-known guard document, joined to the caller's session", async () => {
    const { touchAdministrabilityGuard } = await loadService();

    await touchAdministrabilityGuard(session);

    expect(collection).toHaveBeenCalledWith("rbacGuard");
    const [filter, update, options] = updateOne.mock.calls[0] ?? [];
    expect(filter).toEqual({ _id: "administrability" });
    expect(update.$inc).toEqual({ rev: 1 });
    expect(update.$set).toHaveProperty("updatedAt");
    expect(options).toEqual({ upsert: true, session });
  });

  it("is idempotent under retry — calling it twice just bumps rev again, no throw", async () => {
    const { touchAdministrabilityGuard } = await loadService();

    await touchAdministrabilityGuard(session);
    await touchAdministrabilityGuard(session);

    expect(updateOne).toHaveBeenCalledTimes(2);
    // Same filter/id both times — a retried callback replays the identical op.
    expect(updateOne.mock.calls[0]?.[0]).toEqual(updateOne.mock.calls[1]?.[0]);
  });
});
