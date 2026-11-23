import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserContentCaller } from "@src/lib/content/caller";

const mockGetMediaByIds = vi.fn();
const mockListUsers = vi.fn();

vi.mock("@src/service/media/media.service", () => ({
  getMediaByIds: (...args: unknown[]) => mockGetMediaByIds(...args),
}));

vi.mock("@src/service/user.service", () => ({
  listUsers: (...args: unknown[]) => mockListUsers(...args),
}));

import { loadAuthorEditorHydration } from "./editorial-loaders.service";

const CALLER: UserContentCaller = {
  kind: "user",
  userId: "64b000000000000000000001",
  email: "editor@example.org",
  displayName: "Editor",
  permissions: new Set(["content:read", "content:write"]),
};

describe("editorial-loaders.service — author RBAC isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMediaByIds.mockResolvedValue({ ok: true, items: [] });
  });

  it("NEVER queries admin.users when caller lacks users:read", async () => {
    const res = await loadAuthorEditorHydration(
      CALLER,
      { name: "Autor Uno", userId: "64b000000000000000000099" },
      false,
    );
    expect(mockListUsers).not.toHaveBeenCalled();
    expect(res.initialLinkedUser).toBeNull();
  });

  it("hydrates linked platform user when caller has users:read", async () => {
    const uid = new ObjectId("64b000000000000000000099");
    mockListUsers.mockResolvedValue([
      {
        _id: uid,
        firebaseUid: "fb-1",
        email: "pastor@example.org",
        displayName: "Pastor Ejemplo",
        roleIds: [],
        preferredLocale: "es-AR",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await loadAuthorEditorHydration(
      CALLER,
      { name: "Pastor Ejemplo", userId: uid.toHexString() },
      true,
    );
    expect(mockListUsers).toHaveBeenCalledTimes(1);
    expect(res.initialLinkedUser).toEqual({
      id: uid.toHexString(),
      displayName: "Pastor Ejemplo",
      email: "pastor@example.org",
    });
  });
});
