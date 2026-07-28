#!/usr/bin/env node
// Gate for the ICR-18 design-system artifacts. Machine-enforces the quality bar from
// tasks/specs/admin-design-prompt.md §B and the light+dark requirement from the spec.
// Usage: node verify-artifacts.mjs [--only <substring>] [--no-measure]
//
// ===== What this gate checks, and where (negative-space note, PR #112 vigil) =====
// STATIC (parses styles.css/HTML text, no browser):
//   - banned patterns (gradients, Inter/Roboto, emoji) in styles.css and every artifact
//   - "Outfit"/"Playfair Display" font-family declared in styles.css
//   - every artifact: links styles.css, lang="es-AR", no <script>, has (or is
//     exempt from) a static .dark variant block, the print artifact's @page rule
//   - Foundations token-inventory: every styles.css :root custom property renders
//     a swatch in foundations.html (or is explicitly allowlisted)
//   - token CONTRAST: every literal fg/bg token pair this stylesheet actually
//     composites together clears its WCAG threshold (4.5:1 text, 3:1 graphical),
//     computed directly from the HSL values in styles.css — this is genuinely
//     static because the values themselves are static, unlike geometry (below)
// RENDERED (launches headless Chromium, measures the real DOM — see
// checkRenderedHitTargets): every native interactive element (button, select,
// textarea, a[href], input excl. checkbox/radio) PLUS every element matching a
// CSS-declared interactive class (cursor:pointer, or a bare `input` selector) is
// measured for a >=44px hit region (own box unioned with any ::before halo) on
// BOTH axes, and no two hit regions on the same rendered page may overlap. Three
// static approximations of this (round 1-4's arithmetic, then two more static
// passes this same vigil round) each missed a real defect — geometry is a
// rendered-layout property, so it gets checked by actually rendering the layout,
// not by re-deriving a fourth static heuristic. Requires a downloaded Chromium
// (`pnpm exec playwright install chromium`, cached at ~/.cache/ms-playwright);
// if launch fails, this half of the gate WARNS LOUDLY and is skipped rather than
// hard-failing (see runRenderedChecks) — pass --no-measure to skip it on purpose.
// NOT WIRED INTO CI YET: no .github/workflows/*.yml references this script as of
// this writing — it's a local/manual pre-commit check. CI already proves Chromium
// works here (pr.yml's predica-scripts job: `pnpm exec playwright install
// --with-deps chromium`), so adding a CI job for this gate is a mechanical
// follow-up, not a blocker; it just hasn't been asked for yet.
// NOT CHECKED AT ALL (by this gate or any other in the repo today): keyboard
// focus order / visible focus rings, ARIA roles or screen-reader semantics
// beyond a literal aria-label attribute, contrast of any RAW hex/rgb color that
// bypasses the token system (the contrast check only understands var(--token)
// values), and whether an artifact's sample data reads as realistic (that's a
// human-review concern, not a mechanical one — see §8 of design-system.md).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { createServer } from "node:http";

