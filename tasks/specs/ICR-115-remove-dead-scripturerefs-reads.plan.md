# ICR-115 — Remove dead per-locale `scriptureRefs` reads from the predica featured-image path

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the dead `localeData.scriptureRefs` read (and the helper it orphans) from both predica featured-image twins, and relocate the surviving scripture derivation into the canonical Vitest-tested TypeScript file so the twins stay symmetric and the live path gains unit coverage.

**Architecture:** `apps/web/src/utils/predica/featuredCard.ts` is the canonical, Vitest-tested module of pure helpers; `.claude/scripts/predica/build-predica-featured.mjs` carries a **hand-synced JS copy** so it runs under plain Node ESM with no build step (the same convention as `helpers.ts` ↔ `build-predica-pdf.mjs`). The `.mjs` **cannot** import from the `.ts` file — parity is by hand, and this plan changes both sides in lockstep. Today the dead read lives in `pickPrimaryScripture` (both twins) and the live fallback lives in `deriveScripture` (**`.mjs` only** — it has no TS counterpart). After this change `deriveScripture` becomes the single scripture helper, defined canonically in TS and mirrored in the `.mjs`.

**Tech Stack:** TypeScript (strict), Node ESM, Vitest, pnpm + Turborepo, Playwright (used by the generator for PNG rendering only).

## Global Constraints

- **Package manager is `pnpm`.** Never `npm`/`yarn`. Commands run from the worktree root: `/Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-115`.
- **Conventional Commits**, header ≤ 100 chars, type `chore`, scope `ICR-115` — e.g. `chore(ICR-115): …`.
- **Never `git commit --no-verify`.** Husky + lint-staged (prettier + eslint) must pass on every commit.
- **DO NOT touch `.claude/scripts/predica/__fixtures__/sample-sermon.json`.** It is stale (legacy `scriptureRefs`, no structured `scriptureReferences`) and is the declared scope of sibling ticket **ICR-116**, which has an open worktree branched off the same commit. Touching it creates a merge collision. Its featured-card scripture line going blank after this change is **expected and accepted** — ICR-116 fixes the fixture.
- **DO NOT touch `.claude/scripts/predica/build-sermon-entry.mjs:362`.** That `scriptureRefs` hit is a log label for the structured `sermon.scriptureReferences` array, explicitly out of scope.
- **Both twins must stay behaviorally identical.** Every change to `featuredCard.ts` gets the same change in `build-predica-featured.mjs` in the same task.
- Repo conventions: prefer `??` over `||`; `interface` over `type` for object shapes; no classes; named exports; failures modeled as return values (`undefined` here), never thrown.
- Verification stack: `pnpm type-check`, `pnpm lint`, `pnpm test` (all must pass before any commit).

---

## File Structure

