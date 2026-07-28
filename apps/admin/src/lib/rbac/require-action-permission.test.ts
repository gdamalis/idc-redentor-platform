import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
vi.mock("./require-permission", () => ({ requirePermission }));

const getLocale = vi.fn();
vi.mock("next-intl/server", () => ({ getLocale }));

const headersGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: headersGet }),
}));

// Real `redirect()` throws a Next.js-internal `NEXT_REDIRECT` digest error to
// halt rendering — that's what makes it safe for `requireActionPermission` to
// call it with no `return` afterward (the call site's guide, `receiving-code
// -review`, requires verifying this rather than assuming it). This mock
// reproduces the ONE property the wrapper depends on — it never returns —
// without depending on Next's request machinery.
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("@src/i18n/routing", () => ({ redirect }));

async function loadModule() {
  vi.resetModules();
  return import("./require-action-permission");
}

beforeEach(() => vi.clearAllMocks());

const AUTHORIZED = {
  ok: true as const,
  user: { _id: { toHexString: () => "u1" }, email: "a@idcr.org" },
  permissions: new Set(["roles:manage"]),
};

describe("requireActionPermission", () => {
  it("passes through an authorized result unchanged, without redirecting", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    const { requireActionPermission } = await loadModule();

    const result = await requireActionPermission("roles:manage");

    expect(result).toBe(AUTHORIZED);
    expect(redirect).not.toHaveBeenCalled();
    expect(getLocale).not.toHaveBeenCalled();
  });

  it("passes through a forbidden refusal unchanged, without redirecting", async () => {
    requirePermission.mockResolvedValueOnce({ ok: false, reason: "forbidden" });
    const { requireActionPermission } = await loadModule();

    const result = await requireActionPermission("roles:manage");

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(redirect).not.toHaveBeenCalled();
    expect(getLocale).not.toHaveBeenCalled();
  });

  // P2 fix: session expires mid-edit must not strand the admin on the
  // dashboard after re-login — the sanitized proxy-injected pathname header
  // is carried through as `callbackUrl`, exactly like `(app)/layout.tsx`.
  it("redirects to /login with a sanitized callbackUrl when the pathname header is present", async () => {
    requirePermission.mockResolvedValueOnce({ ok: false, reason: "unauthenticated" });
    getLocale.mockResolvedValueOnce("es-AR");
    headersGet.mockReturnValueOnce("/roles/abc123/edit");
    const { requireActionPermission } = await loadModule();

    await expect(requireActionPermission("roles:manage")).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith({
      href: { pathname: "/login", query: { callbackUrl: "/roles/abc123/edit" } },
      locale: "es-AR",
    });
  });

  it("redirects to plain /login when the pathname header is absent", async () => {
    requirePermission.mockResolvedValueOnce({ ok: false, reason: "unauthenticated" });
    getLocale.mockResolvedValueOnce("es-AR");
    headersGet.mockReturnValueOnce(null);
    const { requireActionPermission } = await loadModule();

    await expect(requireActionPermission("roles:manage")).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith({ href: "/login", locale: "es-AR" });
  });

  it.each(["no-account", "disabled"] as const)(
    "redirects to /no-access on a %s refusal",
    async (reason) => {
      requirePermission.mockResolvedValueOnce({ ok: false, reason });
      getLocale.mockResolvedValueOnce("en-US");
      const { requireActionPermission } = await loadModule();

      await expect(requireActionPermission("roles:manage")).rejects.toThrow("NEXT_REDIRECT");

      expect(redirect).toHaveBeenCalledWith({ href: "/no-access", locale: "en-US" });
    },
  );
});
