#!/usr/bin/env node
/**
 * build-sermon-entry.mjs — Deterministic Contentful CMA payload builder for the
 * predica-publisher. Turns a writer-produced sermon.json into the exact `fields`
 * objects that create_entry needs, so the publisher never hand-authors Rich Text
 * or locale-wrapping (both error-prone).
 *
 * The pure functions below are a JS-equivalent twin of the canonical, Vitest-
 * tested TypeScript at src/utils/predica/sermonEntry.ts — keep the two in sync.
 * Duplicated here so this file runs directly under Node ESM with no build step
 * (mirrors build-predica-pdf.mjs).
 *
 * Each bibleVerse `internalName` is DERIVED from the passage + version
 * (`buildBibleVerseInternalName`), never the per-sermon slug, so identical passages
 * share one entry (the publisher upserts on this key). See docs/predica-bibleverse-reuse.md.
 *
 * Usage:
 *   node .claude/scripts/predica/build-sermon-entry.mjs <sermon.json>                 # validate + summary (dry-run)
 *   node .claude/scripts/predica/build-sermon-entry.mjs <sermon.json> --bible         # → JSON array of bibleVerse {internalName, fields}
 *   node .claude/scripts/predica/build-sermon-entry.mjs <sermon.json> --entry --links <links.json> [--slug <override>]   # → sermon `fields` JSON
 *
 * links.json shape (all ids resolved by the publisher first):
 *   { "preacherId": "...", "scriptureRefIds": ["..."],
 *     "pdfAssetIds": { "es-AR": "...", "en-US": "..." },
 *     "audioAssetId": "...", "featuredImageAssetId": "..." }
 *
 * Exit codes:
 *   0  success (payload printed to stdout)
 *   2  usage / input error (bad args, unreadable/invalid JSON, schema violation)
 */

import { readFile } from "node:fs/promises";

// ── Locales ─────────────────────────────────────────────────────────────────

const PREDICA_LOCALES = ["es-AR", "en-US"];
const PREDICA_DEFAULT_LOCALE = "es-AR";

// ── Rich text builders (mirror src/utils/predica/sermonEntry.ts) ─────────────

const textNode = (value) => ({ nodeType: "text", value, marks: [], data: {} });
const paragraph = (value) => ({ nodeType: "paragraph", data: {}, content: [textNode(value)] });
const heading = (level, value) => ({ nodeType: `heading-${level}`, data: {}, content: [textNode(value)] });
const blockquote = (value) => ({ nodeType: "blockquote", data: {}, content: [paragraph(value)] });
const listItem = (value) => ({ nodeType: "list-item", data: {}, content: [paragraph(value)] });
const list = (ordered, items) => ({
  nodeType: ordered ? "ordered-list" : "unordered-list",
  data: {},
  content: items.map(listItem),
});

// embedded-asset-block referencing an already-uploaded Contentful Asset (audio/pdf/image).
const embeddedAsset = (assetId) => ({
  nodeType: "embedded-asset-block",
  data: { target: { sys: { type: "Link", linkType: "Asset", id: assetId } } },
  content: [],
});

const blockToNode = (block) => {
  switch (block.type) {
    case "h2":
      return heading(2, block.text ?? "");
    case "h3":
      return heading(3, block.text ?? "");
    case "p":
      return paragraph(block.text ?? "");
    case "blockquote":
      return blockquote(block.text ?? "");
    case "ul":
      return list(false, block.items ?? []);
    case "ol":
      return list(true, block.items ?? []);
    case "embeddedAsset":
      return embeddedAsset(block.assetId ?? "");
    default:
      return paragraph(block.text ?? "");
  }
};

export function blocksToRichTextDocument(blocks) {
  return { nodeType: "document", data: {}, content: (blocks ?? []).map(blockToNode) };
}

// ── Entry field builders (mirror src/utils/predica/sermonEntry.ts) ───────────

const entryLink = (id) => ({ sys: { type: "Link", linkType: "Entry", id } });
const assetLink = (id) => ({ sys: { type: "Link", linkType: "Asset", id } });
const atDefault = (value) => ({ [PREDICA_DEFAULT_LOCALE]: value });

function localizedFrom(sermon, getter) {
  const field = {};
  for (const locale of PREDICA_LOCALES) field[locale] = getter(sermon.locales[locale]);
  return field;
}

// Canonical, deterministic dedup key — mirrors src/utils/predica/sermonEntry.ts.
// "<book es> <chapter>:<fromVerse>[-<toVerse>] (<bibleVersion es>)" e.g. "Joel 2:13 (NVI)".
export function buildBibleVerseInternalName(ref) {
  const verses = ref.toVerse ? `${ref.fromVerse}-${ref.toVerse}` : ref.fromVerse;
  return `${ref["es-AR"].book} ${ref.chapter}:${verses} (${ref["es-AR"].bibleVersion})`;
}