| File                                                 | Responsibility after this change                                                                                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/utils/predica/featuredCard.ts`         | Canonical pure helpers for the featured card. **Loses** `stripScriptureVersion` + `pickPrimaryScripture`; **gains** `deriveScripture` (+ a private `scalarToString` narrower).   |
| `apps/web/src/utils/predica/featuredCard.test.ts`    | Vitest coverage. **Loses** the `stripScriptureVersion` + `pickPrimaryScripture` describes; **gains** a `deriveScripture` describe.                                               |
| `.claude/scripts/predica/build-predica-featured.mjs` | Runtime generator. **Loses** both dead helpers; its existing `deriveScripture` is **replaced** by a hand-synced mirror of the TS version, relocated into the twin-helpers block. |

Untouched (explicitly): the fixture, `build-sermon-entry.mjs`, `build-predica-pdf.mjs`, `helpers.ts`, `sermonEntry.ts`.

## Background the implementer needs

**Why the read is dead.** PR #75 removed the per-locale `scriptureRefs` field from the writer/entry/PDF contract. Confirmed on current `main`: `SermonLocaleContent` (`apps/web/src/utils/predica/sermonEntry.ts:86-95`) and `SermonLocaleData` (`helpers.ts:24-28`) do not declare it; the `predica-writer` agent doc states it no longer emits it; and of the 7 real sermons in `tasks/predicas/*/sermon.json`, **all 7** carry structured `scriptureReferences` and the **4 written since 2026-06-28 carry zero `scriptureRefs`**.

**Why `stripScriptureVersion` dies too.** Its only caller in either twin is `pickPrimaryScripture` (verified by grep across `*.ts,*.tsx,*.mjs,*.js`). The structured path builds `"Book chapter:from-to"` from separate fields and never produces a trailing `(NVI)` parenthetical, so nothing needs stripping. Leaving it would trade one piece of dead code for another.

**The real data shape** (`SermonScriptureRef`, `sermonEntry.ts:64-77`) — chapter/verses are **top-level and stringly-typed**; book is **locale-nested**:

```jsonc
{
  "chapter": "13",
  "fromVerse": "31",
  "toVerse": "33",
  "es-AR": { "book": "Mateo", "verseContent": "…", "bibleVersion": "NVI" },
  "en-US": { "book": "Matthew", "verseContent": "…", "bibleVersion": "NIV" },
}
```

**The current `.mjs` implementation being replaced** (`build-predica-featured.mjs:340-356`):

```js
/** Derive a short scripture string from the es-AR locale (refs array, else structured). */
function deriveScripture(sermon) {
  const fromRefs = pickPrimaryScripture(sermon.locales?.[DEFAULT_LOCALE]); // ← the dead branch
  if (fromRefs) return fromRefs;
  const sr = Array.isArray(sermon.scriptureReferences)
    ? sermon.scriptureReferences[0]
    : undefined;
  if (sr && typeof sr === "object") {
    const loc = sr[DEFAULT_LOCALE] ?? sr;
    const book = loc.book ?? sr.book;
    const chapter = sr.chapter ?? loc.chapter;
    const from = sr.fromVerse ?? loc.fromVerse;
    const to = sr.toVerse ?? loc.toVerse;
    if (book && chapter != null && from != null) {
      return `${book} ${chapter}:${from}${to != null ? `-${to}` : ""}`;
    }
  }
  return undefined;
}
```

The `?? sr` / `?? loc` chains tolerate a **flat legacy ref shape** (book/chapter at the same level). Keep that tolerance — older `sermon.json` files are hand-editable external data.

**Two deliberate behavioral tightenings** (both on malformed input only; no real sermon is affected). Document them in the JSDoc and cover them with tests:

1. Old code accepted `chapter: ""` / `fromVerse: ""` (`"" != null` is true) and emitted `"Mateo :"`. New code requires non-empty values and returns `undefined`.
2. Old code emitted a dangling `"-"` for `toVerse: ""`. New code omits the range.

---

### Task 1: Canonical TypeScript helper + tests

**Files:**

- Modify: `apps/web/src/utils/predica/featuredCard.ts:39-63` (the whole `── Scripture helpers ──` section)
- Test: `apps/web/src/utils/predica/featuredCard.test.ts:2-42` (imports + the two obsolete describes)

**Interfaces:**

- Consumes: `SupportedLocale` (`"es-AR" | "en-US"`) — already imported at `featuredCard.ts:15`.
- Produces: `deriveScripture(sermon?: { scriptureReferences?: unknown } | null, locale?: SupportedLocale): string | undefined` — Task 2 mirrors this exact signature and semantics in JS.
- Removes: the exports `stripScriptureVersion` and `pickPrimaryScripture` (no non-test callers exist).

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/utils/predica/featuredCard.test.ts`, change the import block (lines 2-10) to drop the two dead helpers and add `deriveScripture`:

```ts
import { describe, it, expect } from "vitest";
import {
  FEATURED_WIDTH,
  FEATURED_HEIGHT,
  deriveScripture,
  composeImageBrief,
  titleFontSize,
  buildFeaturedCardHtml,
} from "./featuredCard";
```

Then **delete** the `describe("stripScriptureVersion", …)` block (lines 12-21) and the `describe("pickPrimaryScripture", …)` block (lines 23-42), and put this in their place:

