# ICR-18 Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a shared, documented design system for both IDC Redentor products (website +
ministry admin panel) as Claude Design artifacts, plus the written shadcn→`@idcr/ui` migration path —
with **no production code changes**.

**Architecture:** Self-contained static HTML artifacts under `tasks/specs/design-system/`, all linking
one shared `styles.css` that carries the verbatim `tokens.css` palette. A committed Node checker
(`verify-artifacts.mjs`) machine-enforces the quality bar and the light+dark requirement, giving each
task a real RED→GREEN cycle. The orchestrator publishes the artifacts to a **new** claude.ai/design
project and verifies by reading them back.

**Tech Stack:** Static HTML + CSS custom properties (no framework, no build). Node 22 for the checker.
`DesignSync` for publishing. Fonts: Outfit + Playfair Display via Google Fonts `<link>` with local
fallbacks.

---

## ⚠️ Division of labour — read this first

**The `divinelab:implementer` agent has NO `DesignSync` tool** (its tools are Read, Edit, Write, Glob,
Grep, Bash, Skill). It therefore **cannot publish to Claude Design**. Every task splits:

| Actor            | Does                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| **implementer**  | Authors artifact files, runs `verify-artifacts.mjs` until green, commits **and pushes**      |
| **orchestrator** | `DesignSync finalize_plan` → `write_files` → readback verification (`list_files`/`get_file`) |

Steps below are labelled **[IMPL]** or **[ORCH]**. An implementer must never be asked to publish; the
orchestrator must never hand-edit artifact content.

---

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from
`packages/ui/src/tokens.css` and `tasks/specs/admin-design-prompt.md` §B.

- **No production code.** `apps/web/**`, `apps/admin/**`, `packages/ui/**`, `packages/config/**`,
  `public/locales/*.json` are **untouched**. Only exception: Task 8 adds one doc-index line to
  `CLAUDE.md` and `AGENTS.md`.
- **No changeset.** No `.changeset/*.md` file — ICR-18 changes no shipped package, so it cuts no
  release. (Verified: `.releaserc.json` absent, `.changeset/config.json` governs.)
- **Fonts:** body/UI `Outfit` → `font-family: "Outfit", system-ui, sans-serif`. Headings
  `Playfair Display` → `font-family: "Playfair Display", Georgia, serif`, `font-weight: 700`,
  `letter-spacing: -0.011em`. **Nothing else. Never Inter or Roboto.**
- **Radius base:** `--radius: 0.75rem`.
- **Dark mode is a `.dark` ancestor class**, never a prop. Every artifact renders **both themes
  statically** by duplicating the preview tree inside a `.dark` wrapper. A JS-only toggle is
  insufficient — readback verification cannot see it.
- **Quality bar (verbatim, `admin-design-prompt.md` §B):** no gradient-wash backgrounds; no emoji;
  no Inter/Roboto; no rounded-card-with-left-border-accent cliché; generous whitespace; real tables
  with proper density; accessible contrast in both themes; `text-wrap: pretty`; flex/grid with `gap`
  over ad-hoc margins.
- **Hit targets ≥44px.** ⚠️ v1 (`people-list.html`) ships 38px buttons, 36px icon-buttons and 30px
  kebab/pager controls — **below its own stated bar**. This system corrects that: interactive
  controls get a **≥44px hit area**, using padding so dense table rows keep their visual compactness.
  Record the deviation in the Task 8 doc.
- **es-AR copy. Accents are correctness defects, not style.** Every string this plan needs is given
  verbatim per task — transcribe, never compose.
- **Sample-data realism:** the church has **~40–60 people** (`admin-design-prompt.md` §B). v1's
  "128 personas · 34 familias" contradicts that — use **52 personas · 21 familias · 6 países de
  origen** in all new artifacts.
- **Every task commits AND pushes.** The draft PR reflects only what is pushed.

### Conventions established during implementation (binding from CP5 on)

Recorded here as they were discovered, so later tasks don't re-decide them. All three came from
implementer reports.

- **`.preview.flush` for screen artifacts.** `.preview` carries 24px padding, which is right for a
  primitive grid but wrong for a full `.app` shell — the chrome must reach the frame edge. CP4 solved
  this with an inline `style="padding: 0"` on each block. **Promote it to a `.preview.flush` class in
  `styles.css`** and use that for every screen artifact: at 7 screens × 2 themes the inline form would
  mean 14 copies of the same override, against this plan's own DRY rule. CP5 adds the class and
  retrofits CP4's two screens.
- **`.badge.b-neutral` is the informational (non-status) pill.** Base `.badge` has no colour of its own
  outside the three status-dot modifiers, so a plain badge needs it. Added in CP4 for
  `Requiere permiso`. **The roles-matrix `Sensible` badge in CP6 must reuse it** — do not invent a
  second neutral variant.
- **Person-detail `Relaciones` sample rows** (the plan gave the four role options but no people):
  `Marisol Peña` → `Cónyuge`, `Tomás Peña` → `Hijo/a`. Invented in CP4 because no other Peña-family
  member appears in the sample data; recorded now as canonical so they stay stable if the screen is
  re-rendered.
- **Colaborador does NOT get `Ver datos sensibles (PII)`.** Task 6 said Colaborador gets "only the
  three `Ver…` rows", but there are **four** rows starting with `Ver`. CP5 resolved the ambiguity by
  excluding the PII row — granting sensitive personal data to a non-admin role by default would
  contradict the `Sensible` badge that same row carries. That is the correct reading and is now
  binding. (Related plan slip in the same paragraph: it said Líder is unchecked for "the four
  `Administración` rows" when that group lists **three**; the intended total is 4 unchecked cells —
  the 3 `Administración` rows plus `Eliminar personas`.)
- **The sign-in screen deliberately omits the Google brand mark.** The official "G" is fixed
  four-colour brand hex, which conflicts with the tokens-only/no-raw-hex rule, so the artifact renders
  `Continuar con Google` as a plain outline button. **This is an artifact limitation, not a design
  decision** — the real implementation must use the official Google mark per Google's branding
  requirements. Task 8's doc records it as an implementation note.
- **`.divider` is not `.seg`.** Task 6 called sign-in's "o" separator a "`.seg`-style divider"; `.seg`
  is an interactive toggle-button group, so reusing it for static non-interactive text would be
  semantically wrong. CP5 added a dedicated `.divider`. Read "`.seg`-style" there as loose visual
  guidance only.

### The token palette (verbatim — use these exact values)

