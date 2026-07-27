#!/usr/bin/env node
// Gate for the ICR-18 design-system artifacts. Machine-enforces the quality bar from
// tasks/specs/admin-design-prompt.md §B and the light+dark requirement from the spec.
// Usage: node verify-artifacts.mjs [--only <substring>]
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;

// Artifacts that legitimately have NO dark variant (print medium, spec R6).
const PRINT_ONLY = new Set(["screens/calendar-print-a4.html"]);

const BANNED = [
  {
    re: /linear-gradient|radial-gradient/i,
    why: "gradient wash (quality bar bans it)",
  },
  {
    re: /font-family:[^;]*\b(Inter|Roboto)\b/i,
    why: "banned typeface Inter/Roboto",
  },
  {
    re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u,
    why: "emoji (the brand does not use them)",
  },
];

function walk(dir, exts = [".html"]) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) out.push(...walk(abs, exts));
    else if (exts.includes(extname(abs))) out.push(abs);
  }
  return out;
}

// ===== CSS geometry check: every interactive control must reach the ≥44px
// hit-target floor (spec quality bar). Two consecutive review rounds each
// missed one instance (round 1: widths, round 2: heights) because the
// baseline selector list was enumerated by hand — this makes it mechanical.
// Regex-based block split — this is our own hand-written stylesheet, not
// arbitrary CSS (no @media/nesting), so a full CSS parser would be overkill.
function parseCssBlocks(css) {
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, ""); // strip comments first
  const blocks = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(flat))) {
    blocks.push({ selectorList: m[1].trim(), body: m[2] });
  }
  return blocks;
}

// A bare `input` tag selector (not a `.input` class, not an attribute-narrowed
// checkbox/radio glyph whose hit area is provided by its wrapping label, e.g.
// `.checkbox input[type="checkbox"]`) is a real text-like control and needs
// the same floor even with no cursor:pointer — native text inputs render a
// text cursor, not a pointer, so cursor:pointer alone would miss them.
function isBareInputSelector(sel) {
  return (
    /(^|[\s>+~])input(?![\w-])/i.test(sel) &&
    !/type=["'](checkbox|radio)["']/i.test(sel)
  );
}

function hasBeforeHalo(sel, blocks) {
  const target = `${sel}::before`;
  return blocks.some(({ selectorList }) =>
    selectorList
      .split(",")
      .map((s) => s.trim())
      .includes(target),
  );
}

function checkHitTargets(css) {
  const blocks = parseCssBlocks(css);
  const problems = [];
  for (const { selectorList, body } of blocks) {
    const selectors = selectorList.split(",").map((s) => s.trim());
    const bodyHasPointer = /cursor:\s*pointer\b/i.test(body);
    const interactive = bodyHasPointer
      ? selectors
      : selectors.filter(isBareInputSelector);
    if (interactive.length === 0) continue;

    const minHeightMatch = body.match(/min-height:\s*([\d.]+)px/i);
    const heightMatch = body.match(/(?<!min-)height:\s*([\d.]+)px/i);
    if (!minHeightMatch && !heightMatch) continue; // no explicit floor here

    const minHeight = minHeightMatch ? parseFloat(minHeightMatch[1]) : 0;
    const height = heightMatch ? parseFloat(heightMatch[1]) : 0;
    if (Math.max(minHeight, height) >= 44) continue;

    const declared = [
      heightMatch ? `height:${heightMatch[1]}px` : null,
      minHeightMatch ? `min-height:${minHeightMatch[1]}px` : null,
    ]
      .filter(Boolean)
      .join(", ");

    for (const sel of interactive) {
      // Sanctioned compact-control pattern (.btn-sm, .icon-btn, .kebab,
      // .pager button): a visually smaller box, with an invisible ::before
      // halo restoring the ≥44px pointer target.
      if (hasBeforeHalo(sel, blocks)) continue;
      const reason = bodyHasPointer
        ? "cursor:pointer and no ::before halo"
        : "a bare <input> and no ::before halo";
      problems.push(
        `${sel} declares ${declared} with ${reason} (>=44px hit target)`,
      );
    }
  }
  return problems;
}

// The fonts are declared ONCE, in the shared stylesheet — not in every artifact.
// Asserting them per-HTML would force every artifact to embed a decorative
// font-family purely to satisfy the gate. Assert them where they actually live,
// and run the BANNED list over the stylesheet too — otherwise a gradient added
// to styles.css (the likeliest place) bypasses the whole quality gate.
function checkStyles() {
  const src = readFileSync(join(ROOT, "styles.css"), "utf8");
  if (src.trim().length === 0) return ["styles.css: EMPTY file"];
  const problems = [];
  if (!/"Outfit"/.test(src)) problems.push('missing "Outfit" font-family');
  if (!/"Playfair Display"/.test(src))
    problems.push('missing "Playfair Display" font-family');
  for (const { re, why } of BANNED) if (re.test(src)) problems.push(why);
  problems.push(...checkHitTargets(src));
  return problems.map((p) => `styles.css: ${p}`);
}

function checkHtml(abs) {
  const rel = relative(ROOT, abs);
  const src = readFileSync(abs, "utf8");
  const problems = [];

  // A negative assertion must first prove it observed something (lesson ICR-144).
  if (src.trim().length === 0) return [`${rel}: EMPTY file`];

  // Linking the shared stylesheet IS an artifact's font contract.
  if (!/<link[^>]+href=["'][^"']*styles\.css/.test(src))
    problems.push("does not link the shared styles.css");
  if (!/lang=["']es-AR["']/.test(src)) problems.push('missing lang="es-AR"');

  // Artifacts must render STATICALLY. A JS-dependent variant — e.g. a native
  // checkbox's `indeterminate`, which is an IDL property with no HTML attribute
  // — is invisible both to readback verification and to any renderer that
  // screenshots before scripts execute. That is the same reason .dark must be a
  // duplicated tree rather than a toggle (spec E5). Represent such states with a
  // CSS class in styles.css instead.
  if (/<script[\s>]/i.test(src))
    problems.push(
      "contains <script> — artifacts must render statically (spec E5)",
    );

  if (PRINT_ONLY.has(rel)) {
    if (!/@page\s*\{[^}]*size:\s*A4/i.test(src))
      problems.push("print artifact lacks @page { size: A4 }");
    if (/class=["'][^"']*\bdark\b/.test(src))
      problems.push("print artifact must NOT ship a dark variant (spec R6)");
  } else {
    if (!/class=["'][^"']*\bdark\b/.test(src))
      problems.push("missing a static .dark variant block");
  }

  for (const { re, why } of BANNED) if (re.test(src)) problems.push(why);

  return problems.map((p) => `${rel}: ${p}`);
}

if (!existsSync(join(ROOT, "styles.css"))) {
  console.error("FAIL: styles.css is missing");
  process.exit(1);
}

let files = walk(ROOT);
if (only) files = files.filter((f) => relative(ROOT, f).includes(only));

if (files.length === 0) {
  console.error(
    `FAIL: no .html artifacts found${only ? ` matching "${only}"` : ""}`,
  );
  process.exit(1);
}

// The stylesheet is always checked, even with --only: it is shared by every
// artifact, so a defect there affects all of them.
const failures = [...checkStyles(), ...files.flatMap(checkHtml)];
console.log(`checked styles.css + ${files.length} artifact(s)`);
for (const f of failures) console.error("  ✗ " + f);
if (failures.length) {
  console.error(`FAIL: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log("PASS");