```ts
describe("deriveScripture", () => {
  // The real sermon.json shape: chapter/verses top-level, book locale-nested.
  const matthew = {
    chapter: "13",
    fromVerse: "31",
    toVerse: "33",
    "es-AR": { book: "Mateo", verseContent: "…", bibleVersion: "NVI" },
    "en-US": { book: "Matthew", verseContent: "…", bibleVersion: "NIV" },
  };

  it("builds the reference from the locale-nested structured ref", () => {
    expect(deriveScripture({ scriptureReferences: [matthew] })).toBe(
      "Mateo 13:31-33",
    );
  });

  it("reads the book from the requested locale", () => {
    expect(deriveScripture({ scriptureReferences: [matthew] }, "en-US")).toBe(
      "Matthew 13:31-33",
    );
  });

  it("defaults to es-AR", () => {
    expect(deriveScripture({ scriptureReferences: [matthew] }, "es-AR")).toBe(
      deriveScripture({ scriptureReferences: [matthew] }),
    );
  });

  it("omits the range when toVerse is absent", () => {
    expect(
      deriveScripture({
        scriptureReferences: [
          { chapter: "27", fromVerse: "4", "es-AR": { book: "Salmo" } },
        ],
      }),
    ).toBe("Salmo 27:4");
  });

  it("uses only the first reference", () => {
    expect(
      deriveScripture({
        scriptureReferences: [
          { chapter: "1", fromVerse: "1", "es-AR": { book: "Juan" } },
          { chapter: "2", fromVerse: "2", "es-AR": { book: "Hechos" } },
        ],
      }),
    ).toBe("Juan 1:1");
  });

  it("tolerates a flat legacy ref shape with no locale nesting", () => {
    expect(
      deriveScripture({
        scriptureReferences: [
          { book: "Romanos", chapter: "8", fromVerse: "1" },
        ],
      }),
    ).toBe("Romanos 8:1");
  });

  it("accepts numeric chapter and verse values", () => {
    expect(
      deriveScripture({
        scriptureReferences: [
          {
            chapter: 8,
            fromVerse: 1,
            toVerse: 4,
            "es-AR": { book: "Romanos" },
          },
        ],
      }),
    ).toBe("Romanos 8:1-4");
  });

  it("returns undefined when there is nothing usable", () => {
    expect(deriveScripture({ scriptureReferences: [] })).toBeUndefined();
    expect(deriveScripture({})).toBeUndefined();
    expect(deriveScripture(null)).toBeUndefined();
    expect(deriveScripture(undefined)).toBeUndefined();
    expect(
      deriveScripture({ scriptureReferences: "Efesios 2:14" }),
    ).toBeUndefined();
    expect(deriveScripture({ scriptureReferences: [null] })).toBeUndefined();
  });

  it("returns undefined when a required part is missing or blank", () => {
    // no book
    expect(
      deriveScripture({
        scriptureReferences: [{ chapter: "2", fromVerse: "11" }],
      }),
    ).toBeUndefined();
    // blank chapter — old code emitted "Efesios :11"
    expect(
      deriveScripture({
        scriptureReferences: [
          { chapter: "", fromVerse: "11", "es-AR": { book: "Efesios" } },
        ],
      }),
    ).toBeUndefined();
    // blank fromVerse
    expect(
      deriveScripture({
        scriptureReferences: [
          { chapter: "2", fromVerse: "  ", "es-AR": { book: "Efesios" } },
        ],
      }),
    ).toBeUndefined();
  });

  it("omits a blank toVerse instead of emitting a dangling dash", () => {
    expect(
      deriveScripture({
        scriptureReferences: [
          {
            chapter: "2",
            fromVerse: "11",
            toVerse: "",
            "es-AR": { book: "Efesios" },
          },
        ],
      }),
    ).toBe("Efesios 2:11");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-115
pnpm --filter @idcr/web exec vitest run src/utils/predica/featuredCard.test.ts
```

