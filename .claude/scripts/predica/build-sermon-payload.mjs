#!/usr/bin/env node
/**
 * build-sermon-payload.mjs — Single canonical payload builder for the `/predica`
 * admin ingest pipeline (`ICR-204`).
 *
 * Turns a writer-produced `sermon.json` (+ optional uploaded media IDs from
 * `links.json`) into the exact TipTap v3 + draft-only payload accepted by
 * `POST /api/predica/sermons`. Directly schema-tested in `apps/admin` Vitest
 * against `@idcr/content` and `predicaIngestRequestSchema` (zero duplicated twin).
 *
 * Usage:
 *   node .claude/scripts/predica/build-sermon-payload.mjs <sermon.json>
 *     # validate + summary (dry-run; used by `pnpm predica:smoke`)
 *
 *   node .claude/scripts/predica/build-sermon-payload.mjs <sermon.json> \
 *     --payload [--links <links.json>] [--mode create|update] \
 *     [--doc-id <id> --expected-revision <n>] [--overwrite] \
 *     [--keep-featured] [--queue-pdf-rebuild]
 *     # print JSON payload for POST /api/predica/sermons
 *
 * Exit codes:
 *   0  success
 *   2  usage / input / schema error
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PREDICA_LOCALES = ["es-AR", "en-US"];
export const PREDICA_DEFAULT_LOCALE = "es-AR";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const POSITIVE_INT_STR_RE = /^\s*\d{1,4}\s*$/;

// ── TipTap v3 Rich Text Conversion ──────────────────────────────────────────

/** Collapses line breaks to a single space (no hardBreak node in TipTap schema). */
function cleanText(raw) {
  return String(raw ?? "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function paragraphNode(text) {
  const cleaned = cleanText(text);
  if (!cleaned) return null;
  return {
    type: "paragraph",
    content: [{ type: "text", text: cleaned }],
  };
}

function headingNode(level, text) {
  const cleaned = cleanText(text);
  if (!cleaned) return null;
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text: cleaned }],
  };
}

function blockquoteNode(text) {
  const p = paragraphNode(text);
  if (!p) return null;
  return {
    type: "blockquote",
    content: [p],
  };
}

function listNode(ordered, items) {
  const listItems = (items ?? [])
    .map((item) => paragraphNode(item))
    .filter(Boolean)
    .map((p) => ({
      type: "listItem",
      content: [p],
    }));

  if (listItems.length === 0) return null;

  return {
    type: ordered ? "orderedList" : "bulletList",
    content: listItems,
  };
}

function embeddedMediaNode(mediaId) {
  const id = String(mediaId ?? "").trim();
  if (!id) return null;
  return {
    type: "embeddedMedia",
    attrs: { mediaId: id },
  };
}

function blockToTipTapNode(block) {
  if (!block || typeof block !== "object") return null;
  switch (block.type) {
    case "h2":
      return headingNode(2, block.text);
    case "h3":
      return headingNode(3, block.text);
    case "p":
      return paragraphNode(block.text);
    case "blockquote":
      return blockquoteNode(block.text);
    case "ul":
      return listNode(false, block.items);
    case "ol":
      return listNode(true, block.items);
    case "embeddedAsset":
    case "embeddedMedia":
      return embeddedMediaNode(block.mediaId ?? block.assetId);
    default:
      return paragraphNode(block.text);
  }
}

/**
 * Converts `sermon.json` content blocks into a canonical TipTap v3 `RichTextDoc`
 * conforming to `@idcr/content`'s `RICH_TEXT_SCHEMAS.sermon`.
 */
export function blocksToTipTapDoc(blocks) {
  const content = (blocks ?? []).map(blockToTipTapNode).filter(Boolean);
  return {
    type: "doc",
    content,
  };
}

// ── Natural Key Helper (mirrors @idcr/content bibleVerseKey) ────────────────

function normalizeKeyPart(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .split(/\s+/)
    .join(" ")
    .toLowerCase();
}

function parsePositiveInt(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 1 ? value : null;
  }
  if (typeof value === "string" && POSITIVE_INT_STR_RE.test(value)) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : null;
  }
  return null;
}