export function buildBibleVerseFields(ref) {
  const fields = {
    internalName: atDefault(buildBibleVerseInternalName(ref)),
    chapter: atDefault(ref.chapter),
    fromVerse: atDefault(ref.fromVerse),
    book: { "es-AR": ref["es-AR"].book, "en-US": ref["en-US"].book },
    verseContent: { "es-AR": ref["es-AR"].verseContent, "en-US": ref["en-US"].verseContent },
    bibleVersion: { "es-AR": ref["es-AR"].bibleVersion, "en-US": ref["en-US"].bibleVersion },
  };
  if (ref.toVerse) fields.toVerse = atDefault(ref.toVerse);
  return fields;
}

export function buildSermonEntryFields(sermon, links, options = {}) {
  const fields = {};

  fields.internalName = atDefault(sermon.internalName);
  fields.slug = atDefault(options.slug ?? sermon.slug);
  fields.sermonDate = atDefault(sermon.sermonDate);
  if (typeof sermon.durationSeconds === "number") fields.durationSeconds = atDefault(sermon.durationSeconds);
  fields.preacher = atDefault(entryLink(links.preacherId));
  if (links.additionalPreacherIds?.length)
    fields.additionalPreachers = atDefault(links.additionalPreacherIds.map(entryLink));
  if (links.scriptureRefIds?.length) fields.scriptureReferences = atDefault(links.scriptureRefIds.map(entryLink));
  if (links.featuredImageAssetId) fields.featuredImage = atDefault(assetLink(links.featuredImageAssetId));
  if (links.audioAssetId) fields.audio = atDefault(assetLink(links.audioAssetId));

  fields.title = localizedFrom(sermon, (l) => l.title);
  fields.thesis = localizedFrom(sermon, (l) => l.thesis);
  fields.mainPoints = localizedFrom(sermon, (l) => l.mainPoints);
  fields.excerpt = localizedFrom(sermon, (l) => l.excerpt);
  fields.seoTitle = localizedFrom(sermon, (l) => l.seoTitle);
  fields.seoDescription = localizedFrom(sermon, (l) => l.seoDescription);
  fields.keywords = localizedFrom(sermon, (l) => l.keywords);
  fields.content = localizedFrom(sermon, (l) => blocksToRichTextDocument(l.content));

  const pdfIds = links.pdfAssetIds ?? {};
  const pdfField = {};
  for (const locale of PREDICA_LOCALES) {
    if (pdfIds[locale]) pdfField[locale] = assetLink(pdfIds[locale]);
  }
  if (Object.keys(pdfField).length > 0) fields.pdfSummary = pdfField;

  return fields;
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate the publisher-facing fields of sermon.json (a superset of what the PDF
 * generator requires). Returns an array of error strings; empty = valid.
 */
export function validateSermonForEntry(raw) {
  const errs = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return ["Root must be a JSON object."];
  const s = raw;

  if (typeof s.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.slug))
    errs.push("slug: required kebab-case string matching ^[a-z0-9]+(?:-[a-z0-9]+)*$");
  if (typeof s.sermonDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.sermonDate))
    errs.push("sermonDate: required YYYY-MM-DD string");
  if (typeof s.preacher !== "string" || !s.preacher.trim()) errs.push("preacher: required string");
  if (typeof s.internalName !== "string" || !s.internalName.trim()) errs.push("internalName: required string");
  if (s.durationSeconds != null && typeof s.durationSeconds !== "number")
    errs.push("durationSeconds: must be a number when present");

  if (Array.isArray(s.scriptureReferences)) {
    s.scriptureReferences.forEach((r, i) => {
      // internalName is DERIVED (buildBibleVerseInternalName), so it is optional here;
      // a stray value from an older sermon.json is tolerated and ignored.
      if (r?.internalName != null && typeof r.internalName !== "string")
        errs.push(`scriptureReferences[${i}].internalName: must be a string when present`);
      if (typeof r?.chapter !== "string") errs.push(`scriptureReferences[${i}].chapter: required string`);
      if (typeof r?.fromVerse !== "string") errs.push(`scriptureReferences[${i}].fromVerse: required string`);
      for (const loc of PREDICA_LOCALES) {
        const lv = r?.[loc];
        if (!lv || typeof lv !== "object") {
          errs.push(`scriptureReferences[${i}].${loc}: required object`);
          continue;
        }
        for (const f of ["book", "verseContent", "bibleVersion"]) {
          if (typeof lv[f] !== "string" || !lv[f].trim())
            errs.push(`scriptureReferences[${i}].${loc}.${f}: required non-empty string`);
        }
      }
    });
  }

  if (!s.locales || typeof s.locales !== "object") {
    errs.push("locales: required object");
    return errs;
  }
  for (const loc of PREDICA_LOCALES) {
    const ld = s.locales[loc];
    if (!ld || typeof ld !== "object") {
      errs.push(`locales.${loc}: required object`);
      continue;
    }
    for (const f of ["title", "thesis", "excerpt", "seoTitle", "seoDescription"]) {
      if (typeof ld[f] !== "string" || !ld[f].trim())
        errs.push(`locales.${loc}.${f}: required non-empty string`);
    }
    if (typeof ld.seoTitle === "string" && ld.seoTitle.length > 60)
      errs.push(`locales.${loc}.seoTitle: must be <= 60 chars (Contentful validation)`);
    if (!Array.isArray(ld.mainPoints) || ld.mainPoints.length === 0)
      errs.push(`locales.${loc}.mainPoints: required non-empty array`);
    if (!Array.isArray(ld.keywords) || ld.keywords.length === 0)
      errs.push(`locales.${loc}.keywords: required non-empty array`);
    if (!Array.isArray(ld.content))
      errs.push(`locales.${loc}.content: required array of blocks`);
  }

  return errs;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function usage() {
  process.stderr.write(
    [
      "usage:",
      "  node .claude/scripts/predica/build-sermon-entry.mjs <sermon.json>                 validate + summary",
      "  node .claude/scripts/predica/build-sermon-entry.mjs <sermon.json> --bible         print bibleVerse field payloads",
      "  node .claude/scripts/predica/build-sermon-entry.mjs <sermon.json> --entry --links <links.json> [--slug <override>]   print sermon fields",
      "",
      "Exit codes: 0 success · 2 usage/input/schema error",
      "",
    ].join("\n"),
  );
}

