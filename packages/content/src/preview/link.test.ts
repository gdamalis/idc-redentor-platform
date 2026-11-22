import { describe, expect, it } from "vitest";
import {
  classifyPreviewPath,
  extractLocaleFromPreviewPath,
  isValidPreviewPath,
  PREVIEW_LINK_TTL_SECONDS,
  signPreviewLink,
  verifyPreviewLink,
} from "./link";

const SECRET = "test-preview-signing-secret-32bytes";
const NOW = 1_760_000_000;

describe("classifyPreviewPath & isValidPreviewPath", () => {
  it("accepts home and every static site page in both locales", () => {
    for (const locale of ["es-AR", "en-US"] as const) {
      expect(classifyPreviewPath(`/${locale}`)).toEqual({
        kind: "static",
        locale,
        path: `/${locale}`,
      });
      for (const page of [
        "who-is-jesus",
        "community",
        "come-meet-us",
        "blog",
        "predicas",
      ]) {
        expect(classifyPreviewPath(`/${locale}/${page}`)).toEqual({
          kind: "static",
          locale,
          path: `/${locale}/${page}`,
        });
      }
    }
  });

  it("classifies dynamic blog, sermon, and topic routes accurately", () => {
    expect(classifyPreviewPath("/es-AR/blog/mi-articulo-2026")).toEqual({
      kind: "blog",
      locale: "es-AR",
      slug: "mi-articulo-2026",
      path: "/es-AR/blog/mi-articulo-2026",
    });
    expect(classifyPreviewPath("/en-US/predicas/la-gracia")).toEqual({
      kind: "sermon",
      locale: "en-US",
      slug: "la-gracia",
      path: "/en-US/predicas/la-gracia",
    });
    expect(classifyPreviewPath("/es-AR/privacidad")).toEqual({
      kind: "topic",
      locale: "es-AR",
      slug: "privacidad",
      path: "/es-AR/privacidad",
    });
    expect(classifyPreviewPath("/en-US/privacy")).toEqual({
      kind: "topic",
      locale: "en-US",
      slug: "privacy",
      path: "/en-US/privacy",
    });
  });

  it("rejects off-site URLs, protocol-relative paths, unknown locales, unknown routes, traversal, and query/hash", () => {
    const invalid = [
      "",
      "/",
      "/es-AR/",
      "/es-AR/home",
      "/fr-FR",
      "/fr-FR/blog",
      "https://evil.com/es-AR",
      "http://evil.com/es-AR",
      "//evil.com/es-AR",
      "/\\evil.com",
      "/es-AR/\\evil",
      "/es-AR/../api/draft",
      "/es-AR/blog/Bad_Slug",
      "/es-AR/blog/has space",
      "/es-AR/blog/slug?next=https://evil.com",
      "/es-AR/blog/slug#frag",
      "/es-AR/unknown/subpath",
      "/es-AR/blog/a/b",
      "/es-AR/predicas/",
      "/es-AR/\nheader",
      "/es-AR/blog/slug%2f..%2fadmin",
    ];
    for (const candidate of invalid) {
      expect(isValidPreviewPath(candidate), candidate).toBe(false);
      expect(extractLocaleFromPreviewPath(candidate), candidate).toBeNull();
    }
  });
});

describe("signPreviewLink & verifyPreviewLink", () => {
  it("round-trips a valid signed link and allows reuse while unexpired", () => {
    const signed = signPreviewLink({
      path: "/es-AR/blog/mi-articulo",
      secret: SECRET,
      nowSeconds: NOW,
    });
    expect(signed.exp).toBe(String(NOW + PREVIEW_LINK_TTL_SECONDS));

    const first = verifyPreviewLink({ ...signed, secret: SECRET, nowSeconds: NOW });
    const second = verifyPreviewLink({
      ...signed,
      secret: SECRET,
      nowSeconds: NOW + 59,
    });

    expect(first).toEqual({
      ok: true,
      path: "/es-AR/blog/mi-articulo",
      locale: "es-AR",
      exp: NOW + 60,
      route: {
        kind: "blog",
        locale: "es-AR",
        slug: "mi-articulo",
        path: "/es-AR/blog/mi-articulo",
      },
    });
    expect(second).toEqual(first);
  });

  it("refuses tampered signature, re-pathed request, or modified expiry", () => {
    const signed = signPreviewLink({
      path: "/es-AR/blog/mi-articulo",
      secret: SECRET,
      nowSeconds: NOW,
    });

    expect(
      verifyPreviewLink({
        ...signed,
        sig: `${signed.sig.slice(0, -1)}${signed.sig.endsWith("A") ? "B" : "A"}`,
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: "invalid-signature" });

    expect(
      verifyPreviewLink({
        ...signed,
        path: "/en-US/blog/mi-articulo",
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: "invalid-signature" });

    expect(
      verifyPreviewLink({
        ...signed,
        exp: String(NOW + 59),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: "invalid-signature" });
  });

  it("refuses expired links (exp <= now) and links minted >60s ahead", () => {
    const signed = signPreviewLink({
      path: "/es-AR/predicas/sermon-1",
      secret: SECRET,
      nowSeconds: NOW,
    });

    expect(
      verifyPreviewLink({
        ...signed,
        secret: SECRET,
        nowSeconds: NOW + 60,
      }),
    ).toEqual({ ok: false, reason: "expired" });

    expect(
      verifyPreviewLink({
        ...signed,
        secret: SECRET,
        nowSeconds: NOW - 1,
      }),
    ).toEqual({ ok: false, reason: "exp-too-far" });
  });

  it("fails closed when secret is unset or blank", () => {
    const signed = signPreviewLink({
      path: "/es-AR",
      secret: SECRET,
      nowSeconds: NOW,
    });
    expect(
      verifyPreviewLink({ ...signed, secret: undefined, nowSeconds: NOW }),
    ).toEqual({ ok: false, reason: "secret-not-configured" });
    expect(
      verifyPreviewLink({ ...signed, secret: "   ", nowSeconds: NOW }),
    ).toEqual({ ok: false, reason: "secret-not-configured" });
  });

  it("rejects missing params, non-numeric exp, and off-site paths", () => {
    expect(
      verifyPreviewLink({
        path: null,
        exp: String(NOW + 10),
        sig: "abc",
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: "missing-params" });

    expect(
      verifyPreviewLink({
        path: "https://evil.com/es-AR",
        exp: String(NOW + 10),
        sig: "abc",
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: "invalid-path" });

    expect(
      verifyPreviewLink({
        path: "/es-AR",
        exp: "not-a-number",
        sig: "abc",
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: "invalid-exp" });
  });

  it("refuses signing invalid paths, blank secrets, or out-of-range TTLs", () => {
    expect(() =>
      signPreviewLink({ path: "//evil.com", secret: SECRET }),
    ).toThrow(/invalid preview path/i);
    expect(() => signPreviewLink({ path: "/es-AR", secret: "" })).toThrow(
      /secret is required/i,
    );
    expect(() =>
      signPreviewLink({ path: "/es-AR", secret: SECRET, ttlSeconds: 61 }),
    ).toThrow(/ttlSeconds/i);
  });
});