Expected: FAIL — the file no longer compiles/imports because `deriveScripture` is not exported from `./featuredCard`.

- [ ] **Step 3: Implement in `featuredCard.ts`**

Replace the entire `// ── Scripture helpers ──` section (`featuredCard.ts:39-63`, i.e. both `stripScriptureVersion` and `pickPrimaryScripture`) with:

```ts
// ── Scripture helpers ───────────────────────────────────────────────────────

/**
 * The permissive shape `deriveScripture` reads. `sermon.json` is external,
 * hand-editable data, so every field is narrowed at runtime rather than trusted.
 * Real refs nest `book` under the locale key and keep chapter/verses top-level
 * (see SermonScriptureRef in ./sermonEntry); older files may be flat.
 */
interface ScriptureRefLike {
  book?: unknown;
  chapter?: unknown;
  fromVerse?: unknown;
  toVerse?: unknown;
  [key: string]: unknown;
}

/** Narrow an unknown scalar to a trimmed, non-empty string (numbers included). */
function scalarToString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Derive the short scripture string for the card meta line ("Mateo 13:31-33")
 * from the sermon's structured `scriptureReferences[0]`.
 *
 * This is the ONLY scripture source for the card. The per-locale `scriptureRefs`
 * array it used to prefer was removed from the writer/entry/PDF contract by
 * PR #75 and is no longer emitted by any data path (ICR-115).
 *
 * Stricter than the pre-ICR-115 code on malformed input only: a blank chapter or
 * fromVerse now yields `undefined` instead of a half-formed "Mateo :31", and a
 * blank toVerse no longer leaves a dangling "-". No real sermon is affected.
 *
 * Returns undefined when there is no usable reference — the caller omits the line.
 */
export function deriveScripture(
  sermon?: { scriptureReferences?: unknown } | null,
  locale: SupportedLocale = "es-AR",
): string | undefined {
  const refs = sermon?.scriptureReferences;
  const first = Array.isArray(refs) ? refs[0] : undefined;
  if (!first || typeof first !== "object") return undefined;

  const ref = first as ScriptureRefLike;
  const nested = ref[locale];
  const loc = (
    nested && typeof nested === "object" ? nested : ref
  ) as ScriptureRefLike;

  const book = scalarToString(loc.book ?? ref.book);
  const chapter = scalarToString(ref.chapter ?? loc.chapter);
  const fromVerse = scalarToString(ref.fromVerse ?? loc.fromVerse);
  const toVerse = scalarToString(ref.toVerse ?? loc.toVerse);

  if (!book || !chapter || !fromVerse) return undefined;
  return `${book} ${chapter}:${fromVerse}${toVerse ? `-${toVerse}` : ""}`;
}
```

Leave everything else in the file untouched — the `SupportedLocale` import at line 15 is still needed (it is also used by `CARD_LABELS` and `buildFeaturedCardHtml`).

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @idcr/web exec vitest run src/utils/predica/featuredCard.test.ts
```

Expected: PASS — all `deriveScripture` tests green, and the pre-existing `composeImageBrief` / `titleFontSize` / `buildFeaturedCardHtml` describes still green.

- [ ] **Step 5: Verify nothing else referenced the deleted exports**

```bash
grep -rn "stripScriptureVersion\|pickPrimaryScripture" \
  --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.js" . | grep -v node_modules
```

Expected: hits **only** in `.claude/scripts/predica/build-predica-featured.mjs` (Task 2 removes those). Zero hits under `apps/`. If anything else appears, stop and report.

- [ ] **Step 6: Run the full verification stack**

```bash
pnpm type-check && pnpm lint && pnpm test
```

Expected: all three pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/utils/predica/featuredCard.ts apps/web/src/utils/predica/featuredCard.test.ts
git commit -m "chore(ICR-115): drop dead scriptureRefs helpers, add tested deriveScripture to featuredCard"
```

---

### Task 2: Mirror the change in the runtime `.mjs` twin

**Files:**

- Modify: `.claude/scripts/predica/build-predica-featured.mjs:74-86` (the twin-helpers block) and `:340-356` (the old `deriveScripture`)