```css
/* LIGHT */
--background: 210 20% 98%;
--foreground: 222 47% 11%;
--primary: 210 100% 35%;
--primary-foreground: 210 40% 98%;
--secondary: 35 30% 90%;
--secondary-foreground: 24 10% 10%;
--card: 0 0% 100%;
--card-foreground: 222 47% 11%;
--popover: 0 0% 100%;
--popover-foreground: 222 47% 11%;
--muted: 210 40% 96.1%;
--muted-foreground: 215.4 16.3% 46.9%;
--accent: 210 40% 96.1%;
--accent-foreground: 222.2 47.4% 11.2%;
--destructive: 0 84.2% 60.2%;
--destructive-foreground: 210 40% 98%;
--border: 214.3 31.8% 91.4%;
--input: 214.3 31.8% 91.4%;
--ring: 210 100% 35%;
--radius: 0.75rem;
--chart-1: 12 76% 61%;
--chart-2: 173 58% 39%;
--chart-3: 197 37% 24%;
--chart-4: 43 74% 66%;
--chart-5: 27 87% 67%;
--sidebar: 0 0% 98%;
--sidebar-foreground: 240 5.3% 26.1%;
--sidebar-primary: 240 5.9% 10%;
--sidebar-primary-foreground: 0 0% 98%;
--sidebar-accent: 240 4.8% 95.9%;
--sidebar-accent-foreground: 240 5.9% 10%;
--sidebar-border: 220 13% 91%;
--sidebar-ring: 217.2 91.2% 59.8%;

/* DARK (.dark) */
--background: 222 47% 11%;
--foreground: 210 40% 98%;
--primary: 210 90% 60%;
--primary-foreground: 222 47.4% 11.2%;
--secondary: 217.2 32.6% 17.5%;
--secondary-foreground: 210 40% 98%;
--card: 222 47% 14%;
--card-foreground: 210 40% 98%;
--popover: 222 47% 11%;
--popover-foreground: 210 40% 98%;
--muted: 217.2 32.6% 17.5%;
--muted-foreground: 215 20.2% 65.1%;
--accent: 217.2 32.6% 17.5%;
--accent-foreground: 210 40% 98%;
--destructive: 0 62.8% 30.6%;
--destructive-foreground: 210 40% 98%;
--border: 217.2 32.6% 17.5%;
--input: 217.2 32.6% 17.5%;
--ring: 210 90% 60%;
--sidebar: 240 5.9% 10%;
--sidebar-foreground: 240 4.8% 95.9%;
--sidebar-primary: 224.3 76.3% 48%;
--sidebar-primary-foreground: 0 0% 100%;
--sidebar-accent: 240 3.7% 15.9%;
--sidebar-accent-foreground: 240 4.8% 95.9%;
--sidebar-border: 240 3.7% 15.9%;
--sidebar-ring: 217.2 91.2% 59.8%;
```

### Derived tokens — NOT in `tokens.css`, introduced by v1

These exist only in the v1 mockup. The system **adopts and documents them as derived additions**, so
the follow-up code ticket knows they must be added to `tokens.css`:

```css
/* light */
--gold: 35 45% 62%; /* derived from --secondary hue; sparing leadership accents */
/* dark  */
--gold: 35 40% 58%;

/* status badge hues (light / dark) */
--status-active-fg: 160 60% 29% / 160 55% 60%; /* light L 34%->29%, Codex round-4 P2: WCAG AA */
--status-active-bg: 160 60% 34% / 0.12 / 160 55% 50% / 0.15;
--status-occ-fg: 35 70% 33% / 35 75% 62%; /* light L 38%->33%, Codex round-4 P2: WCAG AA */
--status-occ-bg: 35 70% 45% / 0.14 / 35 70% 50% / 0.16;
/* inactive uses --muted-foreground on --muted in both themes */
```

---

## File structure

| Path                                                     | Responsibility                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `tasks/specs/design-system/styles.css`                   | Single source of shared tokens + base type + primitive classes |
| `tasks/specs/design-system/verify-artifacts.mjs`         | The checker — machine-enforces quality bar + light/dark        |
| `tasks/specs/design-system/README.md`                    | Project id, upload procedure, what is hand-authored            |
| `tasks/specs/design-system/foundations/foundations.html` | Swatches, type ramp, spacing, radius                           |
| `tasks/specs/design-system/primitives/<Name>.html` × 14  | One variant grid each                                          |
| `tasks/specs/design-system/screens/<name>.html` × 7      | One screen each                                                |
| `docs/architecture/design-system.md`                     | The system doc + `@idcr/ui` migration table                    |

---

## Task 1: Shared stylesheet + the checker

**Files:**

- Create: `tasks/specs/design-system/styles.css`
- Create: `tasks/specs/design-system/verify-artifacts.mjs`
- Create: `tasks/specs/design-system/README.md`

**Interfaces:**

- Consumes: nothing (first task).
- Produces: `styles.css` exposing the CSS classes every later artifact uses — `.ds-section`,
  `.ds-grid`, `.ds-label`, `.ds-swatch`, `.btn`/`.btn-primary`/`.btn-secondary`/`.btn-outline`/`.btn-ghost`/`.btn-destructive`,
  `.field`/`.input`/`.textarea`/`.select`/`.checkbox`, `.table`/`.thead`/`.dense`, `.badge`/`.badge.dot`/`.b-active`/`.b-occ`/`.b-inactive`,
  `.tag`, `.avatar`, `.dialog`, `.menu`, `.tabs`, `.sidebar`/`.nav-item`, `.pager`, `.seg`, `.card`,
  `.app`, `.topbar`, `.crumb`, `.kebab`, `.preview` and `.preview.dark`.
  Also produces `verify-artifacts.mjs` exporting nothing (CLI): `node verify-artifacts.mjs [--only <glob>]`
  exits `0` on pass, `1` with a per-file reason list on fail.

- [ ] **[IMPL] Step 1: Write the checker first (it is the failing test)**

Create `tasks/specs/design-system/verify-artifacts.mjs`:

```js
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
```

> **Corrected 2026-07-27 after CP1.** The first draft of this checker scanned only `.html` and
> asserted the two font families **per artifact**. That was wrong twice over: (1) the fonts live in
> `styles.css`, so `foundations.html` passed only incidentally (its type-ramp inlines
> `font-family: "Outfit"` as content) while `Button.html` would have failed — pushing authors to embed
> a decorative font declaration just to satisfy the gate; (2) `styles.css` was never scanned at all,
> so a gradient added to the **shared stylesheet** — the likeliest place one would appear — bypassed
> the entire quality bar. Both holes are closed above. Found by the CP1 implementer; the defect was in
> this plan, not in its work.

