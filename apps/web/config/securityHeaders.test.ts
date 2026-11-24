import { describe, expect, it } from "vitest";
// CommonJS module — import via require-interop
import { buildSecurityHeaders } from "./securityHeaders";

const find = (hs: Array<{ key: string; value: string }>, k: string) =>
  hs.find((h) => h.key.toLowerCase() === k.toLowerCase());

describe("buildSecurityHeaders", () => {
  it("production: strict clickjacking with SAMEORIGIN and no Contentful frame-ancestors", () => {
    const hs = buildSecurityHeaders({ previewLike: false });
    expect(find(hs, "X-Frame-Options")?.value).toBe("SAMEORIGIN");
    const csp = find(hs, "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'self';");
    expect(csp).not.toContain("app.contentful.com");
    expect(csp).not.toContain("app.eu.contentful.com");
  });

  it("preview/dev: restores X-Frame-Options: SAMEORIGIN and drops Contentful frame-ancestors (ICR-205 AC8)", () => {
    const hs = buildSecurityHeaders({ previewLike: true });
    expect(find(hs, "X-Frame-Options")?.value).toBe("SAMEORIGIN");
    const csp = find(hs, "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'self';");
    expect(csp).not.toContain("app.contentful.com");
    expect(csp).not.toContain("app.eu.contentful.com");
  });

  it("keeps all headers and CSP directives identical across envs", () => {
    const prod = buildSecurityHeaders({ previewLike: false });
    const prev = buildSecurityHeaders({ previewLike: true });
    expect(prev).toEqual(prod);
  });

  it("allows Vercel Blob public media host in img-src and media-src while keeping ctfassets until ICR-207 and read-only connect-src", () => {
    const csp = find(
      buildSecurityHeaders({ previewLike: false }),
      "Content-Security-Policy",
    )!.value;
    const grab = (d: string) =>
      csp
        .split(";")
        .find((s) => s.trim().startsWith(d))
        ?.trim() ?? "";

    expect(grab("img-src")).toContain("https://*.public.blob.vercel-storage.com");
    expect(grab("img-src")).toContain("https://images.ctfassets.net");
    expect(grab("img-src")).toContain("https://images.eu.ctfassets.net");
    expect(grab("img-src")).toContain("https://images.unsplash.com");

    expect(grab("media-src")).toContain("https://*.public.blob.vercel-storage.com");
    expect(grab("media-src")).toContain("https://assets.ctfassets.net");
    expect(grab("media-src")).toContain("https://assets.eu.ctfassets.net");
    expect(grab("media-src")).toContain("https://downloads.ctfassets.net");

    expect(grab("connect-src")).not.toContain("blob.vercel-storage.com");
  });
});