**Interfaces:**

- Consumes: the Task 1 signature `deriveScripture(sermon, locale = "es-AR")` — the JS copy must be behaviorally identical.
- Produces: nothing new for later tasks; the existing call site `const scripture = deriveScripture(sermon);` at line ~508 keeps working unchanged.

- [ ] **Step 1: Replace the dead helpers in the twin block**

In `.claude/scripts/predica/build-predica-featured.mjs`, delete `stripScriptureVersion` (lines 75-78) and `pickPrimaryScripture` (lines 80-86) from the `// ── Pure helpers (twin of featuredCard.ts) ──` section, and put the mirrored derivation there instead:

```js
/** Narrow an unknown scalar to a trimmed, non-empty string (numbers included). */
function scalarToString(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * Derive the short scripture string for the card meta line ("Mateo 13:31-33")
 * from the sermon's structured `scriptureReferences[0]`.
 *
 * The per-locale `scriptureRefs` array this used to prefer was removed from the
 * writer/entry/PDF contract by PR #75 and is no longer emitted (ICR-115).
 */
export function deriveScripture(sermon, locale = "es-AR") {
  const refs = sermon?.scriptureReferences;
  const first = Array.isArray(refs) ? refs[0] : undefined;
  if (!first || typeof first !== "object") return undefined;

  const nested = first[locale];
  const loc = nested && typeof nested === "object" ? nested : first;

  const book = scalarToString(loc.book ?? first.book);
  const chapter = scalarToString(first.chapter ?? loc.chapter);
  const fromVerse = scalarToString(first.fromVerse ?? loc.fromVerse);
  const toVerse = scalarToString(first.toVerse ?? loc.toVerse);

  if (!book || !chapter || !fromVerse) return undefined;
  return `${book} ${chapter}:${fromVerse}${toVerse ? `-${toVerse}` : ""}`;
}
```

Note the twin **exports** `deriveScripture` (the old private one did not) so Step 3 can import it directly; this matches how every other pure helper in that block is exported.

- [ ] **Step 2: Delete the old `deriveScripture`**

Remove the whole block at lines ~340-356 — the JSDoc `/** Derive a short scripture string from the es-AR locale (refs array, else structured). */` and the `function deriveScripture(sermon) { … }` it documents. Do **not** touch the neighbouring `validateSermon` function or the `const DEFAULT_LOCALE = "es-AR";` declaration (still used by `validateSermon`). Leave the call site at line ~508 (`const scripture = deriveScripture(sermon);`) exactly as it is.

- [ ] **Step 3: Prove twin parity against real sermon data**

The `.mjs` cannot import the `.ts`, so parity is proven by running both over the same inputs.

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-115
node --input-type=module -e '
import { readFile } from "node:fs/promises";
import { deriveScripture } from "./.claude/scripts/predica/build-predica-featured.mjs";
const dirs = [
  "2026-06-07_el-deseo-mas-profundo-de-dios",
  "2026-06-28_consuelo-venezuela",
  "2026-07-19_el-dios-que-nos-ve-en-el-desierto",
  "2026-07-26_ser-discipulo-del-reino-de-los-cielos",
];
for (const d of dirs) {
  const p = `/Users/gabriel/repos/idc-redentor-platform/tasks/predicas/${d}/sermon.json`;
  const s = JSON.parse(await readFile(p, "utf8"));
  console.log(d, "| es-AR:", deriveScripture(s), "| en-US:", deriveScripture(s, "en-US"));
}
'
```

Expected: a real, non-`undefined` reference for **every** sermon in both locales (e.g. `Mateo 13:31-33` / `Matthew 13:31-33`). A single `undefined` means the structured fallback is not covering a real input — stop and report rather than proceeding.

Then confirm the TS twin agrees on the same inputs:

```bash
pnpm --filter @idcr/web exec vitest run src/utils/predica/featuredCard.test.ts
```

- [ ] **Step 4: Render a real featured card and confirm the scripture line**

```bash
mkdir -p "$CLAUDE_JOB_DIR/tmp/icr115"
node .claude/scripts/predica/build-predica-featured.mjs \
  /Users/gabriel/repos/idc-redentor-platform/tasks/predicas/2026-07-26_ser-discipulo-del-reino-de-los-cielos/sermon.json \
  --no-ai --out "$CLAUDE_JOB_DIR/tmp/icr115"