- [ ] **[IMPL] Step 2: Run it and watch it fail**

```bash
cd tasks/specs/design-system && node verify-artifacts.mjs
```

Expected: `FAIL: styles.css is missing`, exit 1. **This failure is the reproduction** — the gate
works before any artifact exists.

- [ ] **[IMPL] Step 3: Write `styles.css`**

Create `tasks/specs/design-system/styles.css` containing, in order:

1. The **full light `:root` block** and **full `.dark` block** from Global Constraints above, verbatim,
   plus the derived `--gold` and status values.
2. Base reset + typography:

```css
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  font-family: "Outfit", system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  -webkit-font-smoothing: antialiased;
  text-wrap: pretty;
}
h1,
h2,
h3,
h4 {
  font-family: "Playfair Display", Georgia, serif;
  font-weight: 700;
  letter-spacing: -0.011em;
  margin: 0;
}
a {
  color: inherit;
  text-decoration: none;
}
```

3. **A ≥44px hit-area baseline** (the correction to v1):

```css
.btn,
.icon-btn,
.kebab,
.pager button,
.seg button,
.nav-item {
  min-height: 44px; /* hit target — quality bar */
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font: inherit;
  cursor: pointer;
}
/* Dense contexts keep visual compactness while preserving the hit area. */
.dense .kebab,
.dense .pager button {
  min-height: 44px;
  padding-block: 0;
}
```

4. Preview scaffolding used by every artifact:

```css
.preview {
  padding: 24px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}
.ds-section {
  padding: 24px;
  border-bottom: 1px solid hsl(var(--border));
}
.ds-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
}
.ds-label {
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(var(--muted-foreground));
  font-weight: 600;
  margin-bottom: 10px;
}
.ds-swatch {
  width: 120px;
}
.ds-swatch .chip {
  height: 52px;
  border-radius: var(--radius);
  border: 1px solid hsl(var(--border));
}
.ds-swatch .name {
  font-size: 12px;
  margin-top: 6px;
  font-weight: 600;
}
.ds-swatch .val {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
.card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  overflow: hidden;
}
```

5. The primitive + shell classes. **Port these verbatim from
   `tasks/specs/design-mockups/people-list.html` lines 60–181** (`.app`, `.sidebar`, `.brand`, `.nav`,
   `.nav-group`, `.nav-label`, `.nav-item`, `.side-foot`, `.avatar`, `.main`, `.topbar`, `.crumb`,
   `.seg`, `.icon-btn`, `.content`, `.page-head`, `.btn`, `.btn-primary`, `.btn-ghost`, `.toolbar`,
   `.search`, `.filter`, `table`/`thead th`/`tbody td`, `.person`, `.star`, `.muted`, `.pii`,
   `.badge`, `.b-active`, `.b-occ`, `.b-inactive`, `.tag`, `.kebab`, `.table-foot`, `.pager`),
   **with two changes**: (a) apply the ≥44px hit-area rule above, and (b) rename `.btn-ghost` to
   `.btn-outline` and add genuine `.btn-secondary`, `.btn-ghost` (transparent, no border) and
   `.btn-destructive` variants:

```css
.btn-secondary {
  background: hsl(var(--secondary));
  color: hsl(var(--secondary-foreground));
}
.btn-outline {
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  border-color: hsl(var(--border));
}
.btn-ghost {
  background: transparent;
  color: hsl(var(--foreground));
  border-color: transparent;
}
.btn-ghost:hover {
  background: hsl(var(--accent));
}
.btn-destructive {
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
}
.btn[disabled],
.btn.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

6. New primitive classes not present in v1 — `.field`, `.input`, `.textarea`, `.select`,
   `.checkbox`, `.dialog`, `.dialog-head`, `.dialog-body`, `.dialog-foot`, `.menu`, `.menu-item`,
   `.tabs`, `.tab`, `.tab.on`. Derive every colour from the tokens (`hsl(var(--…))`); never a raw hex.

- [ ] **[IMPL] Step 4: Run the checker — expect a different failure**

```bash
cd tasks/specs/design-system && node verify-artifacts.mjs
```

Expected: `FAIL: no .html artifacts found`, exit 1. `styles.css` now exists, so the gate advanced
past step 2's failure. That progression is the proof the checker discriminates.

- [ ] **[IMPL] Step 5: Write the README**

`tasks/specs/design-system/README.md` must state: these artifacts are **hand-authored** (unlike the
auto-synced "IDC Redentor" project); the target project name is **"IDC Redentor · Design System"**;
publishing is done by the orchestrator via `DesignSync` (the implementer has no such tool); and
`node verify-artifacts.mjs` must pass before any upload.

- [ ] **[IMPL] Step 6: Commit and push**

```bash
git add tasks/specs/design-system/
git commit -m "feat(ICR-18): add the design-system stylesheet and artifact checker"
git push
```

---

## Task 2: Foundations artifact

**Files:**

- Create: `tasks/specs/design-system/foundations/foundations.html`

**Interfaces:**

- Consumes: `../styles.css` (Task 1) — classes `.preview`, `.ds-section`, `.ds-grid`, `.ds-label`, `.ds-swatch`.
- Produces: the canonical artifact **skeleton** every later artifact copies — doctype, `lang="es-AR"`,
  the Google-Fonts `<link>` pair, `<link rel="stylesheet" href="../styles.css">`, and the
  light-block-then-`.dark`-block body structure.

- [ ] **[IMPL] Step 1: Author the artifact**

Use exactly this skeleton (later tasks reuse it verbatim, adjusting `<title>` and the two preview bodies):

```html
<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Fundamentos — Sistema de Diseño IDC Redentor</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700;800&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="../styles.css" />
  </head>
  <body>
    <div class="preview">
      <!-- LIGHT: full foundations content -->
    </div>
    <div class="preview dark">
      <!-- DARK: the SAME content duplicated -->
    </div>
  </body>