const ROOT = new URL(".", import.meta.url).pathname.replace(/\/$/, "");
const argv = process.argv.slice(2);
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const noMeasure = argv.includes("--no-measure");

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
// `.checkbox input[type="checkbox"]`) is a real text-like control and needs to
// be discovered even though it carries no distinguishing class of its own.
function isBareInputSelector(sel) {
  if (!/(^|[\s>+~])input(?![\w-])/i.test(sel)) return false;
  if (/type=["'](checkbox|radio)["']/i.test(sel)) return false;
  if (/:[a-z-]/i.test(sel)) return false;
  if (/\[(disabled|readonly|checked)\]/i.test(sel)) return false;
  return true;
}

// The set of CSS selector STRINGS this stylesheet declares as interactive
// (cursor:pointer, or a bare <input>) — feeds the rendered pass below with
// "which classed elements to also measure" alongside plain native tags. This
// is selector DISCOVERY only; the actual >=44px + no-overlap verdict comes
// from measuring the real rendered box, not from re-parsing px arithmetic.
function interactiveCssSelectors(cssBlocks) {
  const interactive = new Set();
  for (const { selectorList, body } of cssBlocks) {
    const selectors = selectorList.split(",").map((s) => s.trim());
    const bodyHasPointer = /cursor:\s*pointer\b/i.test(body);
    const sels = bodyHasPointer
      ? selectors
      : selectors.filter(isBareInputSelector);
    for (const sel of sels) interactive.add(sel);
  }
  return interactive;
}

// ===== Token CONTRAST check — genuinely static, unlike geometry: the colours
// ARE the literal HSL values in styles.css, so recomputing WCAG contrast from
// them is exact, not an approximation of something that only exists once
// rendered. Every fg/bg pair actually composited together in this stylesheet
// (found by grepping every block for a `color`/`fill`/`stroke` declaration
// alongside a `background`/`background-color` declaration in the SAME block,
// plus the handful of cross-block pairs this system's own conventions
// establish — see docs/architecture/design-system.md's contrast table) is
// checked against 4.5:1 for text or 3:1 for a graphical object (WCAG 1.4.11,
// e.g. the birthday star's fill). Composited (translucent-over-base) pairs use
// the same alpha-compositing math the status tokens were hand-verified with.
function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function relLuminance([r, g, b]) {
  const chan = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [chan(r), chan(g), chan(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function parseHslToken(str) {
  const m = str
    .trim()
    .match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+))?$/);
  if (!m) return null;
  return {
    rgb: hslToRgb(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])),
    alpha: m[4] !== undefined ? parseFloat(m[4]) : 1,
  };
}
function contrastRatio(hslA, hslB) {
  const a = parseHslToken(hslA);
  const b = parseHslToken(hslB);
  const lA = relLuminance(a.rgb);
  const lB = relLuminance(b.rgb);
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}
function compositeOver(overStr, baseStr) {
  const over = parseHslToken(overStr);
  const base = parseHslToken(baseStr);
  const rgb = over.rgb.map((c, i) => c * over.alpha + base.rgb[i] * (1 - over.alpha));
  return relLuminance(rgb);
}
function contrastOverBase(fgStr, bgStr, baseStr) {
  const bgLum = compositeOver(bgStr, baseStr);
  const fgLum = relLuminance(parseHslToken(fgStr).rgb);
  const [lighter, darker] = fgLum > bgLum ? [fgLum, bgLum] : [bgLum, fgLum];
  return (lighter + 0.05) / (darker + 0.05);
}

function extractThemeTokens(blocks, selector) {
  const block = blocks.find(({ selectorList }) => selectorList.trim() === selector);
  if (!block) return {};
  const tokens = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block.body))) tokens[m[1]] = m[2].trim();
  return tokens;
}

// [label, fg token, bg token, threshold, composited-over-token-or-null]
const CONTRAST_PAIRS = [
  ["foreground on background", "foreground", "background", 4.5, null],
  ["card-foreground on card", "card-foreground", "card", 4.5, null],
  ["popover-foreground on popover", "popover-foreground", "popover", 4.5, null],
  ["primary-foreground on primary", "primary-foreground", "primary", 4.5, null],
  ["secondary-foreground on secondary", "secondary-foreground", "secondary", 4.5, null],
  // 3:1 (not 4.5:1): this raw opaque pair's only remaining live usage is
  // .avatar-photo's SVG icon (fill/stroke: currentColor) — graphical, not
  // text (WCAG 1.4.11). Its two former TEXT usages (.b-inactive, then
  // .badge.b-neutral, both a 4.34:1 AA fail) were repointed to the dedicated
  // --status-inactive-fg/-bg pair below instead of raising this pair itself,
  // which would have rippled into every other opaque-muted-background
  // consumer. See docs/architecture/design-system.md §3a.
  ["muted-foreground on muted (graphical only — see comment)", "muted-foreground", "muted", 3.0, null],
  ["accent-foreground on accent", "accent-foreground", "accent", 4.5, null],
  ["destructive-foreground on destructive", "destructive-foreground", "destructive", 4.5, null],
  ["sidebar-foreground on sidebar", "sidebar-foreground", "sidebar", 4.5, null],
  ["sidebar-primary-foreground on sidebar-primary", "sidebar-primary-foreground", "sidebar-primary", 4.5, null],
  ["sidebar-accent-foreground on sidebar-accent", "sidebar-accent-foreground", "sidebar-accent", 4.5, null],
  ["destructive-text on card", "destructive-text", "card", 4.5, null],
  ["destructive-text on background", "destructive-text", "background", 4.5, null],
  ["gold on card (graphical, .star fill)", "gold", "card", 3.0, null],
  ["gold on background (graphical)", "gold", "background", 3.0, null],
  ["status-active-fg on status-active-bg (over card)", "status-active-fg", "status-active-bg", 4.5, "card"],
  ["status-occ-fg on status-occ-bg (over card)", "status-occ-fg", "status-occ-bg", 4.5, "card"],
  ["status-inactive-fg on status-inactive-bg (over card)", "status-inactive-fg", "status-inactive-bg", 4.5, "card"],
  // These two override the bg token's OWN alpha with an ad-hoc one applied at
  // the usage site (thead th / .cal-dow div use `hsl(var(--muted) / 0.5)`,
  // not --muted's own opacity) — the 6th field is that override.
  ["thead th: muted-foreground on (muted/.5 over card)", "muted-foreground", "muted", 4.5, "card", 0.5],
  ["status-inactive-fg on (muted/.5 over background) — .cal-dow div", "status-inactive-fg", "muted", 4.5, "background", 0.5],
];

