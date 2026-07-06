import { describe, expect, it } from "vitest";
// CommonJS module — import via require-interop
import { buildSecurityHeaders } from "./securityHeaders";

const find = (hs: Array<{ key: string; value: string }>, k: string) =>
  hs.find((h) => h.key.toLowerCase() === k.toLowerCase());

describe("buildSecurityHeaders", () => {
  it("production: strict clickjacking, no Contentful frame-ancestors", () => {
    const hs = buildSecurityHeaders({ previewLike: false });
    expect(find(hs, "X-Frame-Options")?.value).toBe("SAMEORIGIN");
    const csp = find(hs, "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'self';");
    expect(csp).not.toContain("app.contentful.com");
  });

  it("preview: no X-Frame-Options, both Contentful origins framed", () => {
    const hs = buildSecurityHeaders({ previewLike: true });
    expect(find(hs, "X-Frame-Options")).toBeUndefined();
    const csp = find(hs, "Content-Security-Policy")!.value;
    expect(csp).toContain("https://app.contentful.com");
    expect(csp).toContain("https://app.eu.contentful.com");
  });

  it("keeps other CSP directives identical across envs", () => {
    const prod = find(
      buildSecurityHeaders({ previewLike: false }),
      "Content-Security-Policy",
    )!.value;
    const prev = find(
      buildSecurityHeaders({ previewLike: true }),
      "Content-Security-Policy",
    )!.value;
    for (const d of ["script-src", "connect-src", "img-src", "media-src"]) {
      const grab = (csp: string) =>
        csp
          .split(";")
          .find((s) => s.trim().startsWith(d))
          ?.trim();
      expect(grab(prod)).toBe(grab(prev));
    }
  });
});