</html>
```

Each `.preview` contains four `.ds-section` blocks:

1. **`<h2>Color</h2>`** — a `.ds-swatch` per semantic token, each showing the `.chip`, the token name,
   and its HSL value. Cover, in this order and paired with its `-foreground`: `background`,
   `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`,
   `border`, `input`, `ring`, `sidebar` (+ its 7 variants), `chart-1`…`chart-5`, and the derived
   `gold`. Label the derived ones **"derivado — no está en tokens.css"**.
2. **`<h2>Tipografía</h2>`** — the ramp, using the **correct Tailwind v4 namespaces** as labels
   (`--text-*`, `--tracking-*`, `--leading-*`), **not** the dead v3 names. Show Playfair at
   h1/h2/h3/h4 and Outfit at body/sm/xs. Add this note, in es-AR, as plain (non-italic) text so the
   wildcards survive markdown formatting — the three dead token families are
   `--font-size-` + `*`, `--letter-spacing-` + `*`, `--line-height-` + `*`:
   "`tokens.css:56-60` declara estos con namespaces v3 (`--font-size-*`, `--letter-spacing-*`,
   `--line-height-*`) que Tailwind v4 ignora — corregir en el ticket de código."
3. **`<h2>Espaciado</h2>`** — the gap/padding scale actually used (4, 6, 8, 10, 12, 16, 20, 24, 26px).
4. **`<h2>Radio</h2>`** — `--radius-sm` `calc(0.75rem - 4px)`, `--radius-md` `calc(0.75rem - 2px)`,
   `--radius-lg` `0.75rem`, `--radius-xl` `calc(0.75rem + 4px)`, plus `999px` for pills.

- [ ] **[IMPL] Step 2: Run the checker on it**

```bash
cd tasks/specs/design-system && node verify-artifacts.mjs --only foundations
```

Expected: `checked 1 artifact(s)` then `PASS`. If it reports "missing a static .dark variant block",
the second `.preview.dark` block is absent or misnamed — fix rather than weaken the check.

- [ ] **[IMPL] Step 3: Commit and push**

```bash
git add tasks/specs/design-system/foundations/
git commit -m "feat(ICR-18): add the design-system foundations artifact"
git push
```

- [ ] **[ORCH] Step 4: Create the project and publish**

1. `DesignSync list_projects` — if a project named **"IDC Redentor · Design System"** exists, reuse its
   `projectId` (edge case E1); otherwise `DesignSync create_project { name: "IDC Redentor · Design System" }`.
2. `DesignSync get_project` — confirm `type` is `PROJECT_TYPE_DESIGN_SYSTEM`. The type is immutable at
   creation; if it is not a design system, stop and report rather than pushing.
3. `DesignSync finalize_plan` with `localDir` = `<worktree>/tasks/specs/design-system`, `writes` =
   `["styles.css", "README.md", "foundations/**", "primitives/**", "screens/**"]`.
4. `DesignSync write_files` with `localPath` entries for `styles.css`, `README.md`,
   `foundations/foundations.html`.

- [ ] **[ORCH] Step 5: Verify by readback**

`DesignSync list_files` → assert `foundations/foundations.html` and `styles.css` are present.
`DesignSync get_file` on `foundations/foundations.html` → assert the response is **non-empty** and
contains both `class="preview"` and `class="preview dark"`. Do not infer success from `write_files`
returning OK.

---

## Task 3: Primitives A — Button, Input, Textarea, Select, Checkbox, Badge, Avatar

**Files:**

- Create: `tasks/specs/design-system/primitives/Button.html`
- Create: `tasks/specs/design-system/primitives/Input.html`
- Create: `tasks/specs/design-system/primitives/Textarea.html`
- Create: `tasks/specs/design-system/primitives/Select.html`
- Create: `tasks/specs/design-system/primitives/Checkbox.html`
- Create: `tasks/specs/design-system/primitives/Badge.html`
- Create: `tasks/specs/design-system/primitives/Avatar.html`

**Interfaces:**

- Consumes: the Task 2 skeleton (read `foundations/foundations.html` for the exact head block) and the
  Task 1 classes.
- Produces: seven variant-grid artifacts. Later screen tasks compose **these exact classes**:
  `.btn.btn-primary|.btn-secondary|.btn-outline|.btn-ghost|.btn-destructive`, `.input`, `.textarea`,
  `.select`, `.checkbox`, `.badge.dot.b-active|.b-occ|.b-inactive`, `.tag`, `.avatar`.

Each artifact = the Task 2 skeleton with `<title>{Name} — Sistema de Diseño IDC Redentor</title>` and
both a light and a duplicated `.dark` preview.

- [ ] **[IMPL] Step 1: Author all seven, with these exact variant matrices**

**Button.html** — 5 variants × 3 sizes, plus icon-only and disabled. es-AR labels:
`Guardar cambios` (primary), `Cancelar` (outline), `Nueva persona` (primary + `+` icon),
`Invitar usuario` (secondary), `Eliminar` (destructive), `Ver detalles` (ghost).
Sizes: `sm` 36px visual/44px hit, `md` 44px, `lg` 48px.

**Input.html** — states: default (placeholder `Buscar por nombre, familia o teléfono…`), focused
(`box-shadow: 0 0 0 3px hsl(var(--ring) / .18)`), error (border `hsl(var(--destructive))` + message
`Ingresá un correo válido`), disabled, and with-label (`Nombre completo`) + help text
(`Como aparece en los registros de la iglesia`).

**Textarea.html** — default / focused / error / disabled, label `Notas`, 4 rows. Error message:
`Este campo es obligatorio`. (Added 2026-07-27: the first draft specified the four states but gave no
error string, so the CP2 implementer had to compose one against this plan's own "transcribe, never
compose" rule. It chose exactly this, tone-matched to Input's `Ingresá un correo válido`; recording it
so the gap is closed rather than re-improvised.)

**Select.html** — closed with label `Grupo familiar`, options `Familia Peña`, `Familia Vargas`,
`Familia Rodríguez`, `Sin familia`; plus disabled state.

**Checkbox.html** — unchecked / checked / indeterminate / disabled, each with a label.
⚠️ **The indeterminate state must be CSS-only** — add a `.checkbox.is-indeterminate` class to
`styles.css` that draws the dash. Do **not** set the native `indeterminate` IDL property from an inline
`<script>`: it is invisible to readback and to any renderer that screenshots before scripts run, so the
variant would silently render identical to `unchecked`. The checker now rejects `<script>` in artifacts.
(`Puede ver datos sensibles`).

**Badge.html** — two families. Status dots: `Activo` (`.b-active`), `Ocasional` (`.b-occ`),
`Inactivo` (`.b-inactive`). Tag pills (`.tag`): `Cantos`, `Lecturas`, `Santa Cena`, `Ofrenda`,
`Recoger ofrenda`. Include the "derived hue" note for the status colours.

**Avatar.html** — initials `GD`, `SP`, `NV`, `MR` at sizes 28/32/44px, plus one image variant and one
with the `.star` gold favorite marker.

- [ ] **[IMPL] Step 2: Run the checker**

```bash
cd tasks/specs/design-system && node verify-artifacts.mjs --only primitives
```

Expected: `checked 7 artifact(s)` then `PASS`.

- [ ] **[IMPL] Step 3: Full-stack regression check (proves no production code moved)**

```bash
cd <worktree-root> && pnpm type-check && pnpm lint && pnpm test
```

Expected: all green — the diff is HTML/CSS/MD only. Any failure means something outside
`tasks/specs/` was touched; revert it.

- [ ] **[IMPL] Step 4: Commit and push**

```bash
git add tasks/specs/design-system/primitives/
git commit -m "feat(ICR-18): add core input primitives to the design system"
git push
```

- [ ] **[ORCH] Step 5: Publish and verify**

`DesignSync write_files` (reuse the Task 2 `planId`) with the seven `localPath` entries. Then
`get_file` each one: non-empty, contains `class="preview dark"`.

---

## Task 4: Primitives B — Table, Dialog, DropdownMenu, Tabs, Sidebar, Pagination, SegmentedToggle

**Files:**

- Create: `tasks/specs/design-system/primitives/Table.html`
- Create: `tasks/specs/design-system/primitives/Dialog.html`
- Create: `tasks/specs/design-system/primitives/DropdownMenu.html`
- Create: `tasks/specs/design-system/primitives/Tabs.html`
- Create: `tasks/specs/design-system/primitives/Sidebar.html`
- Create: `tasks/specs/design-system/primitives/Pagination.html`
- Create: `tasks/specs/design-system/primitives/SegmentedToggle.html`

**Interfaces:**

- Consumes: Task 1 classes; the Task 2 skeleton.
- Produces: `.table`/`thead`/`tbody`/`.dense`, `.dialog`+`.dialog-head`/`-body`/`-foot`, `.menu`+`.menu-item`,
  `.tabs`+`.tab`+`.tab.on`, `.sidebar`+`.nav-item`+`.nav-item.active`+`.nav-item.disabled`+`.soon`,
  `.pager`+`.pager button.on`, `.seg`+`.seg button.on`. Task 5–7 screens compose these.

- [ ] **[IMPL] Step 1: Author all seven, with these exact contents**

**Table.html** — headers `Nombre`, `Familia`, `Cumpleaños`, `País de origen`, `Áreas`,
`Participación`. Show: default row, `.dense` row, a sortable header (caret), a hovered row, a selected
row, and a separate **empty state** reading `Todavía no hay personas registradas.` with a
`Nueva persona` button. Use 3 sample rows: `Servando Peña` / `Familia Peña` / `14 mar` / `Argentina` /
`Cantos`+`Lecturas` / `Activo`; `Naibelis Vargas` / `Familia Vargas` / `2 jul` / `Venezuela` /
`Lecturas` / `Activo`; `Fernando Gil` / `—` / `28 feb` / `Argentina` / `Recoger ofrenda` / `Inactivo`.

**Dialog.html** — two variants side by side. Confirm: title `Eliminar persona`, body
`Esta acción no se puede deshacer. ¿Querés eliminar a Fernando Gil?`, footer `Cancelar` (outline) +
`Eliminar` (destructive). Form: title `Invitar usuario`, body an `Input` (label `Correo electrónico`)
and a `Select` (label `Rol`, options `Administrador`, `Líder`, `Colaborador`), footer `Cancelar` +
`Enviar invitación`. Render both over a `hsl(var(--foreground) / .45)` scrim — **flat, no gradient**.

**DropdownMenu.html** — the kebab in its **open** state, anchored under a `.kebab` trigger. Items:
`Ver detalles`, `Editar`, `Gestionar familia`, then a separator, then `Eliminar` (destructive text).

**Tabs.html** — 4 tabs: `Datos`, `Familia`, `Áreas`, `Notas`. Show active, hover and one disabled.

**Sidebar.html** — the full nav from v1, verbatim, in three groups:

- `Principal`: `Inicio`, `Personas` (active), `Familias`, `Actividades`, `Calendario`
- `Administración`: `Usuarios`, `Roles y permisos`, `Configuración`
- `Próximamente`: `Finanzas` + `.soon` `Pronto`, `Cultos` + `.soon` `Pronto` (both `.disabled`)
  Brand block: `.mark` `R`, name `IDC Redentor`, sub `Panel Ministerial`. Foot: avatar `GD`,
  `Gabriel Damalis` / `Administrador`. Also show the **collapsed icon-rail** variant.

**Pagination.html** — TWO labelled examples, because one pager cannot honestly show both the real
dataset and the truncation affordance:

1. `.ds-label` **`Conjunto real (52 personas)`** — count line `Mostrando 1–8 de 52 personas`, pager
   `‹ 1 2 3 4 5 6 7 ›` with `1` active. **No ellipsis**: 52 rows at 8 per page is exactly
   **7 pages** (`ceil(52/8)`), which fits without truncation.
2. `.ds-label` **`Conjunto grande (truncado)`** — count line `Mostrando 81–88 de 190 registros`,
   pager `‹ … 10 11 12 … 24 ›` with `11` active. This is the truncated form, on a deliberately
   domain-neutral count (`registros`) so it reads as an illustration of the pattern rather than a
   claim about the congregation.

⚠️ **Corrected 2026-07-27 (my error, not the implementer's).** The first draft specified
`‹ 1 2 3 … 16 ›` **together with** `de 52 personas` in the same sentence. `16` is v1's page count
(128 ÷ 8); with the corrected 52-person dataset it should be 7. The implementer transcribed both
faithfully, exactly as instructed. A design system that contradicts its own sample data on the very
component whose job is to count things is precisely the kind of carelessness this ticket exists to
replace — hence two coherent examples rather than one incoherent one.

**SegmentedToggle.html** — two instances: locale `ES`|`EN` (ES on, `title="Idioma / Language"`) and
theme `Claro`|`Oscuro`.

- [ ] **[IMPL] Step 2: Run the checker**

```bash
cd tasks/specs/design-system && node verify-artifacts.mjs --only primitives
```

Expected: `checked 14 artifact(s)` then `PASS` — all 14 primitives now exist.

- [ ] **[IMPL] Step 3: Commit and push**

```bash
git add tasks/specs/design-system/primitives/
git commit -m "feat(ICR-18): add layout and overlay primitives to the design system"
git push
```

- [ ] **[ORCH] Step 4: Publish and verify**

`write_files` the seven; `get_file` each: non-empty + `class="preview dark"`.

---

## Task 5: Anchor screen (People list) + Person detail

**Files:**

- Create: `tasks/specs/design-system/screens/people-list.html`
- Create: `tasks/specs/design-system/screens/person-detail.html`

**Interfaces:**

- Consumes: every Task 1/3/4 class. Read `primitives/Sidebar.html` and `primitives/Table.html` for the
  exact markup to compose.
- Produces: the **shell** (`.app` > `.sidebar` + `.main` > `.topbar` + `.content`) that Tasks 6–7 reuse
  for every authenticated screen.

- [ ] **[IMPL] Step 1: Author `people-list.html` — the anchor**

Re-render v1 in the system: same shell, same nav, same table, but using the Task 1/3/4 classes rather
than v1's bespoke CSS, **and** with the two Global-Constraints corrections — ≥44px hit areas and
`52 personas · 21 familias · 6 países de origen` as the sub-line.

Exact strings: `<h1>Personas</h1>`; crumb `Panel · <b>Personas</b>`; primary action `Nueva persona`;
search placeholder `Buscar por nombre, familia o teléfono…`; filters `Familia`, `Participación`,
`País`; table foot `Mostrando 1–8 de 52 personas`. Keep the 8 sample people, families, countries,
areas, statuses and the masked-PII row (`•••• ocultar PII`) exactly as in
`tasks/specs/design-mockups/people-list.html` lines 274–345.

Render the whole shell twice — light, then duplicated inside `.dark`.

- [ ] **[IMPL] Step 2: Author `person-detail.html`**

Same shell; crumb `Panel · Personas · <b>Servando Peña</b>`. Content = the `Tabs` primitive
(`Datos` active, `Familia`, `Áreas`, `Notas`) over a form card. Fields, per
`admin-design-prompt.md` §B item 5:

| Label                    | Control                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `Nombre completo`        | Input, value `Servando Peña`                                                                                |
| `Correo electrónico`     | Input, value `servando@idcredentor.com`                                                                     |
| `Teléfono`               | Input **masked** — `•••• ocultar PII` + a `Mostrar` ghost button, and a `.badge` reading `Requiere permiso` |
| `Fecha de nacimiento`    | Input `14/03` + a Checkbox `Sin año de nacimiento` (checked)                                                |
| `País de origen`         | Select, value `Argentina`                                                                                   |
| `Grupo familiar`         | Select, value `Familia Peña`                                                                                |
| `Relaciones`             | rows of `.tag` + role Select: `Cónyuge`, `Hijo/a`, `Padre/Madre`, `Hermano/a`                               |
| `Áreas de participación` | `.tag` set `Cantos`, `Lecturas` + an `Agregar área` ghost button                                            |
| `Participación`          | Select: `Activo` / `Ocasional` / `Inactivo`                                                                 |
| `Notas`                  | Textarea                                                                                                    |

Footer: `Guardar cambios` (primary) + `Cancelar` (outline). Below, subtle audit metadata:
`Última modificación: 12/07/2026 por Gabriel Damalis` in `.muted` at 11.5px.

- [ ] **[IMPL] Step 3: Run the checker**

```bash
cd tasks/specs/design-system && node verify-artifacts.mjs --only screens
```

Expected: `checked 2 artifact(s)` then `PASS`.

- [ ] **[IMPL] Step 4: Commit and push**

```bash
git add tasks/specs/design-system/screens/
git commit -m "feat(ICR-18): add the people-list anchor and person-detail screens"
git push
```

- [ ] **[ORCH] Step 5: Publish and verify**

`write_files` both; `get_file` each: non-empty, `class="preview dark"`, and `people-list.html`
contains `Mostrando 1–8 de 52 personas` (proving the sample-data correction landed, not v1's 128).

---

## Task 6: Users + Roles matrix + Sign-in

**Files:**

- Create: `tasks/specs/design-system/screens/users.html`
- Create: `tasks/specs/design-system/screens/roles-matrix.html`
- Create: `tasks/specs/design-system/screens/sign-in.html`

**Interfaces:**

- Consumes: the Task 5 shell (read `screens/people-list.html`); `Dialog`, `Table`, `Checkbox`, `Badge`,
  `Button`, `Input` primitives.
- Produces: nothing later tasks depend on.

- [ ] **[IMPL] Step 1: Author `users.html`**

Shell; crumb `Panel · <b>Usuarios</b>`; `<h1>Usuarios</h1>`; primary action `Invitar usuario`.
Table headers `Usuario`, `Correo electrónico`, `Rol`, `Estado`, `Último acceso`. Rows:

- `Gabriel Damalis` / `gabriel@idcredentor.com` / `Administrador` / `.b-active` `Activo` / `Hoy, 09:14`
- `Eric Castro` / `eric@idcredentor.com` / `Líder` / `.b-active` `Activo` / `Ayer, 18:02`
- `Vanessa Morales` / `vanessa@idcredentor.com` / `Colaborador` / `.b-occ` `Invitación pendiente` / `—`

Show the **invite Dialog open** over the table (reuse `Dialog.html`'s form variant verbatim).

- [ ] **[IMPL] Step 2: Author `roles-matrix.html`**

Shell; crumb `Panel · <b>Roles y permisos</b>`; `<h1>Roles y permisos</h1>`; action `Nuevo rol`.
A matrix table: **rows = permissions, columns = roles** (`Administrador`, `Líder`, `Colaborador`,
`Solo lectura`), cells = the Checkbox primitive. Group the permission rows under `.ds-label` group
headers so it reads as legible, not overwhelming (§B item 10):

- `Personas`: `Ver personas`, `Crear y editar personas`, `Ver datos sensibles (PII)`, `Eliminar personas`
- `Familias`: `Ver familias`, `Editar familias`
- `Actividades y calendario`: `Ver calendario`, `Crear actividades`, `Imprimir calendario`
- `Administración`: `Gestionar usuarios`, `Gestionar roles`, `Cambiar configuración`

Sensible defaults: Administrador all checked; Líder all except the four `Administración` rows and
`Eliminar personas`; Colaborador only the three `Ver…` rows + `Imprimir calendario`; Solo lectura only
`Ver personas`, `Ver familias`, `Ver calendario`. Mark `Ver datos sensibles (PII)` with a
`Sensible` badge.

- [ ] **[IMPL] Step 3: Author `sign-in.html`**

**No shell** (unauthenticated). Centered card, max-width 400px, on `hsl(var(--background))`. Contents
top to bottom: the `R` `.mark` brand block with `IDC Redentor` / `Panel Ministerial`;
`<h1>Iniciá sesión</h1>`; sub `Acceso solo por invitación.`; a `Continuar con Google` outline button;
a `.seg`-style divider reading `o`; Input `Correo electrónico`; Input `Contraseña`; a right-aligned
ghost link `¿Olvidaste tu contraseña?`; primary button `Iniciar sesión`. **No sign-up link** — the
product is invite-only. Calm and church-warm; no gradient.

- [ ] **[IMPL] Step 4: Run the checker**

```bash
cd tasks/specs/design-system && node verify-artifacts.mjs --only screens
```

Expected: `checked 5 artifact(s)` then `PASS`.

- [ ] **[IMPL] Step 5: Commit and push**

```bash
git add tasks/specs/design-system/screens/
git commit -m "feat(ICR-18): add the users, roles-matrix and sign-in screens"
git push
```

- [ ] **[ORCH] Step 6: Publish and verify**

`write_files` all three; `get_file` each: non-empty + `class="preview dark"`.

---

## Task 7: Calendar month view + A4 print calendar

**Files:**

- Create: `tasks/specs/design-system/screens/calendar-month.html`
- Create: `tasks/specs/design-system/screens/calendar-print-a4.html`

**Interfaces:**

- Consumes: the Task 5 shell; `Button`, `Badge`, `SegmentedToggle`.
- Produces: nothing later tasks depend on.

**Argentine-Spanish date vocabulary (use verbatim, lowercase as shown):**

- Months: `enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre`
- Day headers (Monday-first, as is standard in Argentina): `lun mar mié jue vie sáb dom`
- Abbreviated months (table/inline use): `ene feb mar abr may jun jul ago sep oct nov dic`

- [ ] **[IMPL] Step 1: Author `calendar-month.html`**

Shell; crumb `Panel · <b>Calendario</b>`; `<h1>julio 2026</h1>` with `‹` / `›` month-nav icon-buttons
and a `Hoy` outline button; a prominent primary action `Imprimir calendario`. A 7-column
`display: grid; gap` month grid, Monday-first, day headers as above. Overlay two entry kinds,
visually distinct **and** distinguishable without colour (per E8):

- **Birthdays** — `.badge` with a `.star` gold marker, e.g. `2 · Naibelis Vargas`, `5 · Dana López`
- **Activities** — `.tag` with a leading `▪`, e.g. `12 · Reunión de líderes`, `19 · Culto especial`,
  `26 · Almuerzo comunitario`

Include a legend: `★ Cumpleaños` · `▪ Actividad`. Render light + `.dark`.

- [ ] **[IMPL] Step 2: Author `calendar-print-a4.html` — print medium, NO dark variant**

This artifact is the one exception the checker knows about (`PRINT_ONLY`). It must contain:

```css
@page {
  size: A4;
  margin: 12mm;
}
@media print {
  .no-print {
    display: none;
  }
  body {
    background: #fff;
    color: #000;
  }
}
```

Layout: A4 portrait, width `186mm` content box. Header: the `R` mark, `IDC Redentor` and
`<h1>julio 2026</h1>`, plus `Calendario mensual` as a sub-line. The same Monday-first 7-column grid,
sized to fill one page. **Monochrome-safe:** birthdays render as `★ Naibelis Vargas`, activities as
`▪ Reunión de líderes` — never colour-only. Footer line:
`Iglesia de Cristo Redentor · Panel Ministerial`. Add a `.no-print` on-screen hint reading
`Vista previa de impresión — A4` so the file is reviewable in a browser.

**Must NOT contain any element with `class="… dark …"`** — the checker fails the task otherwise, and
that is correct: a printed sheet has no dark theme.

- [ ] **[IMPL] Step 3: Run the checker on everything**

```bash
cd tasks/specs/design-system && node verify-artifacts.mjs
```

Expected: `checked 22 artifact(s)` then `PASS` (1 foundations + 14 primitives + 7 screens).

- [ ] **[IMPL] Step 4: Prove the print exemption is real, not a hole (mutation check)**

Temporarily add `<div class="dark">x</div>` to `calendar-print-a4.html`, re-run the checker, and
confirm it fails with `print artifact must NOT ship a dark variant (spec R6)`. Then revert:

```bash
git checkout -- tasks/specs/design-system/screens/calendar-print-a4.html
git status --porcelain   # must show no modification to that file
```

This proves the `PRINT_ONLY` branch enforces rather than merely skips.

- [ ] **[IMPL] Step 5: Commit and push**

```bash
git add tasks/specs/design-system/screens/
git commit -m "feat(ICR-18): add the calendar month view and A4 print calendar"
git push
```

- [ ] **[ORCH] Step 6: Publish and verify**

`write_files` both. `get_file calendar-month.html` → non-empty + `class="preview dark"`.
`get_file calendar-print-a4.html` → non-empty, contains `size: A4`, and contains **no** `preview dark`.

---

## Task 8: The system doc + migration table

**Files:**

- Create: `docs/architecture/design-system.md`
- Modify: `CLAUDE.md` (add one line to the `docs/architecture/` index)
- Modify: `AGENTS.md` (add the same line — **both** files enumerate docs)

**Interfaces:**

- Consumes: the published project (for the id/URL) and every artifact authored in Tasks 2–7.
- Produces: the binding specification the follow-up code ticket implements against.

- [ ] **[IMPL] Step 1: Write `docs/architecture/design-system.md`**

Per the scribe standard, it must answer **what / why / constraints**. Required sections:

1. **What this is** — the shared design system for `apps/web` + `apps/admin`; where the artifacts live
   (repo path + Claude Design project name); that it is **hand-authored**, unlike the auto-synced
   "IDC Redentor" project which mirrors `apps/web` code.
2. **The token contract** — the palette is `packages/ui/src/tokens.css`, imported by both apps'
   `globals.css`. State the two things `tokens.css` does **not** make self-contained:
   `--font-outfit`/`--font-playfair` come from `next/font`, and `--background-image-community` is
   root-relative so the asset must exist in each consuming app's `public/`.
3. **Derived tokens to add** — `--gold` and the three status hues, with their light/dark values from
   this plan's Global Constraints. They are used by the design but absent from `tokens.css`.
4. **Target architecture** — copy §2 of the spec: primitives shared in `@idcr/ui`; feature/domain
   components (`SermonCard`, `BlogPostCard`, `ContactForm`, `CreedSection`) stay app-local because
   they are Contentful- and next-intl-coupled.
5. **The migration table** — one row per primitive:

   | Primitive | shadcn source | Radix dep | Target `@idcr/ui` path | `apps/web` today |
   | --------- | ------------- | --------- | ---------------------- | ---------------- |

   Fill `apps/web` today from the real tree: `Button`, `Input`, `Textarea`, `Label`, `Card`, `Toast`,
   `Dropdown`, `Divider`, `Typography`, `Container`, `IconCard`, `SectionHeader` exist (some
   folder+barrel, some flat); `Table`, `Dialog`, `Tabs`, `Select`, `Checkbox`, `Avatar`, `Badge`,
   `Pagination`, `SegmentedToggle`, `Sidebar` do **not** exist and are new.
   Use the **folder+barrel** layout (`button/Button.tsx` + `index.ts`) per
   `code-patterns-and-conventions.md` §9, not flat files.

6. **Implementation prerequisites** — the `@source "../../../../packages/ui";` directive required in
   **both** `apps/web/src/app/globals.css` and `apps/admin/src/app/globals.css`, with the explicit
   warning that omitting it renders components **unstyled with no error**. State that
   `transpilePackages` is **already declared in both apps** (`apps/web/next.config.ts:8`,
   `apps/admin/next.config.ts:7`) and needs no change. State that **no Tailwind JS preset** may be
   introduced — v4 is CSS-first and the shared preset is `tokens.css` itself.
7. **Known defects for the code ticket** — (a) `packages/ui/src/tokens.css:56-60` declares five tokens
   under dead Tailwind v3 namespaces (`--letter-spacing-snug`, `--font-size-2xs/3xl/4xl`,
   `--line-height-tighter`); v4 wants `--tracking-*`, `--text-*`, `--leading-*`. (b)
   `apps/web/src/components/ui/divider/Divider.tsx:18` gives the `vertical` variant `mx-2 h-full` on an
   `<hr>` with only border-_colour_ classes, so it renders as an invisible zero-width box. (c)
   `apps/admin/src/components/ui/button.tsx` is a flat file, diverging from the folder+barrel target.
8. **Deviations from the v1 prompt** — v1 shipped 30–38px interactive controls against its own stated
   ≥44px hit-target bar; this system standardises on ≥44px hit areas. v1's "128 personas · 34
   familias" contradicts the documented ~40–60-person congregation; artifacts use 52/21.
9. **i18n** — no locale keys ship with ICR-18; the implementing ticket needs
   `admin.people.*`, `admin.person.*`, `admin.calendar.*`, `admin.users.*`, `admin.roles.*`,
   `admin.auth.*`.

- [ ] **[IMPL] Step 2: Add the doc to BOTH indexes**

In `CLAUDE.md`'s `docs/architecture/` bullet list and in `AGENTS.md`'s equivalent list, add:

```markdown
- `design-system.md` — the shared design system for both apps: the token contract, derived tokens,
  the primitives-shared/features-local boundary, the per-primitive shadcn→`@idcr/ui` migration table,
  the `@source` scanner prerequisite, and the known token/Divider defects.
