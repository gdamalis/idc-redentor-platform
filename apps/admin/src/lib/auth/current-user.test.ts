import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `React.cache()` only memoizes inside a live React Server render — it needs
 * the `react-server` module-resolution condition, which Vitest's default
 * Node resolution does not use. Outside that condition `react`'s real
 * `cache()` is a plain passthrough (see react.development.js:
 * `exports.cache = function (fn) { return function () { return fn.apply(null,
 * arguments); }; };`), so calling the real thing here would call
 * `verifySession`/`findUserByFirebaseUid` once per call and the memoization
 * assertion below would fail for reasons that have nothing to do with this
 * module's own code. This mock reproduces the ONE property `current-user.ts`
 * actually depends on — one resolved-session promise shared by every caller
 * in a request — without depending on React's render machinery. Mirrors
 * `require-permission.test.ts`'s identical mock. Do not remove it.
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

const cookiesGet = vi.fn();
const verifySession = vi.fn();
const findUserByFirebaseUid = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: cookiesGet }),
}));

vi.mock("./session", () => ({
  SESSION_COOKIE_NAME: "__session",
  verifySession,
}));

vi.mock("@src/service/user.service", () => ({
  findUserByFirebaseUid,
}));

// `cache()` memoizes for the life of the module instance (it has no
// arguments to key on), so every test needs a FRESH module — otherwise the
// first test's resolved session would stay cached for every test after it.
async function loadModule() {
  vi.resetModules();
  return import("./current-user");
}

beforeEach(() => vi.clearAllMocks());

describe("getCurrentUser", () => {
  it("returns no-session when there is no session cookie", async () => {
    const { getCurrentUser } = await loadModule();
    cookiesGet.mockReturnValueOnce(undefined);

    expect(await getCurrentUser()).toEqual({ ok: false, reason: "no-session" });
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("returns expired when the cookie fails verification", async () => {
    const { getCurrentUser } = await loadModule();
    cookiesGet.mockReturnValueOnce({ value: "cookie-value" });
    verifySession.mockResolvedValueOnce(null);

    expect(await getCurrentUser()).toEqual({ ok: false, reason: "expired" });
    // Authoritative path: checkRevoked:true (pays the network hop).
    expect(verifySession).toHaveBeenCalledWith("cookie-value", true);
  });

  it("returns no-user when the cookie is valid but no Mongo user matches", async () => {
    const { getCurrentUser } = await loadModule();
    cookiesGet.mockReturnValueOnce({ value: "cookie-value" });
    verifySession.mockResolvedValueOnce({ uid: "uid1" });
    findUserByFirebaseUid.mockResolvedValueOnce(null);

    expect(await getCurrentUser()).toEqual({ ok: false, reason: "no-user" });
  });

  it("returns disabled when the matching user is disabled", async () => {
    const { getCurrentUser } = await loadModule();
    cookiesGet.mockReturnValueOnce({ value: "cookie-value" });
    verifySession.mockResolvedValueOnce({ uid: "uid1" });
    findUserByFirebaseUid.mockResolvedValueOnce({
      firebaseUid: "uid1",
      status: "disabled",
    });

    expect(await getCurrentUser()).toEqual({ ok: false, reason: "disabled" });
  });

  it("returns ok with the resolved active user", async () => {
    const { getCurrentUser } = await loadModule();
    cookiesGet.mockReturnValueOnce({ value: "cookie-value" });
    const user = { firebaseUid: "uid1", status: "active" };
    verifySession.mockResolvedValueOnce({ uid: "uid1" });
    findUserByFirebaseUid.mockResolvedValueOnce(user);

    expect(await getCurrentUser()).toEqual({ ok: true, user });
  });

  // P2 fix: `(app)/layout.tsx` calls `getCurrentUser()` directly AND
  // `getSessionPermissions()` calls it again for the same request — before
  // this fix those two calls each paid their own `verifySession`
  // (`checkRevoked: true`, a Firebase Admin network round-trip) plus their
  // own Mongo `findUserByFirebaseUid`. `cache()` collapses that to one.
  it("memoizes: two calls in one request hit verifySession and findUserByFirebaseUid once each", async () => {
    const { getCurrentUser } = await loadModule();
    cookiesGet.mockReturnValue({ value: "cookie-value" });
    const user = { firebaseUid: "uid1", status: "active" };
    verifySession.mockResolvedValue({ uid: "uid1" });
    findUserByFirebaseUid.mockResolvedValue(user);

    const first = await getCurrentUser();
    const second = await getCurrentUser();

    expect(first).toEqual({ ok: true, user });
    expect(second).toEqual({ ok: true, user });
    expect(verifySession).toHaveBeenCalledTimes(1);
    expect(findUserByFirebaseUid).toHaveBeenCalledTimes(1);
  });

  it("never reads customClaims/decoded.role/token.role for authorization", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/auth/current-user.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/customClaims|decoded\.role|token\.role/);
  });
});
