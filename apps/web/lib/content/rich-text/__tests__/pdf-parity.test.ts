import type { Document } from "@contentful/rich-text-types";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Sermon } from "@src/types/Sermon";
import {
  computeSermonContentHash,
  richTextToContentBlocks,
} from "@src/utils/predica/regenContent";
import {
  computeTipTapSermonContentHash,
  tiptapToContentBlocks,
  type TipTapSermonHashLocaleInput,
} from "@src/utils/predica/tiptapRegenContent";
import { convertContentfulRichText } from "../convert-contentful";

interface CorpusScriptureRef {
  book: string;
  chapter: number;
  fromVerse: number;
  toVerse: number | null;
  verseContent: string;
  bibleVersion: string;
}

interface CorpusSermon {
  entryId: string;
  slug: string;
  sermonDate: string;
  preacherName: string;
  additionalPreacherNames: string[];
  locales: Record<
    "es-AR" | "en-US",
    {
      title: string;
      content: Document | null;
      scriptureReferences: CorpusScriptureRef[];
    }
  >;
}

interface ProductionCorpus {
  documents: Array<{
    entryId: string;
    contentType: string;
    locale: "es-AR" | "en-US";
    embeddedAssets?: Record<string, { id: string }>;
  }>;
  sermons: CorpusSermon[];
}

const CORPUS_PATH = path.resolve(
  __dirname,
  "../__fixtures__/production-corpus.json",
);
const CORPUS: ProductionCorpus = JSON.parse(
  readFileSync(CORPUS_PATH, "utf8"),
) as ProductionCorpus;

function buildAssetMapForSermon(
  entryId: string,
  locale: "es-AR" | "en-US",
  prefix: string,
): Map<string, string> {
  const docEntry = CORPUS.documents.find(
    (d) =>
      d.contentType === "sermon" &&
      d.entryId === entryId &&
      d.locale === locale,
  );
  const map = new Map<string, string>();
  if (docEntry?.embeddedAssets) {
    for (const cfId of Object.keys(docEntry.embeddedAssets)) {
      map.set(cfId, `${prefix}${cfId}`);
    }
  }
  return map;
}

function toLegacySermon(
  sermon: CorpusSermon,
  locale: "es-AR" | "en-US",
): Sermon {
  const loc = sermon.locales[locale];
  return {
    title: loc.title,
    slug: sermon.slug,
    sermonDate: sermon.sermonDate,
    preacher: { name: sermon.preacherName, email: "" },
    additionalPreachers: sermon.additionalPreacherNames.map((name) => ({
      name,
      email: "",
    })),
    audioLanguages: ["es-AR"],
    scriptureReferences: loc.scriptureReferences,
    thesis: "",
    mainPoints: [],
    excerpt: "",
    content: loc.content
      ? { json: loc.content, links: { assets: { block: [] } } }
      : undefined,
    seoTitle: "",
    seoDescription: "",
    keywords: [],
    sys: { id: sermon.entryId },
  };
}