function die(code, msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

async function readJson(p) {
  let text;
  try {
    text = await readFile(p, "utf8");
  } catch (e) {
    die(2, `error: cannot read ${p}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    die(2, `error: ${p} is not valid JSON: ${e.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    usage();
    process.exit(args.length === 0 ? 2 : 0);
  }

  const jsonPath = args[0];
  if (jsonPath.startsWith("--")) die(2, "error: first argument must be the sermon.json path");

  const sermon = await readJson(jsonPath);
  const errs = validateSermonForEntry(sermon);
  if (errs.length) die(2, "sermon.json schema errors:\n  - " + errs.join("\n  - "));

  const wantBible = args.includes("--bible");
  const wantEntry = args.includes("--entry");

  if (wantBible) {
    const refs = Array.isArray(sermon.scriptureReferences) ? sermon.scriptureReferences : [];
    // internalName is the DERIVED dedup/upsert key — never the writer's (now ignored) value.
    const out = refs.map((ref) => ({
      internalName: buildBibleVerseInternalName(ref),
      fields: buildBibleVerseFields(ref),
    }));
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return;
  }

  if (wantEntry) {
    const li = args.indexOf("--links");
    if (li === -1 || !args[li + 1]) die(2, "error: --entry requires --links <links.json>");
    const links = await readJson(args[li + 1]);
    if (typeof links?.preacherId !== "string") die(2, "error: links.json must include a preacherId string");
    // Optional --slug override: applied by the publisher when a slug collision
    // bumped the canonical slug, so the entry slug matches the WhatsApp URL.
    const si = args.indexOf("--slug");
    const slugOverride = si !== -1 ? args[si + 1] : undefined;
    if (slugOverride !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugOverride)) {
      die(2, `error: --slug '${slugOverride}' must match ^[a-z0-9]+(?:-[a-z0-9]+)*$`);
    }
    process.stdout.write(
      JSON.stringify(buildSermonEntryFields(sermon, links, { slug: slugOverride }), null, 2) + "\n",
    );
    return;
  }

  // Default: validation summary (used by --dry-run).
  const refs = Array.isArray(sermon.scriptureReferences) ? sermon.scriptureReferences : [];
  const lines = [
    "sermon.json: VALID ✓",
    `  slug:            ${sermon.slug}`,
    `  sermonDate:      ${sermon.sermonDate}`,
    `  preacher:        ${sermon.preacher}`,
    `  durationSeconds: ${sermon.durationSeconds ?? "(unset)"}`,
    `  scriptureRefs:   ${refs.length}`,
  ];
  for (const loc of PREDICA_LOCALES) {
    const ld = sermon.locales[loc];
    lines.push(
      `  [${loc}] title="${ld.title}" · mainPoints=${ld.mainPoints.length} · content blocks=${Array.isArray(ld.content) ? ld.content.length : 0} · seoTitle=${ld.seoTitle.length}c`,
    );
  }
  process.stdout.write(lines.join("\n") + "\n");
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main().catch((e) => die(2, `error: ${e?.stack ?? e}`));
}