```

Updating only one file would leave the two startup docs disagreeing about what documentation exists
(lesson ICR-144 / ICR-149).

- [ ] **[IMPL] Step 3: Verify the doc index edit landed in both**

```bash
grep -c "design-system.md" CLAUDE.md AGENTS.md
```

Expected: `CLAUDE.md:1` and `AGENTS.md:1`. A `0` on either means the twin was missed.

- [ ] **[IMPL] Step 4: Full verification stack**

```bash
cd <worktree-root>
pnpm type-check && pnpm lint && pnpm test && pnpm build
npx prettier --check docs/architecture/design-system.md CLAUDE.md AGENTS.md \
  "tasks/specs/design-system/**/*.{css,mjs,md}"
cd tasks/specs/design-system && node verify-artifacts.mjs
```

Expected: stack green; prettier clean **on these files only** (a repo-wide `format:check` reports
~173 pre-existing unclean files — the gate is delta-vs-base, lesson ICR-109); checker `PASS` on 22.

- [ ] **[IMPL] Step 5: Commit and push**

```bash
git add docs/architecture/design-system.md CLAUDE.md AGENTS.md
git commit -m "docs(ICR-18): document the design system and its @idcr/ui migration path"
git push
```

- [ ] **[ORCH] Step 6: Final readback of the whole project**

`DesignSync list_files` → assert all 22 artifacts + `styles.css` + `README.md` are present. Spot-check
`get_file` on one artifact per group. Record the project URL for the PR body and the Jira comment.

---

## Self-review

**Spec coverage.** R1→T2S4 · R2/R3→T2S1 · R4→T3+T4 · R5→T5+T6+T7 · R6→T7S2 · R7→T8S1 · R8→T8S1§4 ·
R9→T3S3+T8S4 (regression gate) · R10→every task writes under `tasks/specs/design-system/` ·
R11→every `[ORCH]` readback step · R12→T8S1§7 · R13→the checker's `BANNED` list + T1S3.
Spec §2 prerequisites→T8S1§6. Spec §9 i18n→T8S1§9. Spec §10 no-changeset→Global Constraints.
Spec §12's 7 checkpoints map to Tasks 2–8 (Task 1 is the harness the spec folded into CP1).
Edge cases: E1→T2S4.1 · E2→T2S4.3 · E3→one `write_files` per task, all under 256 · E4→T2S1 keeps
foundations small · E5→checker's `.dark` assertion · E6→`checkStyles()`'s Outfit/Playfair assertion
on the shared stylesheet, plus each artifact's required `styles.css` link ·
E7→T7S2 · E8→T7S1+T7S2 monochrome markers · E9→verbatim strings in every task · E10→no task writes to
the existing project · E11→checker's EMPTY guard · E12→T8S1§5 divergence column.

**Placeholder scan.** No TBD/TODO. Every code step carries real code; every string is given verbatim;
the one "port these classes" instruction names the exact source file **and line range**
(`people-list.html:60-181`) plus the two required deltas.

**Type consistency.** Class names are declared once in Task 1's _Produces_ block and reused
identically thereafter: `.btn-outline` (v1's `.btn-ghost` renamed) is used as `.btn-outline` in Tasks
3, 5, 6; `.b-active`/`.b-occ`/`.b-inactive` consistent across Tasks 3, 4, 5, 6; `.seg`/`.pager`/`.kebab`
consistent Tasks 4–7. The checker's `PRINT_ONLY` path `screens/calendar-print-a4.html` matches the
filename created in Task 7 exactly.

**Gap found and fixed during review.** An earlier draft had the implementer publishing via
`DesignSync`, which it cannot do — every task now splits `[IMPL]`/`[ORCH]` explicitly.
