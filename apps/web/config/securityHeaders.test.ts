import { describe, expect, it } from "vitest";
// CommonJS module — import via require-interop
import { buildSecurityHeaders } from "./securityHeaders";

const find = (hs: Array<{ key: string; value: string }>, k: string) =>
  hs.find((h) => h.key.toLowerCase() === k.toLowerCase());

describe("buildSecurityHeaders", () => {
  it("production: strict clickjacking with SAMEORIGIN and self-only frame-ancestors", () => {
    const hs = buildSecurityHeaders({ previewLike: false });
    expect(find(hs, "X-Frame-Options")?.value).toBe("SAMEORIGIN");
    const csp = find(hs, "Content-Security-Policy")!.value;
    const frameAncestors = csp
      .split(";")
      .find((s) => s.trim().startsWith("frame-ancestors"))
      ?.trim();
    expect(frameAncestors).toBe("frame-ancestors 'self'");
  });

  it("preview/dev: keeps X-Frame-Options: SAMEORIGIN and self-only frame-ancestors", () => {
    const hs = buildSecurityHeaders({ previewLike: true });
    expect(find(hs, "X-Frame-Options")?.value).toBe("SAMEORIGIN");
    const csp = find(hs, "Content-Security-Policy")!.value;
    const frameAncestors = csp
      .split(";")
      .find((s) => s.trim().startsWith("frame-ancestors"))
      ?.trim();
    expect(frameAncestors).toBe("frame-ancestors 'self'");
  });

  it("keeps all headers and CSP directives identical across envs", () => {
    const prod = buildSecurityHeaders({ previewLike: false });
    const prev = buildSecurityHeaders({ previewLike: true });
    expect(prev).toEqual(prod);
  });

  it("restricts img-src and media-src to exact allowed hosts (Vercel Blob + analytics/Unsplash) and read-only connect-src", () => {
    const csp = find(
      buildSecurityHeaders({ previewLike: false }),
      "Content-Security-Policy",
    )!.value;
    const grab = (d: string) =>
      csp
        .split(";")
        .find((s) => s.trim().startsWith(d))
        ?.trim() ?? "";

    expect(grab("img-src")).toBe(
      "img-src 'self' data: https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com https://images.unsplash.com https://*.public.blob.vercel-storage.com",
    );

    expect(grab("media-src")).toBe(
      "media-src 'self' https://*.public.blob.vercel-storage.com",
    );

    expect(grab("connect-src")).not.toContain("blob.vercel-storage.com");
  });
});