/**
 * Deterministic version-scoped natural key for a scripture reference:
 * `<book_es>|<chapter>|<fromVerse>|<toVerse>|<version_es>` (lowercased/NFC).
 */
export function buildBibleVerseNaturalKey(ref) {
  const book = normalizeKeyPart(ref?.["es-AR"]?.book);
  const version = normalizeKeyPart(ref?.["es-AR"]?.bibleVersion);
  const chapter = parsePositiveInt(ref?.chapter);
  const fromVerse = parsePositiveInt(ref?.fromVerse);
  const hasTo =
    ref?.toVerse !== undefined &&
    ref?.toVerse !== null &&
    String(ref.toVerse).trim() !== "";
  const toVerse = hasTo ? parsePositiveInt(ref.toVerse) : fromVerse;
  if (!book || !version || chapter === null || fromVerse === null || toVerse === null) {
    throw new RangeError("Invalid scripture reference for natural key");
  }
  return `${book}|${chapter}|${fromVerse}|${toVerse}|${version}`;
}

// ── Validation ──────────────────────────────────────────────────────────────

function validateLocaleBlock(ld, loc, errs) {
  if (!ld || typeof ld !== "object" || Array.isArray(ld)) {
    errs.push(`locales.${loc}: required object`);
    return;
  }
  for (const f of ["title", "thesis", "excerpt", "seoTitle", "seoDescription"]) {
    if (typeof ld[f] !== "string" || !ld[f].trim()) {
      errs.push(`locales.${loc}.${f}: required non-empty string`);
    }
  }
  if (typeof ld.seoTitle === "string" && ld.seoTitle.length > 60) {
    errs.push(`locales.${loc}.seoTitle: must be <= 60 chars`);
  }
  if (!Array.isArray(ld.mainPoints) || ld.mainPoints.length === 0) {
    errs.push(`locales.${loc}.mainPoints: required non-empty array`);
  }
  if (!Array.isArray(ld.keywords) || ld.keywords.length === 0) {
    errs.push(`locales.${loc}.keywords: required non-empty array`);
  }
  if (!Array.isArray(ld.content)) {
    errs.push(`locales.${loc}.content: required array of blocks`);
  }
}

/**
 * Validates `sermon.json` before ingest. Spanish (`es-AR`) is required; English
 * (`en-US`) is optional on drafts (Edge Case #9), but validated when present.
 * Returns an array of error strings (empty = valid).
 */