ls -la "$CLAUDE_JOB_DIR/tmp/icr115"
```

Expected: exit 0 and a `featured.png`. **Open the PNG with the Read tool** and confirm the meta line reads `Mateo 13:31-33 · <preacher>`. This is the direct evidence for the ticket's AC "the featured-image scripture line still renders correctly, sourced from `sermon.scriptureReferences`". If Chromium is missing, run `pnpm exec playwright install chromium` first.

- [ ] **Step 5: Confirm the committed-fixture smoke still passes**

```bash
pnpm predica:smoke
```

Expected: exit 0. The fixture's card will now render **without** a scripture line (it has legacy `scriptureRefs` and no structured `scriptureReferences`) — that is expected and is ICR-116's to fix. The smoke asserts only that `featured.png` exists and is ≥1024 bytes, so it stays green. Do not "fix" the fixture here.

- [ ] **Step 6: Confirm no docs or changeset follow-up is needed**

```bash
grep -rn "pickPrimaryScripture\|stripScriptureVersion\|scriptureRefs" docs/ | grep -v node_modules
cat .changeset/config.json
```

- If any `docs/architecture/predica-*.md` describes the removed helpers or the per-locale `scriptureRefs` field as current, note the exact file+line and report it to the orchestrator (the `/work` docs-evaluation step decides; do **not** silently edit docs).
- Read the changeset config rather than assuming: this is a `chore` dead-code removal with no consumer-visible behavior change, so the expectation is **no changeset**. If the config's mapping contradicts that, report it instead of guessing.

- [ ] **Step 7: Run the full verification stack**

```bash
pnpm type-check && pnpm lint && pnpm test
```

Expected: all three pass.

- [ ] **Step 8: Commit**

```bash
git add .claude/scripts/predica/build-predica-featured.mjs
git commit -m "chore(ICR-115): mirror deriveScripture cleanup in the featured-image runtime twin"
```

---

## Acceptance criteria → coverage map

| AC (from ICR-115)                                                                                    | Where it is satisfied                                                                             |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| No read of a per-locale `scriptureRefs` remains in `featuredCard.ts` or `build-predica-featured.mjs` | Task 1 Step 3 + Task 2 Steps 1-2; verified by the grep in Task 1 Step 5 (re-run after Task 2)     |
| Featured-image scripture line still renders, sourced from `sermon.scriptureReferences`               | Task 2 Step 3 (both twins over 4 real sermons) + Task 2 Step 4 (rendered PNG, visually confirmed) |
| `pnpm type-check && pnpm lint && pnpm test` pass                                                     | Task 1 Step 6, Task 2 Step 7                                                                      |
| TS helper and `.mjs` twin stay behaviorally in sync                                                  | Same signature + same body in Task 1 Step 3 / Task 2 Step 1; parity proven in Task 2 Step 3       |

## Self-review notes

- **Signature consistency:** `deriveScripture(sermon, locale = "es-AR")` and the private `scalarToString(value)` are named and shaped identically in Task 1 (TS) and Task 2 (JS). The `.mjs` adds `export`; the TS keeps `scalarToString` private (not exported, not tested directly — it is exercised through `deriveScripture`).
- **No orphans:** after both tasks, `grep` for `stripScriptureVersion|pickPrimaryScripture` must return zero hits repo-wide. `DEFAULT_LOCALE` in the `.mjs` survives because `validateSermon` still uses it.
- **Scope discipline:** the fixture and `build-sermon-entry.mjs` are named in the Global Constraints as untouchable, and Task 2 Step 5 explicitly forbids "fixing" the fixture when its card loses the scripture line.
