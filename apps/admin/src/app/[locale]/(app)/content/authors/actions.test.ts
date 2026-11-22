import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireActionPermission = vi.fn();
const mockListUsers = vi.fn();

vi.mock("@src/lib/rbac/require-action-permission", () => ({
  requireActionPermission: (...args: unknown[]) =>
    mockRequireActionPermission(...args),
}));

vi.mock("@src/service/user.service", () => ({
  listUsers: (...args: unknown[]) => mockListUsers(...args),
}));

import { searchPlatformUsersAction } from "./actions";

describe("authors/actions — searchPlatformUsersAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses callers lacking users:read without querying admin.users", async () => {
    mockRequireActionPermission.mockResolvedValue({
      ok: false,
      reason: "forbidden",
    });

    const res = await searchPlatformUsersAction({ query: "ana" });
    expect(mockRequireActionPermission).toHaveBeenCalledWith("users:read");
    expect(res).toEqual({
      ok: false,
      reason: "forbidden",
      requiredPermission: "users:read",
    });
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it("returns active matching users sorted by name when authorized", async () => {
    mockRequireActionPermission.mockResolvedValue({
      ok: true,
      user: { _id: new ObjectId("64b000000000000000000001") },
      permissions: new Set(["users:read"]),
    });

    mockListUsers.mockResolvedValue([
      {
        _id: new ObjectId("64b000000000000000000011"),
        firebaseUid: "fb-1",
        email: "disabled@example.org",
        displayName: "Ana Desactivada",
        roleIds: [],
        preferredLocale: "es-AR",
        status: "disabled",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: new ObjectId("64b000000000000000000012"),
        firebaseUid: "fb-2",
        email: "ana@example.org",
        displayName: "Ana Activa",
        roleIds: [],
        preferredLocale: "es-AR",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: new ObjectId("64b000000000000000000013"),
        firebaseUid: "fb-3",
        email: "juan@example.org",
        displayName: "Juan Activo",
        roleIds: [],
        preferredLocale: "es-AR",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await searchPlatformUsersAction({ query: "ana" });
    expect(mockRequireActionPermission).toHaveBeenCalledWith("users:read");
    expect(res).toEqual({
      ok: true,
      items: [
        {
          id: "64b000000000000000000012",
          displayName: "Ana Activa",
          email: "ana@example.org",
        },
      ],
    });
  });
});