export function validateSermonJson(raw) {
  const errs = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return ["Root must be a JSON object."];
  }
  const s = raw;

  if (typeof s.slug !== "string" || s.slug.length > 120 || !SLUG_RE.test(s.slug)) {
    errs.push("slug: required kebab-case string matching ^[a-z0-9]+(?:-[a-z0-9]+)*$");
  }
  if (typeof s.sermonDate !== "string" || !ISO_DATE_RE.test(s.sermonDate)) {
    errs.push("sermonDate: required YYYY-MM-DD string");
  }
  if (typeof s.preacher !== "string" || !s.preacher.trim()) {
    errs.push("preacher: required non-empty string");
  }
  if (s.preacherEmail != null && typeof s.preacherEmail !== "string") {
    errs.push("preacherEmail: must be a string when present");
  }

  if (s.additionalPreachers != null) {
    if (!Array.isArray(s.additionalPreachers)) {
      errs.push("additionalPreachers: must be an array when present");
    } else {
      s.additionalPreachers.forEach((p, i) => {
        if (!p || typeof p !== "object" || typeof p.name !== "string" || !p.name.trim()) {
          errs.push(`additionalPreachers[${i}].name: required non-empty string`);
        }
        if (p && p.email != null && typeof p.email !== "string") {
          errs.push(`additionalPreachers[${i}].email: must be a string when present`);
        }
      });
    }
  }

  // Interpreted-sermon provenance (ICR-147 / ICR-149 — mirrors check-voice-learn.mjs)
  if (s.interpreted != null && typeof s.interpreted !== "boolean") {
    errs.push("interpreted: must be a boolean when present");
  }
  if (s.interpreter != null) {
    if (
      typeof s.interpreter !== "object" ||
      Array.isArray(s.interpreter) ||
      typeof s.interpreter.name !== "string" ||
      !s.interpreter.name.trim()
    ) {
      errs.push("interpreter: must be an object with a non-empty name when present");
    }
    if (
      s.interpreter.email != null &&
      (typeof s.interpreter.email !== "string" || !s.interpreter.email.trim())
    ) {
      errs.push("interpreter.email: must be a non-empty string when present");
    }
  }
  if (
    s.interpreted === true &&
    (s.interpreter == null || !s.interpreter?.name?.trim?.())
  ) {
    errs.push("interpreter.name: required non-empty string when interpreted is true");
  }
  if (s.interpreter?.name?.trim?.() && s.interpreted !== true) {
    errs.push(
      'interpreter present but interpreted is not true — add "interpreted": true (a named interpreter requires the flag).',
    );
  }

  if (
    s.durationSeconds != null &&
    (typeof s.durationSeconds !== "number" ||
      !Number.isFinite(s.durationSeconds) ||
      s.durationSeconds < 0)
  ) {
    errs.push("durationSeconds: must be a non-negative finite number when present");
  }

  if (s.scriptureReferences != null) {
    if (!Array.isArray(s.scriptureReferences)) {
      errs.push("scriptureReferences: must be an array when present");
    } else {
      s.scriptureReferences.forEach((r, i) => {
        const chapter = parsePositiveInt(r?.chapter);
        const fromVerse = parsePositiveInt(r?.fromVerse);
        if (chapter === null) {
          errs.push(`scriptureReferences[${i}].chapter: required positive integer`);
        }
        if (fromVerse === null) {
          errs.push(`scriptureReferences[${i}].fromVerse: required positive integer`);
        }
        if (r?.toVerse != null && String(r.toVerse).trim() !== "") {
          const toVerse = parsePositiveInt(r.toVerse);
          if (toVerse === null) {
            errs.push(`scriptureReferences[${i}].toVerse: must be a positive integer`);
          } else if (fromVerse !== null && toVerse < fromVerse) {
            errs.push(`scriptureReferences[${i}].toVerse: must be >= fromVerse`);
          }
        }
        const es = r?.["es-AR"];
        if (!es || typeof es !== "object") {
          errs.push(`scriptureReferences[${i}].es-AR: required object`);
        } else {
          for (const f of ["book", "verseContent", "bibleVersion"]) {
            if (typeof es[f] !== "string" || !es[f].trim()) {
              errs.push(`scriptureReferences[${i}].es-AR.${f}: required non-empty string`);
            }
          }
        }
        const en = r?.["en-US"];
        if (en != null) {
          if (typeof en !== "object") {
            errs.push(`scriptureReferences[${i}].en-US: must be an object when present`);
          } else {
            for (const f of ["book", "verseContent", "bibleVersion"]) {
              if (en[f] != null && typeof en[f] !== "string") {
                errs.push(`scriptureReferences[${i}].en-US.${f}: must be a string`);
              }
            }
          }
        }
      });
    }
  }

  if (!s.locales || typeof s.locales !== "object" || Array.isArray(s.locales)) {
    errs.push("locales: required object");
    return errs;
  }

  // Spanish is mandatory; English is optional on drafts (Edge Case #9)
  validateLocaleBlock(s.locales["es-AR"], "es-AR", errs);
  if (s.locales["en-US"] != null) {
    validateLocaleBlock(s.locales["en-US"], "en-US", errs);
  }

  return errs;
}

// ── Payload Builder ─────────────────────────────────────────────────────────

function buildLocalizedString(esVal, enVal) {
  const es = String(esVal ?? "").trim();
  const en = typeof enVal === "string" ? enVal.trim() : "";
  return {
    "es-AR": es,
    ...(en ? { "en-US": en } : {}),
  };
}