describe("Production sermon PDF block & contentHash parity (AC7)", () => {
  it("derives identical PDF content blocks from converted TipTap docs once embedded asset ids are mapped", () => {
    expect(CORPUS.sermons.length).toBeGreaterThanOrEqual(4);
    let sawEmbeddedSermon = false;

    for (const sermon of CORPUS.sermons) {
      for (const locale of ["es-AR", "en-US"] as const) {
        const rawDoc = sermon.locales[locale].content;
        expect(rawDoc).not.toBeNull();
        if (!rawDoc) continue;

        const assetIdMap = buildAssetMapForSermon(
          sermon.entryId,
          locale,
          "media-",
        );
        const converted = convertContentfulRichText(rawDoc, {
          profile: "sermon",
          documentId: `sermon:${sermon.slug}:${locale}`,
          assetIdMap,
        });
        expect(converted.ok).toBe(true);
        if (!converted.ok) continue;

        const legacyBlocks = richTextToContentBlocks(rawDoc).map((block) => {
          if (block.type === "embeddedAsset" && block.assetId) {
            sawEmbeddedSermon = true;
            return {
              ...block,
              assetId: assetIdMap.get(block.assetId) ?? block.assetId,
            };
          }
          return block;
        });

        const tipTapBlocks = tiptapToContentBlocks(converted.doc);
        expect(tipTapBlocks, `${sermon.slug}:${locale}`).toEqual(legacyBlocks);
      }
    }

    expect(sawEmbeddedSermon).toBe(true);
  });

  it("matches legacy computeSermonContentHash when asset ids are identity-mapped and reacts to every rendered field", () => {
    for (const sermon of CORPUS.sermons) {
      const esIdentityMap = buildAssetMapForSermon(sermon.entryId, "es-AR", "");
      const enIdentityMap = buildAssetMapForSermon(sermon.entryId, "en-US", "");

      const esConverted = convertContentfulRichText(
        sermon.locales["es-AR"].content,
        { profile: "sermon", assetIdMap: esIdentityMap },
      );
      const enConverted = convertContentfulRichText(
        sermon.locales["en-US"].content,
        { profile: "sermon", assetIdMap: enIdentityMap },
      );
      expect(esConverted.ok && enConverted.ok).toBe(true);
      if (!esConverted.ok || !enConverted.ok) continue;

      const legacyHash = computeSermonContentHash(
        toLegacySermon(sermon, "es-AR"),
        toLegacySermon(sermon, "en-US"),
      );

      const baseEs: TipTapSermonHashLocaleInput = {
        title: sermon.locales["es-AR"].title,
        sermonDate: sermon.sermonDate,
        content: esConverted.doc,
        scriptureReferences: sermon.locales["es-AR"].scriptureReferences,
        preacherName: sermon.preacherName,
        additionalPreacherNames: sermon.additionalPreacherNames,
      };
      const baseEn: TipTapSermonHashLocaleInput = {
        title: sermon.locales["en-US"].title,
        sermonDate: sermon.sermonDate,
        content: enConverted.doc,
        scriptureReferences: sermon.locales["en-US"].scriptureReferences,
        preacherName: sermon.preacherName,
        additionalPreacherNames: sermon.additionalPreacherNames,
      };

      const identityTipTapHash = computeTipTapSermonContentHash(baseEs, baseEn);
      expect(identityTipTapHash, `${sermon.slug} identity hash`).toBe(legacyHash);

      // Remapped embedded asset ids produce a new hash on embedded sermons
      if (esIdentityMap.size > 0) {
        const remappedEs = convertContentfulRichText(
          sermon.locales["es-AR"].content,
          {
            profile: "sermon",
            assetIdMap: buildAssetMapForSermon(
              sermon.entryId,
              "es-AR",
              "media-",
            ),
          },
        );
        expect(remappedEs.ok).toBe(true);
        if (remappedEs.ok) {
          expect(
            computeTipTapSermonContentHash(
              { ...baseEs, content: remappedEs.doc },
              baseEn,
            ),
          ).not.toBe(identityTipTapHash);
        }
      }

      // Changing every rendered field must change the hash
      expect(
        computeTipTapSermonContentHash(
          { ...baseEs, title: `${baseEs.title} (edited)` },
          baseEn,
        ),
      ).not.toBe(identityTipTapHash);
      expect(
        computeTipTapSermonContentHash(baseEs, {
          ...baseEn,
          title: `${baseEn.title} (edited)`,
        }),
      ).not.toBe(identityTipTapHash);
      expect(
        computeTipTapSermonContentHash(
          { ...baseEs, sermonDate: "2099-01-01" },
          { ...baseEn, sermonDate: "2099-01-01" },
        ),
      ).not.toBe(identityTipTapHash);
      expect(
        computeTipTapSermonContentHash(
          {
            ...baseEs,
            content: {
              type: "doc",
              content: [
                ...esConverted.doc.content,
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Extra paragraph" }],
                },
              ],
            },
          },
          baseEn,
        ),
      ).not.toBe(identityTipTapHash);
      expect(
        computeTipTapSermonContentHash(
          { ...baseEs, preacherName: `${baseEs.preacherName} Jr.` },
          baseEn,
        ),
      ).not.toBe(identityTipTapHash);
      expect(
        computeTipTapSermonContentHash(
          {
            ...baseEs,
            scriptureReferences: [
              ...(baseEs.scriptureReferences ?? []),
              {
                book: "Salmos",
                chapter: 1,
                fromVerse: 1,
                toVerse: null,
                verseContent: "Dichoso el hombre...",
              },
            ],
          },
          baseEn,
        ),
      ).not.toBe(identityTipTapHash);
    }
  });
});
