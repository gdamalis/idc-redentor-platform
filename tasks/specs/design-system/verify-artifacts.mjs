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

// NOT ADDED: a static halo-OVERLAP check (PR #112 thread 3660378526, the
// pager 8px-overlap regression this same vigil round fixed — see .pager
// button's min-width below). Considered and rejected: whether two adjacent
// halos overlap depends on the CONTAINER's runtime `gap`/flex-wrap and
// which sibling paints last, none of which this regex-based, non-cascading
// block parser resolves (it doesn't even know which selectors are siblings
// under a shared flex/grid parent, let alone the parent's computed gap).
// A static rule here would either miss real overlaps or false-positive on
// fine layouts — gate theater, not a gate. The real check is the browser
// measurement (getBoundingClientRect on the rendered artifact) done for F5;
// re-run that measurement by hand if a control near a halo'd sibling changes.
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
  if (!/(^|[\s>+~])input(?![\w-])/i.test(sel)) return false;
  if (/type=["'](checkbox|radio)["']/i.test(sel)) return false;
  // A pseudo-class (:focus), pseudo-element (::placeholder), or boolean
  // state attribute ([disabled]/[readonly]/[checked]) refines an input that
  // already has its own base rule elsewhere in the sheet — it declares no
  // box properties of its own, so it isn't a distinct hit target that needs
  // its own floor (e.g. `.search input` sets height:44px; `.search
  // input:focus`/`::placeholder` only restyle color/outline on that SAME box).
  if (/:[a-z-]/i.test(sel)) return false;
  if (/\[(disabled|readonly|checked)\]/i.test(sel)) return false;
  return true;
}

// Every block whose selector list literally contains `sel` contributes to its
// geometry — not just the one block that happens to establish cursor:pointer.
// This matters because the ≥44px baseline is set in ONE shared rule
// (`.btn, .icon-btn, .kebab, .pager button, .seg button, .nav-item, .filter`)
// while a control's OTHER axis (or a size override) frequently lives in that
// control's own separate block (e.g. `.seg button`'s min-width:44px is a
// distinct rule from the shared block that gives it cursor:pointer). Scanning
// only the "interactive" block itself — as the pre-fix height check did —
// would make the width check blind to exactly that pattern.
function axisFloor(sel, blocks, prop) {
  const minRe = new RegExp(`min-${prop}:\\s*([\\d.]+)px`, "i");
  const bareRe = new RegExp(`(?<!min-)${prop}:\\s*([\\d.]+)px`, "i");
  // A percentage (e.g. `.search input`'s `width: 100%`) is an explicit,
  // deliberate "fill the parent" declaration, not an undeclared floor — it
  // just isn't expressible in px, so it can't feed the px-based max() below.
  const pctRe = new RegExp(`(?:min-)?${prop}:\\s*[\\d.]+%`, "i");
  let px = 0;
  let hasPercent = false;
  for (const { selectorList, body } of blocks) {
    if (
      !selectorList
        .split(",")
        .map((s) => s.trim())
        .includes(sel)
    )
      continue;
    const minM = body.match(minRe);
    const bareM = body.match(bareRe);
    if (minM) px = Math.max(px, parseFloat(minM[1]));
    if (bareM) px = Math.max(px, parseFloat(bareM[1]));
    if (pctRe.test(body)) hasPercent = true;
  }
  return { px, hasPercent };
}

// A halo only satisfies the axis its `inset` shorthand actually expands — the
// existing halos are deliberately axis-specific (Codex round-4 P2): `.icon-btn`
// /`.kebab`/`.pager button` use `inset: 0 -Npx` (vertical 0, horizontal -N) to
// widen WITHOUT touching height; `.btn-sm`/`.th-sort` use `inset: -Npx 0`
// (vertical -N, horizontal 0) to heighten WITHOUT touching width. Treating
// "has a ::before halo" as "satisfies whichever axis is failing" (the old
// behaviour) would silently pass a control whose halo covers the WRONG axis.
function haloAxisCoverage(sel, blocks) {
  const target = `${sel}::before`;
  for (const { selectorList, body } of blocks) {
    if (
      !selectorList
        .split(",")
        .map((s) => s.trim())
        .includes(target)
    )
      continue;
    const insetMatch = body.match(/inset:\s*([^;]+);/i);
    if (!insetMatch) return { coversHeight: false, coversWidth: false };
    const parts = insetMatch[1].trim().split(/\s+/).map(parseFloat);
    let vertical = 0;
    let horizontal = 0;
    if (parts.length === 1) {
      vertical = parts[0];
      horizontal = parts[0];
    } else if (parts.length === 2) {
      [vertical, horizontal] = parts;
    } else if (parts.length >= 4) {
      // top right bottom left
      vertical = Math.max(Math.abs(parts[0]), Math.abs(parts[2]));
      horizontal = Math.max(Math.abs(parts[1]), Math.abs(parts[3]));
    }
    return { coversHeight: vertical !== 0, coversWidth: horizontal !== 0 };
  }
  return { coversHeight: false, coversWidth: false };
}

// A selector is interactive if ANY block containing it in its selector list
// declares cursor:pointer, or if it's a bare <input> (see isBareInputSelector).
// Collected once, selector-keyed, so a selector repeated across several
// blocks (e.g. `.filter` gets cursor:pointer from both the shared baseline
// block and its own block) is only evaluated once.
function collectInteractiveSelectors(blocks) {
  const interactive = new Map();
  for (const { selectorList, body } of blocks) {
    const selectors = selectorList.split(",").map((s) => s.trim());
    const bodyHasPointer = /cursor:\s*pointer\b/i.test(body);
    const sels = bodyHasPointer
      ? selectors
      : selectors.filter(isBareInputSelector);
    for (const sel of sels) {
      if (!interactive.has(sel)) {
        interactive.set(
          sel,
          bodyHasPointer ? "cursor:pointer" : "a bare <input>",
        );
      }
    }
  }
  return interactive;
}

function checkHitTargets(css) {
  const blocks = parseCssBlocks(css);
  const problems = [];
  const interactive = collectInteractiveSelectors(blocks);

  for (const [sel, control] of interactive) {
    const height = axisFloor(sel, blocks, "height");
    const width = axisFloor(sel, blocks, "width");
    const halo = haloAxisCoverage(sel, blocks);

    const heightOk = height.px >= 44 || height.hasPercent || halo.coversHeight;
    const widthOk = width.px >= 44 || width.hasPercent || halo.coversWidth;
    if (heightOk && widthOk) continue;

    const axisReasons = [];
    if (!heightOk) {
      axisReasons.push(
        height.px > 0
          ? `height floor ${height.px}px (<44) with no ::before halo covering height`
          : `no height floor and no ::before halo covering height`,
      );
    }
    if (!widthOk) {
      axisReasons.push(
        width.px > 0
          ? `width floor ${width.px}px (<44) with no ::before halo covering width`
          : `no width floor and no ::before halo covering width`,
      );
    }
    problems.push(
      `${sel} has ${control} but declares ${axisReasons.join(" and ")} (>=44px BOTH axes required)`,
    );
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

// R2 requires Foundations to render every semantic colour token — the four
// --status-* tokens were silently absent until this pass (Codex round-4 P2:
// "Foundations omits the derived status tokens"). Enforce it mechanically:
// every custom property declared in styles.css's :root must appear as a
// var(--name) reference somewhere in foundations.html, unless explicitly
// allowlisted below with a one-line reason. An allowlist entry is
// documentation of a deliberate omission; a silent gap is not.
const FOUNDATIONS_TOKEN_ALLOWLIST = {
  "--radius":
    "shown via its derived --radius-sm/md/lg/xl scale in the Radio section, not as a raw var(--radius) reference",
};

function extractRootTokenNames(blocks) {
  const rootBlock = blocks.find(
    ({ selectorList }) => selectorList.trim() === ":root",
  );
  if (!rootBlock) return [];
  const names = [];
  const re = /--([\w-]+)\s*:/g;
  let m;
  while ((m = re.exec(rootBlock.body))) names.push(`--${m[1]}`);
  return names;
}

function checkFoundationsTokenCoverage() {
  const cssSrc = readFileSync(join(ROOT, "styles.css"), "utf8");
  const tokens = extractRootTokenNames(parseCssBlocks(cssSrc));
  const foundationsPath = join(ROOT, "foundations", "foundations.html");
  if (!existsSync(foundationsPath))
    return ["foundations/foundations.html: file is missing"];
  const html = readFileSync(foundationsPath, "utf8");

  const problems = [];
  for (const token of tokens) {
    if (token in FOUNDATIONS_TOKEN_ALLOWLIST) continue;
    if (!html.includes(`var(${token})`)) {
      problems.push(
        `missing a swatch for ${token} (declared in styles.css :root but not rendered)`,
      );
    }
  }
  return problems.map((p) => `foundations/foundations.html: ${p}`);
}

// ===== HTML-side hit-target check (PR #112 thread 3660378522): checkHitTargets
// above only sees controls discoverable FROM THE CSS (cursor:pointer, or a bare
// `input` selector) — a native <button>/<select>/<textarea>/<a href>/<input>
// (excl. checkbox/radio) added to an artifact with no matching CSS rule at all
// is invisible to it. Reproduced directly: `<button>tiny</button>` dropped into
// an artifact still reported PASS before this check existed.
//
// Full class -> floor resolution (not the simpler "every native element needs
// SOME class" rule) is what's actually sound here: several already-correct
// controls are BARE tags matched only via an ancestor's class — `.pager
// button`, `.seg button`, `.search input` (see people-list.html's `<button
// class="on">ES</button>` sibling `<button>EN</button>`, and its unclassed
// `<button>‹</button>` pager arrows) all rely on a parent's class + the tag
// name, not a class of their own. A "must carry a class" rule would flag
// these correct, already-floored controls, so this resolves the same way
// checkHitTargets does: build the candidate selector strings this element
// could be reached by (its own class(es), or an ancestor class + this tag,
// mirroring the "A B" descendant compounds actually used in this file) and
// ask the SAME axisFloor/haloAxisCoverage helpers whether any of them clears
// >=44px on both axes (or is haloed). A element with no such selector — no
// class of its own, no ancestor class this stylesheet keys off of — fails.
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const NATIVE_CONTROL_TAGS = new Set([
  "button",
  "select",
  "textarea",
  "a",
  "input",
]);

function scanNativeControls(html) {
  // Blank out <script>/<style>/comment bodies first so stray "<"/">" inside
  // them (e.g. a CSS child combinator) can't desync the tag scanner.
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, (m) => " ".repeat(m.length))
    .replace(/<style[\s\S]*?<\/style>/gi, (m) => " ".repeat(m.length))
    .replace(/<script[\s\S]*?<\/script>/gi, (m) => " ".repeat(m.length));

  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*)?)\/?>/g;
  const stack = []; // {tag, classes: string[]}
  const controls = [];
  let m;
  while ((m = tagRe.exec(cleaned))) {
    const [, closing, tagRaw, attrsRaw = ""] = m;
    const tag = tagRaw.toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const classMatch = attrsRaw.match(/\bclass=["']([^"']*)["']/i);
    const ownClasses = classMatch
      ? classMatch[1].trim().split(/\s+/).filter(Boolean)
      : [];
    const selfClosed = /\/\s*$/.test(m[0].slice(0, -1));
    const isVoid = VOID_ELEMENTS.has(tag) || selfClosed;

    if (NATIVE_CONTROL_TAGS.has(tag)) {
      const isCheckboxOrRadio =
        tag === "input" && /\btype=["'](checkbox|radio)["']/i.test(attrsRaw);
      const isHreflessAnchor = tag === "a" && !/\bhref=["']/i.test(attrsRaw);
      if (!isCheckboxOrRadio && !isHreflessAnchor) {
        controls.push({
          tag,
          ownClasses,
          ancestors: [...stack].reverse(), // closest ancestor first
        });
      }
    }

    if (!isVoid) stack.push({ tag, classes: ownClasses });
  }
  return controls;
}

function controlCandidateSelectors(control) {
  const candidates = new Set();
  for (const c of control.ownClasses) candidates.add(`.${c}`);
  for (const ancestor of control.ancestors) {
    for (const ac of ancestor.classes) {
      candidates.add(`.${ac} ${control.tag}`);
      for (const oc of control.ownClasses) candidates.add(`.${ac} .${oc}`);
    }
  }
  if (control.tag === "input") candidates.add("input"); // mirrors isBareInputSelector
  return candidates;
}

function checkNativeControlsFloored(html, rel, cssBlocks) {
  const problems = [];
  for (const control of scanNativeControls(html)) {
    let ok = false;
    for (const sel of controlCandidateSelectors(control)) {
      const height = axisFloor(sel, cssBlocks, "height");
      const width = axisFloor(sel, cssBlocks, "width");
      const halo = haloAxisCoverage(sel, cssBlocks);
      const heightOk =
        height.px >= 44 || height.hasPercent || halo.coversHeight;
      const widthOk = width.px >= 44 || width.hasPercent || halo.coversWidth;
      if (heightOk && widthOk) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      const desc = control.ownClasses.length
        ? `class="${control.ownClasses.join(" ")}"`
        : "no class";
      const ancestorDesc = control.ancestors
        .slice(0, 2)
        .map((a) =>
          a.classes.length ? `.${a.classes.join(".")}` : `<${a.tag}>`,
        )
        .join(" < ");
      problems.push(
        `<${control.tag}> (${desc}${ancestorDesc ? `, inside ${ancestorDesc}` : ""}) ` +
          `has no CSS rule (own class, or ancestor-class + <${control.tag}>) that ` +
          `floors >=44px on both axes or provides an axis-covering halo`,
      );
    }
  }
  return problems.map((p) => `${rel}: ${p}`);
}

function checkHtml(abs, cssBlocks) {
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

  return [
    ...problems.map((p) => `${rel}: ${p}`),
    ...checkNativeControlsFloored(src, rel, cssBlocks),
  ];
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
// artifact, so a defect there affects all of them. Same for the Foundations
// token-inventory check — it depends on styles.css's :root, not on `--only`.
// checkHtml's native-control floor check (F4, thread 3660378522) needs the
// same parsed blocks checkHitTargets already builds, so it's read here once
// and threaded through rather than re-read per artifact.
const cssBlocks = parseCssBlocks(
  readFileSync(join(ROOT, "styles.css"), "utf8"),
);
const failures = [
  ...checkStyles(),
  ...checkFoundationsTokenCoverage(),
  ...files.flatMap((f) => checkHtml(f, cssBlocks)),
];
console.log(`checked styles.css + ${files.length} artifact(s)`);
for (const f of failures) console.error("  ✗ " + f);
if (failures.length) {
  console.error(`FAIL: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log("PASS");
