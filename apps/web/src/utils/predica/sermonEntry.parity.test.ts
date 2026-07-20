/**
 * PARITY TEST (ICR-149).
 *
 * apps/web is the Vercel Root Directory, so app code cannot import out of itself into
 * .claude/. The sermon-entry builder therefore exists twice: the canonical TypeScript
 * (sermonEntry.ts) and the .mjs twin the /predica publisher actually executes. A hand-mirrored
 * builder that silently drifts from its canon is an invisible-compounding bug — so the mirror is
 * bound here rather than by a "MUST mirror" comment (closes the ICR-147 stray observation).
 *
 * Each case runs the SAME sermon + links through BOTH impls; the twin's stdout JSON must deep-equal
 * the TS `fields`. Break either builder and this goes red.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  buildSermonEntryFields,
  type ResolvedLinks,
  type SermonDocument,
  type SermonLocaleContent,
} from "@src/utils/predica/sermonEntry";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// apps/web/src/utils/predica -> repo root is five levels up.
const REPO_ROOT = path.resolve(HERE, "../../../../..");
const TWIN = path.join(
  REPO_ROOT,
  ".claude/scripts/predica/build-sermon-entry.mjs",
);

/** Run the twin exactly as the publisher does: fields JSON on stdout. */
function runTwinEntry(sermon: SermonDocument, links: ResolvedLinks): unknown {
  const dir = mkdtempSync(path.join(os.tmpdir(), "sermon-parity-"));
  const sermonPath = path.join(dir, "sermon.json");
  const linksPath = path.join(dir, "links.json");
  writeFileSync(sermonPath, JSON.stringify(sermon));
  writeFileSync(linksPath, JSON.stringify(links));
  const res = spawnSync(
    "node",
    [TWIN, sermonPath, "--entry", "--links", linksPath],
    {
      encoding: "utf8",
    },
  );
  if (res.status !== 0)
    throw new Error(`twin exited ${res.status}: ${res.stderr}`);
  return JSON.parse(res.stdout);
}

const localeContent = (s: string): SermonLocaleContent => ({
  title: `Title ${s}`,
  thesis: `Thesis ${s}`,
  mainPoints: [`Point ${s}`],
  excerpt: `Excerpt ${s}`,
  seoTitle: `SEO ${s}`,
  seoDescription: `Desc ${s}`,
  keywords: [`kw-${s}`],
  content: [{ type: "p", text: `Body ${s}` }],
});

const baseSermon: SermonDocument = {
  slug: "el-perdon-de-jesus",
  sermonDate: "2026-06-07",
  preacher: "Doug Wagner",
  internalName: "Prédica · 2026-06-07 · Doug Wagner",
  durationSeconds: 1651,
  scriptureReferences: [
    {
      chapter: "18",
      fromVerse: "10",
      "es-AR": {
        book: "Juan",
        verseContent: "Entonces Simón Pedro…",
        bibleVersion: "NVI",
      },
      "en-US": {
        book: "John",
        verseContent: "Then Simon Peter…",
        bibleVersion: "NIV",
      },
    },
  ],
  locales: { "es-AR": localeContent("es"), "en-US": localeContent("en") },
};

const CASES: Array<{
  name: string;
  sermon: SermonDocument;
  links: ResolvedLinks;
}> = [
  {
    name: "interpreted sermon with a resolved interpreter link",
    sermon: {
      ...baseSermon,
      interpreted: true,
      interpreter: { name: "Jonathan Hanegan" },
    },
    links: {
      preacherId: "PRE1",
      interpreterId: "INT1",
      scriptureRefIds: ["BV1"],
      audioAssetId: "AUD1",
      featuredImageAssetId: "IMG1",
      pdfAssetIds: { "es-AR": "PDFES", "en-US": "PDFEN" },
    },
  },
  {
    name: "non-interpreted sermon (byte-identical baseline)",
    sermon: baseSermon,
    links: {
      preacherId: "PRE1",
      scriptureRefIds: ["BV1"],
      audioAssetId: "AUD1",
    },
  },
];

describe("build-sermon-entry.mjs is in fields-parity with sermonEntry.ts", () => {
  it.each(CASES)("$name", ({ sermon, links }) => {
    expect(runTwinEntry(sermon, links)).toEqual(
      buildSermonEntryFields(sermon, links),
    );
  });
});
