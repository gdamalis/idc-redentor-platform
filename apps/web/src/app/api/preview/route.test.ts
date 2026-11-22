import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signPreviewLink } from "@idcr/content/preview";

const { enable } = vi.hoisted(() => ({ enable: vi.fn() }));

vi.mock("next/headers", () => ({
  draftMode: vi.fn(async () => ({ enable })),
}));

import { GET } from "./route";

const SECRET = "test-content-preview-secret-32bytes";

function makeRequest(params: { readonly path?: string; readonly exp?: string; readonly sig?: string }) {
  const url = new URL("https://example.com/api/preview");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CONTENT_PREVIEW_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/preview", () => {
  it("enables Draft Mode and 307-redirects to relative path with no-store/noindex on a valid signed link", async () => {
    const signed = signPreviewLink({
      path: "/es-AR/blog/mi-articulo",
      secret: SECRET,
    });

    const res = await GET(makeRequest(signed));

    expect(res.status).toBe(307);
    expect(res.headers.get("Location")).toBe("/es-AR/blog/mi-articulo");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(enable).toHaveBeenCalledTimes(1);

    // Same valid link works again while unexpired (not single-use)
    const second = await GET(makeRequest(signed));
    expect(second.status).toBe(307);
    expect(enable).toHaveBeenCalledTimes(2);
  });

  it("401s on tampered signature, re-pathed request, or expired link and keeps Draft Mode off", async () => {
    const signed = signPreviewLink({
      path: "/es-AR/predicas/la-gracia",
      secret: SECRET,
    });

    const tampered = await GET(
      makeRequest({ ...signed, sig: `${signed.sig}x` }),
    );
    expect(tampered.status).toBe(401);

    const repathed = await GET(
      makeRequest({ ...signed, path: "/en-US/predicas/la-gracia" }),
    );
    expect(repathed.status).toBe(401);

    const expired = signPreviewLink({
      path: "/es-AR/predicas/la-gracia",
      secret: SECRET,
      nowSeconds: Math.floor(Date.now() / 1000) - 120,
    });
    const expiredRes = await GET(makeRequest(expired));
    expect(expiredRes.status).toBe(401);

    expect(enable).not.toHaveBeenCalled();
  });

  it("400s on off-site, protocol-relative, unknown-route, or missing params without enabling Draft Mode", async () => {
    for (const badPath of [
      "https://evil.com/es-AR",
      "//evil.com/es-AR",
      "/fr-FR/blog",
      "/es-AR/unknown/route",
      "/es-AR/blog/Bad_Slug",
    ]) {
      const res = await GET(
        makeRequest({ path: badPath, exp: String(Math.floor(Date.now() / 1000) + 30), sig: "abc" }),
      );
      expect(res.status, badPath).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }

    const missing = await GET(makeRequest({ path: "/es-AR" }));
    expect(missing.status).toBe(400);
    expect(enable).not.toHaveBeenCalled();
  });

  it("fails closed (401) when CONTENT_PREVIEW_SECRET is unset", async () => {
    const signed = signPreviewLink({ path: "/es-AR", secret: SECRET });
    vi.stubEnv("CONTENT_PREVIEW_SECRET", undefined);

    const res = await GET(makeRequest(signed));
    expect(res.status).toBe(401);
    expect(enable).not.toHaveBeenCalled();
  });
});