function checkTokenContrast(cssBlocks) {
  const light = extractThemeTokens(cssBlocks, ":root");
  const dark = extractThemeTokens(cssBlocks, ".dark");
  const problems = [];
  for (const [theme, tokens] of [["light", light], ["dark", dark]]) {
    for (const [label, fgKey, bgKey, threshold, base, bgAlphaOverride] of CONTRAST_PAIRS) {
      const fg = tokens[fgKey];
      let bg = tokens[bgKey];
      if (!fg || !bg) {
        problems.push(`${theme}: ${label} — token(s) missing (--${fgKey}/--${bgKey})`);
        continue;
      }
      if (bgAlphaOverride !== undefined) {
        bg = bg.replace(/\s*\/\s*[\d.]+\s*$/, "") + ` / ${bgAlphaOverride}`;
      }
      const r = base
        ? contrastOverBase(fg, bg, tokens[base])
        : contrastRatio(fg, bg);
      if (r < threshold) {
        problems.push(
          `${theme}: ${label} = ${r.toFixed(3)}:1, below ${threshold}:1`,
        );
      }
    }
  }
  return problems.map((p) => `styles.css (contrast): ${p}`);
}

// The fonts are declared ONCE, in the shared stylesheet — not in every artifact.
// Asserting them per-HTML would force every artifact to embed a decorative
// font-family purely to satisfy the gate. Assert them where they actually live,
// and run the BANNED list over the stylesheet too — otherwise a gradient added
// to styles.css (the likeliest place) bypasses the whole quality gate.
function checkStyles(cssBlocks, cssSrc) {
  if (cssSrc.trim().length === 0) return ["styles.css: EMPTY file"];
  const problems = [];
  if (!/"Outfit"/.test(cssSrc)) problems.push('missing "Outfit" font-family');
  if (!/"Playfair Display"/.test(cssSrc))
    problems.push('missing "Playfair Display" font-family');
  for (const { re, why } of BANNED) if (re.test(cssSrc)) problems.push(why);
  const styleProblems = problems.map((p) => `styles.css: ${p}`);
  return [...styleProblems, ...checkTokenContrast(cssBlocks)];
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

function checkFoundationsTokenCoverage(cssBlocks) {
  const tokens = extractRootTokenNames(cssBlocks);
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

// ===== Rendered hit-target + overlap check (PR #112 threads 3660378522,
// 3660378526). Replaces three static approximations (round 1-4's px arithmetic,
// then this same vigil round's CSS-only AND HTML-side static checks) that each
// missed a real defect in turn. Geometry — including whether a ::before halo
// pushes past a neighbour — is a rendered-layout property; measuring it after
// rendering closes every one of those holes at once instead of patching a
// fourth static heuristic. See the file-header comment for what runs where.
async function measureArtifact(page, url, allSelectors) {
  await page.goto(url, { waitUntil: "networkidle" });
  return page.evaluate((selectors) => {
    function toLTRB(rect) {
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    }
    // inset shorthand is always resolved to 4 values (top right bottom left);
    // a NEGATIVE value pushes that edge OUTWARD (expands the box).
    function haloRect(rect, insetStr) {
      if (!insetStr || insetStr === "none") return null;
      const parts = insetStr.trim().split(/\s+/).map(parseFloat);
      const [top, right, bottom, left] =
        parts.length === 4
          ? parts
          : parts.length === 2
            ? [parts[0], parts[1], parts[0], parts[1]]
            : [parts[0], parts[0], parts[0], parts[0]];
      return {
        left: rect.left + left,
        right: rect.right - right,
        top: rect.top + top,
        bottom: rect.bottom - bottom,
      };
    }

    const seen = new Set();
    const results = [];
    let combined;
    try {
      combined = document.querySelectorAll(selectors.join(","));
    } catch {
      return { error: "invalid combined selector", results: [] };
    }
    for (const el of combined) {
      if (seen.has(el)) continue;
      seen.add(el);
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue; // not rendered (e.g. hidden variant)
      const before = getComputedStyle(el, "::before");
      const halo = before.content !== "none" ? haloRect(toLTRB(rect), before.inset) : null;
      const area = halo ?? toLTRB(rect);
      results.push({
        tag: el.tagName.toLowerCase(),
        cls: el.className && el.className.toString ? el.className.toString() : "",
        left: area.left,
        top: area.top,
        right: area.right,
        bottom: area.bottom,
        w: area.right - area.left,
        h: area.bottom - area.top,
      });
    }
    return { error: null, results };
  }, allSelectors);
}

function rectsOverlap(a, b) {
  const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return ox > 0.5 && oy > 0.5;
}

async function checkRenderedHitTargets(files, cssBlocks, cssSrc) {
  if (noMeasure) {
    return {
      problems: [],
      skipped: true,
      reason: "--no-measure passed explicitly",
    };
  }

  let chromium;
  try {
    const entry = join(
      process.cwd(),
      "node_modules/.pnpm/playwright@1.61.0/node_modules/playwright/index.mjs",
    );
    ({ chromium } = await import(`file://${existsSync(entry) ? entry : "playwright"}`));
  } catch {
    try {
      ({ chromium } = await import("playwright"));
    } catch (err) {
      return {
        problems: [],
        skipped: true,
        reason: `could not load Playwright (${err.message}) — run "pnpm exec playwright install chromium"`,
      };
    }
  }

  const nativeSelectors = [
    "button",
    "select",
    "textarea",
    "a[href]",
    'input:not([type="checkbox"]):not([type="radio"])',
  ];
  const classSelectors = [...interactiveCssSelectors(cssBlocks)];
  const allSelectors = [...nativeSelectors, ...classSelectors];

  const server = createServer(async (req, res) => {
    try {
      const p = decodeURIComponent(req.url.split("?")[0]);
      const abs = join(ROOT, p);
      const body = readFileSync(abs);
      const ext = extname(abs);
      const mime =
        { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" }[ext] ??
        "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    server.close();
    return {
      problems: [],
      skipped: true,
      reason: `Chromium failed to launch (${err.message}) — run "pnpm exec playwright install chromium"`,
    };
  }

  const problems = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1200 } });
    for (const abs of files) {
      const rel = relative(ROOT, abs);
      const url = `http://localhost:${port}/${rel}`;
      const { error, results } = await measureArtifact(page, url, allSelectors);
      if (error) {
        problems.push(`${rel}: rendered check error — ${error}`);
        continue;
      }
      for (const r of results) {
        if (r.w < 44 - 0.5 || r.h < 44 - 0.5) {
          problems.push(
            `${rel}: <${r.tag} class="${r.cls}"> hit region ${r.w.toFixed(2)}x${r.h.toFixed(2)}px, below 44px on ${r.w < 44 ? "width" : ""}${r.w < 44 && r.h < 44 ? "+" : ""}${r.h < 44 ? "height" : ""}`,
          );
        }
      }
      for (let i = 0; i < results.length; i++) {
        for (let j = i + 1; j < results.length; j++) {
          if (rectsOverlap(results[i], results[j])) {
            problems.push(
              `${rel}: hit regions overlap — <${results[i].tag} class="${results[i].cls}"> and <${results[j].tag} class="${results[j].cls}">`,
            );
          }
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return { problems, skipped: false };
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
// token-inventory and contrast checks — both depend on styles.css's :root,
// not on `--only`.
const cssSrc = readFileSync(join(ROOT, "styles.css"), "utf8");
const cssBlocks = parseCssBlocks(cssSrc);

const staticFailures = [
  ...checkStyles(cssBlocks, cssSrc),
  ...checkFoundationsTokenCoverage(cssBlocks),
  ...files.flatMap(checkHtml),
];

const { problems: renderedFailures, skipped, reason } =
  await checkRenderedHitTargets(files, cssBlocks, cssSrc);

const failures = [...staticFailures, ...renderedFailures];
console.log(`checked styles.css + ${files.length} artifact(s)`);
if (skipped) {
  console.warn(
    `  !!! rendered hit-target/overlap check SKIPPED: ${reason}`,
  );
  console.warn(
    "  !!! this gate cannot verify >=44px hit targets or halo overlap without it",
  );
}
for (const f of failures) console.error("  ✗ " + f);
if (failures.length) {
  console.error(`FAIL: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log("PASS");
