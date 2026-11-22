import { describe, expect, it } from "vitest";
import {
  BLOB_STORE_IDS,
  collapseAsciiWhitespace,
  computeTipTapSermonContentHash,
  convertAndVerifyRichText,
  diagnoseBrokenHref,
  extractBlobStoreId,
  extractPlainTextFromContentful,
  extractPlainTextFromTipTap,
  isAllowedWebsiteDbName,
  normalizeContentfulAssetUrl,
  scanBrokenLinksInTipTap,
  validateImportBlobStore,
  validateImportTargetDb,
  verifyLosslessTipTapRoundTrip,
} from "../index";

const cfText = (value: string, marks: Array<{ type: string }> = []) => ({
  nodeType: "text",
  value,
  marks,
  data: {},
});

const cfParagraph = (...children: unknown[]) => ({
  nodeType: "paragraph",
  data: {},
  content: children,
});

const cfDoc = (...blocks: unknown[]) => ({
  nodeType: "document",
  data: {},
  content: blocks,
});

describe("validateImportTargetDb & URL/link guards (AC1)", () => {
  it("allows website-staging by default and refuses production without --prod", () => {
    expect(isAllowedWebsiteDbName("website-staging")).toBe(true);
    expect(isAllowedWebsiteDbName("website")).toBe(true);
    expect(isAllowedWebsiteDbName("ministry-admin-staging")).toBe(false);
    expect(isAllowedWebsiteDbName("test")).toBe(false);

    expect(validateImportTargetDb("website-staging")).toEqual({
      ok: true,
      dbName: "website-staging",
      isProd: false,
    });

    const prodBlocked = validateImportTargetDb("website");
    expect(prodBlocked.ok).toBe(false);

    expect(validateImportTargetDb("website", { allowProd: true })).toEqual({
      ok: true,
      dbName: "website",
      isProd: true,
    });
  });

  it("refuses reserved/non-website databases even when allowProd is true", () => {
    for (const bad of [
      "",
      "   ",
      "test",
      "admin",
      "local",
      "config",
      "ministry-admin",
      "ministry-admin-staging",
      "website-prod",
    ]) {
      const res = validateImportTargetDb(bad, {
        allowProd: true,
        allowTestDb: true,
      });
      expect(res.ok).toBe(false);
    }

    expect(validateImportTargetDb("website-test").ok).toBe(false);
    expect(
      validateImportTargetDb("website-test", { allowTestDb: true }).ok,
    ).toBe(true);
  });

  it("enforces production vs staging Vercel Blob store guard without leaking token secrets (C2)", () => {
    const fakeSecret = "SECRET_SEGMENT_DO_NOT_LEAK";
    const prodToken = `vercel_blob_rw_84ITqLAkqBDRwxYo_${fakeSecret}`;
    const stagingToken = `vercel_blob_rw_KmIXa14hB4dGuVjF_${fakeSecret}`;

    expect(extractBlobStoreId(prodToken)).toBe(BLOB_STORE_IDS.production);
    expect(extractBlobStoreId(stagingToken)).toBe(BLOB_STORE_IDS.staging);

    // Production Blob store refused on staging (both dry-run and apply)
    const prodOnStaging = validateImportBlobStore(prodToken, {
      apply: false,
      isProd: false,
      allowProd: false,
    });
    expect(prodOnStaging.ok).toBe(false);
    if (!prodOnStaging.ok) {
      expect(prodOnStaging.reason).toContain("idcr-media");
      expect(prodOnStaging.reason).not.toContain(fakeSecret);
    }

    // Production Blob store allowed ONLY when targeting prod DB with --prod
    expect(
      validateImportBlobStore(prodToken, {
        apply: true,
        isProd: true,
        allowProd: true,
      }).ok,
    ).toBe(true);

    // Staging Blob store refused when targeting production DB "website"
    const stagingOnProd = validateImportBlobStore(stagingToken, {
      apply: true,
      isProd: true,
      allowProd: true,
    });
    expect(stagingOnProd.ok).toBe(false);
    if (!stagingOnProd.ok) {
      expect(stagingOnProd.reason).toContain("idcr-media-staging");
      expect(stagingOnProd.reason).not.toContain(fakeSecret);
    }

    // Staging Blob store allowed on staging DB
    expect(
      validateImportBlobStore(stagingToken, {
        apply: true,
        isProd: false,
        allowProd: false,
      }).ok,
    ).toBe(true);

    // Missing token refused on --apply when required
    expect(
      validateImportBlobStore(undefined, {
        apply: true,
        isProd: false,
        requireTokenOnApply: true,
      }).ok,
    ).toBe(false);
  });

  it("normalizes protocol-relative Contentful URLs", () => {
    expect(
      normalizeContentfulAssetUrl("//images.ctfassets.net/space/asset/hash/img.jpg"),
    ).toBe("https://images.ctfassets.net/space/asset/hash/img.jpg");
    expect(
      normalizeContentfulAssetUrl("https://assets.ctfassets.net/space/a/b/c.pdf"),
    ).toBe("https://assets.ctfassets.net/space/a/b/c.pdf");
  });

  it("flags contact-form broken .com /privacy-policy links while allowing valid URLs", () => {
    const reason = diagnoseBrokenHref(
      "https://idcredentor.com/es-AR/privacy-policy",
    );
    expect(reason).toContain("idcredentor.com");
    expect(reason).toContain("/privacy-policy");

    expect(diagnoseBrokenHref("https://idcredentor.org/es-AR/privacidad")).toBeNull();
    expect(diagnoseBrokenHref("mailto:contacto@example.org")).toBeNull();
    expect(diagnoseBrokenHref("/es-AR/privacidad")).toBeNull();

    const converted = convertAndVerifyRichText(
      cfDoc(
        cfParagraph(
          cfText("Acepto la "),
          {
            nodeType: "hyperlink",
            data: { uri: "https://idcredentor.com/es-AR/privacy-policy" },
            content: [cfText("política de privacidad")],
          },
        ),
      ),
      { profile: "inlineLink" },
    );
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;

    const findings = scanBrokenLinksInTipTap(converted.doc, {
      sourceContentfulId: "cf-contact-1",
      contentType: "contactForm",
      field: "agreementNote",
      locale: "es-AR",
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.href).toBe(
      "https://idcredentor.com/es-AR/privacy-policy",
    );
  });
});

describe("convertAndVerifyRichText & lossless TipTap round-trip (AC6)", () => {
  it("converts all sermon nodes/marks, replaces newlines with spaces, and round-trips through TipTap unchanged", () => {
    const raw = cfDoc(
      { nodeType: "heading-2", data: {}, content: [cfText("Sección 1")] },
      { nodeType: "heading-3", data: {}, content: [cfText("Subsección")] },
      cfParagraph(
        cfText("Línea 1\nLínea 2 "),
        cfText("en negrita", [{ type: "bold" }]),
        cfText(" y "),
        cfText("ambas", [{ type: "italic" }, { type: "bold" }]),
      ),
      {
        nodeType: "blockquote",
        data: {},
        content: [cfParagraph(cfText("Cita bíblica"))],
      },
      {
        nodeType: "unordered-list",
        data: {},
        content: [
          {
            nodeType: "list-item",
            data: {},
            content: [
              cfParagraph(cfText("Punto 1")),
              {
                nodeType: "ordered-list",
                data: {},
                content: [
                  {
                    nodeType: "list-item",
                    data: {},
                    content: [cfParagraph(cfText("Subpunto 1.1"))],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        nodeType: "embedded-asset-block",
        data: {
          target: { sys: { type: "Link", linkType: "Asset", id: "cf-asset-audio" } },
        },
        content: [],
      },
    );

    const res = convertAndVerifyRichText(raw, {
      profile: "sermon",
      assetIdMap: { "cf-asset-audio": "65f1a2b3c4d5e6f708091011" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(verifyLosslessTipTapRoundTrip(res.doc, "sermon")).toEqual({
      ok: true,
    });

    const beforePlain = extractPlainTextFromContentful(raw);
    const afterPlain = extractPlainTextFromTipTap(res.doc);
    expect(collapseAsciiWhitespace(afterPlain)).toBe(
      collapseAsciiWhitespace(beforePlain),
    );
  });

  it("refuses disallowed nodes for inline profile and missing embedded asset mappings", () => {
    const headingInInline = convertAndVerifyRichText(
      cfDoc({ nodeType: "heading-2", data: {}, content: [cfText("No")] }),
      { profile: "inline" },
    );
    expect(headingInInline.ok).toBe(false);

    const missingEmbed = convertAndVerifyRichText(
      cfDoc({
        nodeType: "embedded-asset-block",
        data: { target: { sys: { id: "missing-id" } } },
        content: [],
      }),
      { profile: "sermon", assetIdMap: {} },
    );
    expect(missingEmbed.ok).toBe(false);
    if (!missingEmbed.ok) {
      expect(missingEmbed.issues[0]?.code).toBe("missing-asset-mapping");
    }
  });

  it("computes deterministic sermon contentHash ignoring formatting marks", () => {
    const plainDoc = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [{ type: "text" as const, text: "Mensaje central" }],
        },
      ],
    };
    const boldDoc = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [
            {
              type: "text" as const,
              text: "Mensaje central",
              marks: [{ type: "bold" as const }],
            },
          ],
        },
      ],
    };

    const h1 = computeTipTapSermonContentHash(
      { title: "Prédica", sermonDate: "2026-07-12", content: plainDoc, preacherName: "Pastor" },
      { title: "Sermon", sermonDate: "2026-07-12", content: plainDoc, preacherName: "Pastor" },
    );
    const h2 = computeTipTapSermonContentHash(
      { title: "Prédica", sermonDate: "2026-07-12", content: boldDoc, preacherName: "Pastor" },
      { title: "Sermon", sermonDate: "2026-07-12", content: boldDoc, preacherName: "Pastor" },
    );
    expect(h1).toHaveLength(64);
    expect(h1).toBe(h2);
  });
});
