// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RICH_TEXT_SCHEMAS, bibleVerseKey, sermonDraftSchema } from "@idcr/content";
import { predicaIngestRequestSchema } from "@src/lib/predica/schemas";

// Direct native Node import of the single canonical pure-ESM builder (zero duplicated TS twin)
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../..");
const BUILDER_PATH = path.join(
  REPO_ROOT,
  ".claude/scripts/predica/build-sermon-payload.mjs",
);
const SAMPLE_FIXTURE_PATH = path.join(
  REPO_ROOT,
  ".claude/scripts/predica/__fixtures__/sample-sermon.json",
);
const WEB_FIXTURES_DIR = path.join(
  REPO_ROOT,
  "apps/web/src/utils/predica/__fixtures__",
);

interface PayloadBuilderModule {
  blocksToTipTapDoc: (blocks: unknown[]) => unknown;
  buildBibleVerseNaturalKey: (ref: unknown) => string;
  validateSermonJson: (raw: unknown) => string[];
  buildPredicaIngestPayload: (
    sermon: unknown,
    links?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => Record<string, unknown>;
}

const nodeRequire = createRequire(import.meta.url);

async function loadBuilder(): Promise<PayloadBuilderModule> {
  return nodeRequire(BUILDER_PATH) as PayloadBuilderModule;
}

describe("build-sermon-payload.mjs contract vs @idcr/content & predicaIngestRequestSchema", () => {
  it("converts sample-sermon.json into a payload accepted by BOTH predicaIngestRequestSchema and sermonDraftSchema", async () => {
    const builder = await loadBuilder();
    const sample = JSON.parse(readFileSync(SAMPLE_FIXTURE_PATH, "utf8"));

    expect(builder.validateSermonJson(sample)).toEqual([]);

    const payload = builder.buildPredicaIngestPayload(sample, {
      audioMediaId: "65f1a2b3c4d5e6f7a8b9c001",
      featuredImageId: "65f1a2b3c4d5e6f7a8b9c002",
      pdfSummaryMediaId: {
        "es-AR": "65f1a2b3c4d5e6f7a8b9c003",
        "en-US": "65f1a2b3c4d5e6f7a8b9c004",
      },
    });

    const parsedRequest = predicaIngestRequestSchema.safeParse(payload);
    expect(parsedRequest.success).toBe(true);
    if (!parsedRequest.success) return;

    // Validate TipTap docs directly against @idcr/content RICH_TEXT_SCHEMAS.sermon
    expect(
      RICH_TEXT_SCHEMAS.sermon.safeParse(parsedRequest.data.sermon.content?.["es-AR"])
        .success,
    ).toBe(true);
    expect(
      RICH_TEXT_SCHEMAS.sermon.safeParse(parsedRequest.data.sermon.content?.["en-US"])
        .success,
    ).toBe(true);

    // Validate mapped sermon draft against @idcr/content sermonDraftSchema
    expect(
      sermonDraftSchema.safeParse({
        ...parsedRequest.data.sermon,
        audioMediaId: parsedRequest.data.media?.audioMediaId,
        featuredImageId: parsedRequest.data.media?.featuredImageId,
        pdfSummaryMediaId: parsedRequest.data.media?.pdfSummaryMediaId,
      }).success,
    ).toBe(true);

    // Natural key parity with @idcr/content bibleVerseKey
    const firstRef = sample.scriptureReferences[0];
    expect(builder.buildBibleVerseNaturalKey(firstRef)).toBe(
      bibleVerseKey({
        book: firstRef["es-AR"].book,
        chapter: firstRef.chapter,
        fromVerse: firstRef.fromVerse,
        version: firstRef["es-AR"].bibleVersion,
      }),
    );
  });

  it("handles interpreted sermons (bilingual audioLanguages + interpreter) and rejects half-populated flags", async () => {
    const builder = await loadBuilder();
    const sample = JSON.parse(readFileSync(SAMPLE_FIXTURE_PATH, "utf8"));

    // Valid interpreted sermon
    const interpretedSermon = {
      ...sample,
      interpreted: true,
      interpreter: { name: "Doug Wagner" },
    };
    expect(builder.validateSermonJson(interpretedSermon)).toEqual([]);
    const payload = builder.buildPredicaIngestPayload(interpretedSermon);
    const parsed = predicaIngestRequestSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sermon.audioLanguages).toEqual(["es-AR", "en-US"]);
      expect(parsed.data.interpreter).toEqual({ name: "Doug Wagner" });
      expect(parsed.data.additionalPreachers).toBeUndefined();
    }

    // Half-populated interpreter without interpreted:true fails closed
    const badNoFlag = JSON.parse(
      readFileSync(
        path.join(WEB_FIXTURES_DIR, "interpreter-no-flag-sermon.json"),
        "utf8",
      ),
    );
    expect(builder.validateSermonJson(badNoFlag).length).toBeGreaterThan(0);

    // Malformed interpreted (non-boolean) fails closed
    const badMalformed = JSON.parse(
      readFileSync(
        path.join(WEB_FIXTURES_DIR, "malformed-interpreted-sermon.json"),
        "utf8",
      ),
    );
    expect(builder.validateSermonJson(badMalformed).length).toBeGreaterThan(0);

    // Non-object root fails closed
    const nonObj = JSON.parse(
      readFileSync(
        path.join(WEB_FIXTURES_DIR, "nonobject-sermon.json"),
        "utf8",
      ),
    );
    expect(builder.validateSermonJson(nonObj).length).toBeGreaterThan(0);
  });

  it("allows Spanish-only drafts (missing en-US, Edge Case #9) and collapses hard newlines in TipTap text", async () => {
    const builder = await loadBuilder();
    const sample = JSON.parse(readFileSync(SAMPLE_FIXTURE_PATH, "utf8"));
    const spanishOnly = {
      ...sample,
      locales: {
        "es-AR": {
          ...sample.locales["es-AR"],
          content: [
            { type: "p", text: "Primera línea\nSegunda línea" },
            { type: "embeddedAsset", assetId: "65f1a2b3c4d5e6f7a8b9c055" },
          ],
        },
      },
    };

    expect(builder.validateSermonJson(spanishOnly)).toEqual([]);
    const payload = builder.buildPredicaIngestPayload(spanishOnly);
    const parsed = predicaIngestRequestSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.sermon.title["en-US"]).toBeUndefined();
    expect(parsed.data.sermon.content?.["en-US"]).toBeUndefined();
    const esDoc = parsed.data.sermon.content?.["es-AR"];
    expect(esDoc?.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Primera línea Segunda línea" }],
    });
    expect(esDoc?.content[1]).toEqual({
      type: "embeddedMedia",
      attrs: { mediaId: "65f1a2b3c4d5e6f7a8b9c055" },
    });
  });
});