function buildLocalizedStringList(esList, enList) {
  const es = (esList ?? []).map((x) => String(x).trim()).filter(Boolean);
  const en = (enList ?? []).map((x) => String(x).trim()).filter(Boolean);
  return {
    "es-AR": es,
    ...(en.length > 0 ? { "en-US": en } : {}),
  };
}

function buildScripturePayload(ref) {
  const chapter = parsePositiveInt(ref.chapter);
  const fromVerse = parsePositiveInt(ref.fromVerse);
  const hasTo =
    ref.toVerse !== undefined &&
    ref.toVerse !== null &&
    String(ref.toVerse).trim() !== "";
  const toVerse = hasTo ? parsePositiveInt(ref.toVerse) : undefined;
  const es = ref["es-AR"];
  const en = ref["en-US"];

  return {
    book: buildLocalizedString(es.book, en?.book),
    chapter,
    fromVerse,
    ...(toVerse !== undefined ? { toVerse } : {}),
    text: buildLocalizedString(es.verseContent, en?.verseContent),
    version: buildLocalizedString(es.bibleVersion, en?.bibleVersion),
  };
}

/**
 * Builds the exact JSON request body for `POST /api/predica/sermons`.
 */
export function buildPredicaIngestPayload(sermon, links = {}, options = {}) {
  const mode = options.mode ?? "create";
  const es = sermon.locales["es-AR"];
  const en = sermon.locales["en-US"];

  const content = {
    "es-AR": blocksToTipTapDoc(es.content),
    ...(en?.content ? { "en-US": blocksToTipTapDoc(en.content) } : {}),
  };

  const sermonPayload = {
    slug: options.slug ?? sermon.slug,
    sermonDate: sermon.sermonDate,
    ...(typeof sermon.durationSeconds === "number"
      ? { durationSeconds: sermon.durationSeconds }
      : {}),
    audioLanguages: sermon.interpreted ? ["es-AR", "en-US"] : ["es-AR"],
    title: buildLocalizedString(es.title, en?.title),
    thesis: buildLocalizedString(es.thesis, en?.thesis),
    mainPoints: buildLocalizedStringList(es.mainPoints, en?.mainPoints),
    excerpt: buildLocalizedString(es.excerpt, en?.excerpt),
    content,
    seoTitle: buildLocalizedString(es.seoTitle, en?.seoTitle),
    seoDescription: buildLocalizedString(es.seoDescription, en?.seoDescription),
    keywords: buildLocalizedStringList(es.keywords, en?.keywords),
  };

  const preacher = {
    name: sermon.preacher.trim(),
    ...(sermon.preacherEmail?.trim() ? { email: sermon.preacherEmail.trim() } : {}),
  };

  const additionalPreachers = Array.isArray(sermon.additionalPreachers)
    ? sermon.additionalPreachers.map((p) => ({
        name: p.name.trim(),
        ...(p.email?.trim() ? { email: p.email.trim() } : {}),
      }))
    : undefined;

  const interpreter =
    sermon.interpreted && sermon.interpreter?.name?.trim()
      ? {
          name: sermon.interpreter.name.trim(),
          ...(sermon.interpreter.email?.trim()
            ? { email: sermon.interpreter.email.trim() }
            : {}),
        }
      : undefined;

  const scriptureReferences = Array.isArray(sermon.scriptureReferences)
    ? sermon.scriptureReferences.map(buildScripturePayload)
    : undefined;

  const media = {};
  if (links.audioMediaId) media.audioMediaId = links.audioMediaId;
  if (links.featuredImageId && !options.keepExistingFeaturedImage) {
    media.featuredImageId = links.featuredImageId;
  }
  const pdfIds = links.pdfSummaryMediaId ?? {};
  if (pdfIds["es-AR"]) {
    media.pdfSummaryMediaId = {
      "es-AR": pdfIds["es-AR"],
      ...(pdfIds["en-US"] ? { "en-US": pdfIds["en-US"] } : {}),
    };
  }

  return {
    mode,
    ...(mode === "update" && options.docId ? { docId: options.docId } : {}),
    ...(mode === "update" && options.expectedRevision !== undefined
      ? { expectedRevision: options.expectedRevision }
      : {}),
    ...(options.overwrite ? { overwrite: true } : {}),
    ...(options.keepExistingFeaturedImage
      ? { keepExistingFeaturedImage: true }
      : {}),
    ...(options.queuePdfRebuild ? { queuePdfRebuild: true } : {}),
    sermon: sermonPayload,
    preacher,
    ...(additionalPreachers && additionalPreachers.length > 0
      ? { additionalPreachers }
      : {}),
    ...(interpreter ? { interpreter } : {}),
    ...(scriptureReferences && scriptureReferences.length > 0
      ? { scriptureReferences }
      : {}),
    ...(Object.keys(media).length > 0 ? { media } : {}),
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function usage() {
  process.stderr.write(
    [
      "usage:",
      "  node .claude/scripts/predica/build-sermon-payload.mjs <sermon.json>",
      "  node .claude/scripts/predica/build-sermon-payload.mjs <sermon.json> --payload [--links <links.json>] [--mode create|update] [--doc-id <id> --expected-revision <n>] [--overwrite] [--keep-featured] [--queue-pdf-rebuild]",
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

async function readJson(filePath) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch (e) {
    die(2, `error: cannot read ${filePath}: ${e.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    die(2, `error: ${filePath} is not valid JSON: ${e.message}`);
  }
}

function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  if (!val || val.startsWith("--")) {
    die(2, `error: ${flag} requires a value`);
  }
  return val;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") {
    usage();
    process.exit(args.length === 0 ? 2 : 0);
  }

  const jsonPath = args[0];
  if (jsonPath.startsWith("--")) {
    die(2, "error: first argument must be the sermon.json path");
  }

  const sermon = await readJson(jsonPath);
  const errs = validateSermonJson(sermon);
  if (errs.length > 0) {
    die(2, "sermon.json schema errors:\n  - " + errs.join("\n  - "));
  }

  if (args.includes("--payload")) {
    const linksPath = getFlagValue(args, "--links");
    const links = linksPath ? await readJson(linksPath) : {};
    const mode = getFlagValue(args, "--mode") ?? "create";
    if (mode !== "create" && mode !== "update") {
      die(2, `error: --mode must be 'create' or 'update', got '${mode}'`);
    }
    const docId = getFlagValue(args, "--doc-id");
    const rawRev = getFlagValue(args, "--expected-revision");
    const expectedRevision = rawRev !== undefined ? Number(rawRev) : undefined;
    if (
      rawRev !== undefined &&
      (!Number.isInteger(expectedRevision) || expectedRevision < 1)
    ) {
      die(2, `error: --expected-revision must be a positive integer, got '${rawRev}'`);
    }
    const slugOverride = getFlagValue(args, "--slug");
    if (slugOverride !== undefined && !SLUG_RE.test(slugOverride)) {
      die(2, `error: --slug '${slugOverride}' must be kebab-case`);
    }

    const payload = buildPredicaIngestPayload(sermon, links, {
      mode,
      docId,
      expectedRevision,
      slug: slugOverride,
      overwrite: args.includes("--overwrite"),
      keepExistingFeaturedImage: args.includes("--keep-featured"),
      queuePdfRebuild: args.includes("--queue-pdf-rebuild"),
    });
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    return;
  }

  // Default: validation summary (used by --dry-run and `pnpm predica:smoke`)
  const refs = Array.isArray(sermon.scriptureReferences)
    ? sermon.scriptureReferences
    : [];
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
    if (!ld) {
      lines.push(`  [${loc}] (absent — Spanish fallback will be used until translated)`);
      continue;
    }
    lines.push(
      `  [${loc}] title="${ld.title}" · mainPoints=${ld.mainPoints.length} · content blocks=${Array.isArray(ld.content) ? ld.content.length : 0} · seoTitle=${ld.seoTitle.length}c`,
    );
  }
  process.stdout.write(lines.join("\n") + "\n");
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((e) => die(2, `error: ${e?.stack ?? e}`));
}
