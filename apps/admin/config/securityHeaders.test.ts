import { describe, expect, it } from "vitest";
import { buildAdminSecurityHeaders } from "./securityHeaders";

const find = (hs: Array<{ key: string; value: string }>, k: string) =>
  hs.find((h) => h.key.toLowerCase() === k.toLowerCase());

describe("buildAdminSecurityHeaders (ICR-196 AC8 / ICR-188)", () => {
  it("enforces anti-framing, nosniff, HSTS, and Referrer-Policy", () => {
    const hs = buildAdminSecurityHeaders();
    expect(find(hs, "X-Frame-Options")?.value).toBe("DENY");
    expect(find(hs, "X-Content-Type-Options")?.value).toBe("nosniff");
    expect(find(hs, "Referrer-Policy")?.value).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(find(hs, "Strict-Transport-Security")?.value).toContain("max-age=");
  });

  it("allows Vercel Blob client uploads/previews and Firebase Auth while forbidding framing", () => {
    const csp = find(
      buildAdminSecurityHeaders(),
      "Content-Security-Policy",
    )!.value;
    const grab = (d: string) =>
      csp
        .split(";")
        .find((s) => s.trim().startsWith(d))
        ?.trim() ?? "";

    expect(grab("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(grab("connect-src")).toContain("https://vercel.com");
    expect(grab("connect-src")).toContain("https://*.blob.vercel-storage.com");
    expect(grab("connect-src")).toContain("https://identitytoolkit.googleapis.com");
    expect(grab("connect-src")).toContain("https://securetoken.googleapis.com");
    expect(grab("frame-src")).toContain("https://accounts.google.com");
    expect(grab("img-src")).toContain("https://*.public.blob.vercel-storage.com");
    expect(grab("img-src")).toContain("blob:");
    expect(grab("media-src")).toContain("https://*.public.blob.vercel-storage.com");
    expect(grab("media-src")).toContain("blob:");
  });
});
