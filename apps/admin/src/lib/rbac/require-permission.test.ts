import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionResult } from "@src/service/types";
import type { DeniedReason } from "./require-permission";

/**
 * `React.cache()` only memoizes inside a live React Server render — it needs
 * the `react-server` module-resolution condition, which Vitest's default
 * Node resolution does not use. Outside that condition `react`'s real
 * `cache()` is a plain passthrough (see react.development.js:
 * `exports.cache = function (fn) { return function () { return fn.apply(null,
 * arguments); }; };`), so calling the real thing here would call
 * `findRolesByIds` once per call and the memoization assertions below would
 * fail for reasons that have nothing to do with this module's own code. This
 * mock reproduces the ONE property `require-permission.ts` actually depends
 * on — one resolved-permissions promise shared by every caller in a
 * request — without depending on React's render machinery.
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T => {
      let cached: { value: ReturnType<T> } | undefined;
      return ((...args: Parameters<T>) => {
        cached ??= { value: fn(...args) as ReturnType<T> };
        return cached.value;
      }) as T;
    },
  };
});

const getCurrentUser = vi.fn();
const findRolesByIds = vi.fn();

vi.mock("@src/lib/auth/current-user", () => ({ getCurrentUser }));
vi.mock("@src/service/role.service", () => ({ findRolesByIds }));

async function loadModule() {
  vi.resetModules();
  return import("./require-permission");
}

beforeEach(() => vi.clearAllMocks());

const activeUser = {
  _id: "u1",
  firebaseUid: "fb1",
  email: "a@b.co",
  roleIds: ["r1"],
  preferredLocale: "es-AR",
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

type SessionRefusedReason = Extract<SessionResult, { ok: false }>["reason"];

// `SessionResult`'s refused variant carries exactly 8 reasons
// (service/types.ts:34-42). Every one is asserted here so the mapping stays
// exhaustive as a fact of this test suite, not just of the source's switch.
const REASON_MAPPING: Array<[SessionRefusedReason, DeniedReason]> = [
  ["no-session", "unauthenticated"],
  ["expired", "unauthenticated"],
  ["revoked", "unauthenticated"],
  ["no-invite", "unauthenticated"],
  ["email-unverified", "unauthenticated"],
  ["provisioning-conflict", "unauthenticated"],
  ["no-user", "no-account"],
  ["disabled", "disabled"],
];

describe("getSessionPermissions — SessionResult reason mapping", () => {
  it.each(REASON_MAPPING)(
    "maps SessionResult reason %s to DeniedReason %s",
    async (reason, expected) => {
      getCurrentUser.mockResolvedValueOnce({
        ok: false,
        reason,
      } satisfies SessionResult);
      const { getSessionPermissions } = await loadModule();

      expect(await getSessionPermissions()).toEqual({
        ok: false,
        reason: expected,
      });
      expect(findRolesByIds).not.toHaveBeenCalled();
    },
  );
});

describe("getSessionPermissions — authorized session", () => {
  it("resolves permissions from the user's roles", async () => {
    getCurrentUser.mockResolvedValue({ ok: true, user: activeUser });
    findRolesByIds.mockResolvedValue([{ permissions: ["people:read"] }]);
    const { getSessionPermissions } = await loadModule();

    const result = await getSessionPermissions();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected an authorized result");
    expect(result.user).toBe(activeUser);
    expect([...result.permissions]).toEqual(["people:read"]);
    expect(findRolesByIds).toHaveBeenCalledWith(["r1"]);
  });

  it("resolves an empty set for a user with zero roles", async () => {
    getCurrentUser.mockResolvedValue({
      ok: true,
      user: { ...activeUser, roleIds: [] },
    });
    findRolesByIds.mockResolvedValue([]);
    const { getSessionPermissions } = await loadModule();

    const result = await getSessionPermissions();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected an authorized result");
    expect(result.permissions.size).toBe(0);
  });

  it("memoizes: two calls in one request hit findRolesByIds once", async () => {
    getCurrentUser.mockResolvedValue({ ok: true, user: activeUser });
    findRolesByIds.mockResolvedValue([{ permissions: ["people:read"] }]);
    const { getSessionPermissions } = await loadModule();

    await getSessionPermissions();
    await getSessionPermissions();

    expect(findRolesByIds).toHaveBeenCalledTimes(1);
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });
});

describe("requirePermission", () => {
  it("is ok when the session holds the key", async () => {
    getCurrentUser.mockResolvedValue({ ok: true, user: activeUser });
    findRolesByIds.mockResolvedValue([{ permissions: ["people:read"] }]);
    const { requirePermission } = await loadModule();

    const result = await requirePermission("people:read");
    expect(result.ok).toBe(true);
  });

  it("is forbidden when authorized but the key is missing", async () => {
    getCurrentUser.mockResolvedValue({ ok: true, user: activeUser });
    findRolesByIds.mockResolvedValue([{ permissions: ["people:read"] }]);
    const { requirePermission } = await loadModule();

    expect(await requirePermission("people:write")).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("is forbidden for every key when the user has zero roles", async () => {
    getCurrentUser.mockResolvedValue({
      ok: true,
      user: { ...activeUser, roleIds: [] },
    });
    findRolesByIds.mockResolvedValue([]);
    const { requirePermission } = await loadModule();

    expect(await requirePermission("people:read")).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(await requirePermission("roles:manage")).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("propagates a denied session reason unchanged, without checking permissions", async () => {
    getCurrentUser.mockResolvedValue({ ok: false, reason: "no-session" });
    const { requirePermission } = await loadModule();

    expect(await requirePermission("people:read")).toEqual({
      ok: false,
      reason: "unauthenticated",
    });
    expect(findRolesByIds).not.toHaveBeenCalled();
  });
});
