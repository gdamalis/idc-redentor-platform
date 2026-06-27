# Contentful Workflow v2 Implementation Plan

> **Historical artifact** — paths and commands below predate the `apps/web/` monorepo migration (app code and `scripts/contentful/` are now under `apps/web/`). Kept as a record; do not run verbatim.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tool + document + re-point the Contentful workflow on the final `master`→`production` + `staging` topology: build `scripts/contentful/sync-entries.mjs` (free-tier entry/asset promotion), re-point `/predica` to production (draft-only), add a report-only drift detector, and rewrite `docs/contentful-environments.md` as the canonical doc.

**Architecture:** A single ESM CLI script (`sync-entries.mjs`) using the `contentful-management` plain client, with pure helpers (arg parsing, diff, model-compat, publish policy) exported for unit tests and a guarded `main()` doing the CMA I/O. Everything else is config/doc edits plus one GitHub Actions workflow. The `/predica` write path is unchanged in mechanism (two committed CMA scripts) — only the target env and guard messaging change.

**Tech Stack:** Node 22.14.0 (ESM `.mjs`), `contentful-management` (plain client), Vitest (jsdom), GitHub Actions, Contentful CMA REST.

## Global Constraints

- Package manager: **pnpm**. Type-check script is **hyphenated**: `pnpm type-check`.
- Conventional Commits, header ≤ 100 chars. Commitlint wants a **blank line before the footer**.
- Default site locale `es-AR`, secondary `en-US` (not directly relevant here, but locale-complete data is copied verbatim).
- Space id: `vg9le24yw8hb`. Tokens by **name only**, never values: `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` (CMA), `CONTENTFUL_REVALIDATE_SECRET`, `NEXT_PUBLIC_BASE_URL`.
- Final topology: `master` **alias** → `production` (live); `staging` (work env). Free tier = 2 envs.
- Mental model: **content lives in production; models are forged in staging. Content flows down (prod→staging) to refresh; models flow up (staging→prod) at cutover.**
- Safety: scripts **refuse the `master` alias** by name; **dry-run is the default** for the sync tool; `--to production` needs `--apply` + confirm.
- The husky pre-commit runs lint-staged (prettier); deps are installed in this worktree already.

---

### Task 1: Sync tool — pure helpers (TDD) + Vitest wiring

**Files:**

- Modify: `vitest.config.ts:11` (add a `scripts/**` test glob)
- Create: `scripts/contentful/sync-entries.mjs` (helpers + guarded `main` stub)
- Test: `scripts/contentful/sync-entries.test.mjs`

**Interfaces:**

- Produces (named exports consumed by Task 2 + the test):
  - `parseArgs(argv: string[]) -> Opts` where `Opts = { from, to, apply, contentTypes:string[], ids:string[]|null, publish, allowDeletes, force, assets, modelCheck, revalidate:boolean }`
  - `assertGuards(opts: Opts) -> void` (throws on the `master` alias or `from===to`)
  - `canonical(value:any) -> string` (key-order-independent JSON)
  - `diffById(source: Item[], target: Item[]) -> { created:Item[], changed:{source,target}[], unchanged:{source,target}[], deleted:Item[] }` where `Item = { id, fields, published:boolean, updatedAt:string }`
  - `compareContentTypes(sourceTypes: CT[], targetTypes: CT[], typeIds: string[]|null) -> { compatible:boolean, problems:string[] }` where `CT = { id, fields:[{id,type,linkType?,required?,items?}] }`
  - `resolvePublishAction({ direction:'promote'|'refresh', sourcePublished:boolean, publishFlag:boolean }) -> 'publish'|'draft'|'leave'`
  - `directionOf(opts) -> 'promote'|'refresh'`

- [ ] **Step 1: Add the scripts test glob to Vitest**

In `vitest.config.ts`, change the `include` line (line 11) from:

```ts
    include: ["src/**/*.{test,spec}.{ts,tsx}", "lib/**/*.{test,spec}.{ts,tsx}"],
```

to:

```ts
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "lib/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.mjs",
    ],
```

- [ ] **Step 2: Write the failing test**

Create `scripts/contentful/sync-entries.test.mjs`:

```js
import { describe, it, expect } from "vitest";
import {
  parseArgs,
  assertGuards,
  canonical,
  diffById,
  compareContentTypes,
  resolvePublishAction,
  directionOf,
} from "./sync-entries.mjs";

describe("parseArgs", () => {
  it("defaults to production -> staging dry-run", () => {
    const o = parseArgs([]);
    expect(o.from).toBe("production");
    expect(o.to).toBe("staging");
    expect(o.apply).toBe(false);
    expect(o.revalidate).toBe(false); // auto off when target !== production
  });

  it("parses direction, ids, content-type, and apply", () => {
    const o = parseArgs([
      "--from",
      "staging",
      "--to",
      "production",
      "--ids",
      "a, b ,c",
      "--content-type",
      "sermon",
      "--apply",
    ]);
    expect(o.from).toBe("staging");
    expect(o.to).toBe("production");
    expect(o.ids).toEqual(["a", "b", "c"]);
    expect(o.contentTypes).toEqual(["sermon"]);
    expect(o.apply).toBe(true);
    expect(o.revalidate).toBe(true); // auto on when target === production
  });

  it("honours --no-revalidate and --no-assets and --skip-model-check", () => {
    const o = parseArgs([
      "--to",
      "production",
      "--no-revalidate",
      "--no-assets",
      "--skip-model-check",
    ]);
    expect(o.revalidate).toBe(false);
    expect(o.assets).toBe(false);
    expect(o.modelCheck).toBe(false);
  });

  it("throws on unknown flags and bare args", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown flag/);
    expect(() => parseArgs(["bare"])).toThrow(/unexpected argument/);
  });
});

describe("assertGuards", () => {
  it("refuses the master alias on either side", () => {
    expect(() => assertGuards({ from: "master", to: "staging" })).toThrow(
      /master/,
    );
    expect(() => assertGuards({ from: "staging", to: "master-0.0.1" })).toThrow(
      /master/,
    );
  });
  it("refuses identical envs", () => {
    expect(() => assertGuards({ from: "staging", to: "staging" })).toThrow(
      /differ/,
    );
  });
  it("allows production <-> staging", () => {
    expect(() =>
      assertGuards({ from: "production", to: "staging" }),
    ).not.toThrow();
    expect(() =>
      assertGuards({ from: "staging", to: "production" }),
    ).not.toThrow();
  });
});

describe("canonical", () => {
  it("is key-order independent", () => {
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }));
    expect(canonical({ a: 1 })).not.toBe(canonical({ a: 2 }));
  });
});

describe("diffById", () => {
  const item = (
    id,
    fields,
    published = false,
    updatedAt = "2026-01-01T00:00:00Z",
  ) => ({ id, fields, published, updatedAt });
  it("classifies created / changed / unchanged / deleted", () => {
    const source = [
      item("keep", { t: 1 }),
      item("edit", { t: 2 }),
      item("new", { t: 3 }),
    ];
    const target = [
      item("keep", { t: 1 }),
      item("edit", { t: 99 }),
      item("gone", { t: 0 }),
    ];
    const d = diffById(source, target);
    expect(d.created.map((i) => i.id)).toEqual(["new"]);
    expect(d.changed.map((i) => i.source.id)).toEqual(["edit"]);
    expect(d.unchanged.map((i) => i.source.id)).toEqual(["keep"]);
    expect(d.deleted.map((i) => i.id)).toEqual(["gone"]);
  });
  it("treats a publish-state change as changed", () => {
    const source = [item("x", { t: 1 }, true)];
    const target = [item("x", { t: 1 }, false)];
    expect(diffById(source, target).changed.map((i) => i.source.id)).toEqual([
      "x",
    ]);
  });
});

describe("compareContentTypes", () => {
  const ct = (id, fields) => ({ id, fields });
  const f = (id, type, extra = {}) => ({ id, type, ...extra });
  it("passes when shapes match", () => {
    const s = [
      ct("sermon", [
        f("title", "Symbol"),
        f("preacher", "Link", { linkType: "Entry" }),
      ]),
    ];
    const t = [
      ct("sermon", [
        f("title", "Symbol"),
        f("preacher", "Link", { linkType: "Entry" }),
      ]),
    ];
    expect(compareContentTypes(s, t, null).compatible).toBe(true);
  });
  it("flags a missing type", () => {
    const r = compareContentTypes([ct("sermon", [])], [], ["sermon"]);
    expect(r.compatible).toBe(false);
    expect(r.problems[0]).toMatch(/missing in target/);
  });
  it("flags a missing field and a shape difference", () => {
    const s = [ct("sermon", [f("title", "Symbol"), f("body", "Text")])];
    const t = [ct("sermon", [f("title", "Text")])];
    const r = compareContentTypes(s, t, ["sermon"]);
    expect(r.compatible).toBe(false);
    expect(r.problems.some((p) => /field 'body' missing/.test(p))).toBe(true);
    expect(r.problems.some((p) => /field 'title' shape differs/.test(p))).toBe(
      true,
    );
  });
});

describe("resolvePublishAction", () => {
  it("promote: draft by default, publish with the flag", () => {
    expect(
      resolvePublishAction({
        direction: "promote",
        sourcePublished: true,
        publishFlag: false,
      }),
    ).toBe("draft");
    expect(
      resolvePublishAction({
        direction: "promote",
        sourcePublished: true,
        publishFlag: true,
      }),
    ).toBe("publish");
  });
  it("refresh: mirrors source state", () => {
    expect(
      resolvePublishAction({
        direction: "refresh",
        sourcePublished: true,
        publishFlag: false,
      }),
    ).toBe("publish");
    expect(
      resolvePublishAction({
        direction: "refresh",
        sourcePublished: false,
        publishFlag: false,
      }),
    ).toBe("leave");
  });
});

describe("directionOf", () => {
  it("is promote only when targeting production", () => {
    expect(directionOf({ to: "production" })).toBe("promote");
    expect(directionOf({ to: "staging" })).toBe("refresh");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test -- scripts/contentful/sync-entries.test.mjs`
Expected: FAIL — cannot resolve `./sync-entries.mjs` (module does not exist yet).

- [ ] **Step 4: Implement the helpers + guarded main stub**

Create `scripts/contentful/sync-entries.mjs`:

```js
#!/usr/bin/env node
/**
 * sync-entries.mjs — Copy entries + assets between two Contentful environments
 * via the CMA. The free-tier replacement for Contentful Launch (paid) and the
 * complement to the Merge app (which moves the content MODEL only, never entries).
 *
 * Mental model (docs/contentful-environments.md): content lives in production;
 * models are forged in staging. Content flows DOWN (production -> staging) to
 * refresh; entries are promoted UP (staging -> production) only at a model
 * cutover. Default direction is the refresh: production -> staging.
 *
 * SAFETY:
 *   - Dry-run is the DEFAULT. Writes require --apply.
 *   - Refuses the `master` alias by name (sync env ids, never the alias).
 *   - `--to production` requires --apply AND a typed confirmation
 *     (or CONTENTFUL_SYNC_ASSUME_YES=1 for non-interactive promotion).
 *   - Model-compatibility gate aborts if a copied type is missing or shaped
 *     differently in the target (unless --skip-model-check).
 *   - Conflict guard: never overwrites a target item edited more recently than
 *     the source without --force.
 *
 * Publish policy:
 *   - production -> staging (refresh): MIRROR the source publish state.
 *   - staging -> production (promote): create as DRAFT; publish only with --publish.
 *
 * Usage:
 *   node scripts/contentful/sync-entries.mjs                 # dry-run prod->staging
 *   node scripts/contentful/sync-entries.mjs --apply         # apply prod->staging refresh
 *   node scripts/contentful/sync-entries.mjs --from staging --to production --ids a,b --apply
 *
 * Env: CONTENTFUL_SPACE_ID, CONTENTFUL_MANAGEMENT_ACCESS_TOKEN,
 *      (optional) NEXT_PUBLIC_BASE_URL + CONTENTFUL_REVALIDATE_SECRET for revalidate.
 */
import { createClient } from "contentful-management";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline";

// ============================ pure helpers (unit-tested) ============================

export function parseArgs(argv) {
  const opts = {
    from: "production",
    to: "staging",
    apply: false,
    contentTypes: [],
    ids: null,
    publish: false,
    allowDeletes: false,
    force: false,
    assets: true,
    modelCheck: true,
    revalidate: null, // null => auto: on when target === production
  };
  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (!tok.startsWith("--")) throw new Error(`unexpected argument: ${tok}`);
    const key = tok.slice(2);
    if (key === "from") opts.from = argv[(i += 1)];
    else if (key === "to") opts.to = argv[(i += 1)];
    else if (key === "content-type") opts.contentTypes.push(argv[(i += 1)]);
    else if (key === "ids")
      opts.ids = argv[(i += 1)]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (key === "apply") opts.apply = true;
    else if (key === "publish") opts.publish = true;
    else if (key === "allow-deletes") opts.allowDeletes = true;
    else if (key === "force") opts.force = true;
    else if (key === "no-assets") opts.assets = false;
    else if (key === "skip-model-check") opts.modelCheck = false;
    else if (key === "revalidate") opts.revalidate = true;
    else if (key === "no-revalidate") opts.revalidate = false;
    else throw new Error(`unknown flag: --${key}`);
  }
  if (opts.revalidate === null) opts.revalidate = opts.to === "production";
  return opts;
}

const ALIAS_RE = /^master(-|$)/;

export function assertGuards(opts) {
  if (opts.from === opts.to)
    throw new Error(`--from and --to must differ (both '${opts.from}')`);
  for (const [flag, env] of [
    ["--from", opts.from],
    ["--to", opts.to],
  ]) {
    if (ALIAS_RE.test(env)) {
      throw new Error(
        `refusing to sync the '${env}' alias via ${flag}; pass an environment id (production|staging), never the master alias`,
      );
    }
  }
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function diffById(sourceItems, targetItems) {
  const target = new Map(targetItems.map((t) => [t.id, t]));
  const created = [];
  const changed = [];
  const unchanged = [];
  const seen = new Set();
  for (const s of sourceItems) {
    seen.add(s.id);
    const t = target.get(s.id);
    if (!t) {
      created.push(s);
      continue;
    }
    const differs =
      canonical(s.fields) !== canonical(t.fields) ||
      !!s.published !== !!t.published;
    (differs ? changed : unchanged).push({ source: s, target: t });
  }
  const deleted = targetItems.filter((t) => !seen.has(t.id));
  return { created, changed, unchanged, deleted };
}

export function compareContentTypes(sourceTypes, targetTypes, typeIds) {
  const sMap = new Map(sourceTypes.map((t) => [t.id, t]));
  const tMap = new Map(targetTypes.map((t) => [t.id, t]));
  const problems = [];
  const ids =
    typeIds && typeIds.length ? typeIds : sourceTypes.map((t) => t.id);
  const sig = (f) =>
    `${f.type}/${f.linkType ?? "-"}/${f.items?.type ?? "-"}/${f.items?.linkType ?? "-"}`;
  for (const id of ids) {
    const s = sMap.get(id);
    if (!s) continue; // source has no such type — nothing to copy for it
    const t = tMap.get(id);
    if (!t) {
      problems.push(`content type '${id}' is missing in target`);
      continue;
    }
    const tf = new Map(t.fields.map((f) => [f.id, f]));
    for (const sf of s.fields) {
      const mf = tf.get(sf.id);
      if (!mf) {
        problems.push(`type '${id}': field '${sf.id}' missing in target`);
        continue;
      }
      if (sig(sf) !== sig(mf)) {
        problems.push(
          `type '${id}': field '${sf.id}' shape differs (source ${sig(sf)} vs target ${sig(mf)})`,
        );
      }
    }
  }
  return { compatible: problems.length === 0, problems };
}

export function resolvePublishAction({
  direction,
  sourcePublished,
  publishFlag,
}) {
  if (direction === "promote") return publishFlag ? "publish" : "draft";
  return sourcePublished ? "publish" : "leave"; // refresh: mirror source
}

export function directionOf(opts) {
  return opts.to === "production" ? "promote" : "refresh";
}

// ============================ CMA I/O (integration; smoke-tested) ============================

const ctOf = (entry) => entry?.sys?.contentType?.sys?.id;
const isPublished = (sys) => Boolean(sys?.publishedVersion);
const toEntryItem = (e) => ({
  id: e.sys.id,
  fields: e.fields,
  published: isPublished(e.sys),
  updatedAt: e.sys.updatedAt,
  contentType: ctOf(e),
  raw: e,
});
const toAssetItem = (a) => ({
  id: a.sys.id,
  fields: a.fields,
  published: isPublished(a.sys),
  updatedAt: a.sys.updatedAt,
  raw: a,
});

async function getAll(fn, args) {
  const out = [];
  let skip = 0;
  for (;;) {
    const r = await fn({
      ...args,
      query: { ...(args.query ?? {}), limit: 100, skip },
    });
    out.push(...r.items);
    if (skip + 100 >= r.total) break;
    skip += 100;
  }
  return out;
}

async function fetchEntries(client, base, opts) {
  const query = {};
  if (opts.contentTypes.length === 1) query.content_type = opts.contentTypes[0];
  if (opts.ids) query["sys.id[in]"] = opts.ids.join(",");
  let items = await getAll((a) => client.entry.getMany(a), { ...base, query });
  if (opts.contentTypes.length > 1) {
    const set = new Set(opts.contentTypes);
    items = items.filter((e) => set.has(ctOf(e)));
  }
  return items;
}

async function fetchAssets(client, base, opts) {
  const query = {};
  if (opts.ids) query["sys.id[in]"] = opts.ids.join(",");
  return getAll((a) => client.asset.getMany(a), { ...base, query });
}

async function fetchContentTypes(client, base) {
  return getAll((a) => client.contentType.getMany(a), base);
}

async function upsertAsset(client, base, source, action) {
  const fields = JSON.parse(JSON.stringify(source.fields));
  for (const f of Object.values(fields.file ?? {})) {
    if (f?.url) {
      f.upload = f.url.startsWith("//") ? `https:${f.url}` : f.url;
      delete f.url;
      delete f.details;
    }
  }
  let target = null;
  try {
    target = await client.asset.get({ ...base, assetId: source.sys.id });
  } catch {
    target = null;
  }
  let saved;
  if (!target) {
    saved = await client.asset.createWithId(
      { ...base, assetId: source.sys.id },
      { fields },
    );
  } else {
    target.fields = fields;
    saved = await client.asset.update(
      { ...base, assetId: source.sys.id },
      target,
    );
  }
  saved = await client.asset.processForAllLocales(base, saved);
  if (action === "publish") {
    const fresh = await client.asset.get({ ...base, assetId: saved.sys.id });
    await client.asset.publish({ ...base, assetId: saved.sys.id }, fresh);
  }
  return saved;
}

async function upsertEntry(client, base, source, action) {
  const contentTypeId = ctOf(source);
  let target = null;
  try {
    target = await client.entry.get({ ...base, entryId: source.sys.id });
  } catch {
    target = null;
  }
  let saved;
  if (!target) {
    saved = await client.entry.createWithId(
      { ...base, entryId: source.sys.id, contentTypeId },
      { fields: source.fields },
    );
  } else {
    target.fields = source.fields;
    saved = await client.entry.update(
      { ...base, entryId: source.sys.id },
      target,
    );
  }
  if (action === "publish") {
    await client.entry.publish({ ...base, entryId: saved.sys.id }, saved);
  }
  return saved;
}

async function confirmProd(opts) {
  if (opts.to !== "production") return true;
  if (process.env.CONTENTFUL_SYNC_ASSUME_YES === "1") return true;
  if (!process.stdin.isTTY) {
    throw new Error(
      "--to production requires a TTY confirmation or CONTENTFUL_SYNC_ASSUME_YES=1",
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) =>
    rl.question(
      `Apply changes to PRODUCTION (${opts.from} -> production)? type 'yes': `,
      res,
    ),
  );
  rl.close();
  return answer.trim() === "yes";
}

async function revalidate() {
  const base = process.env.NEXT_PUBLIC_BASE_URL;
  const secret = process.env.CONTENTFUL_REVALIDATE_SECRET;
  if (!base || !secret) {
    console.warn(
      "revalidate skipped: NEXT_PUBLIC_BASE_URL or CONTENTFUL_REVALIDATE_SECRET unset",
    );
    return;
  }
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/revalidate`, {
      method: "POST",
      headers: { "x-vercel-reval-key": secret },
    });
    console.log(`revalidate -> ${res.status} ${res.statusText}`);
  } catch (e) {
    console.warn(`revalidate failed (non-fatal): ${e.message}`);
  }
}

function report(label, diff) {
  console.log(
    `\n${label}: ${diff.created.length} new, ${diff.changed.length} changed, ${diff.unchanged.length} unchanged, ${diff.deleted.length} only-in-target`,
  );
  for (const i of diff.created)
    console.log(
      `  [new]     ${i.id}${i.contentType ? ` (${i.contentType})` : ""}`,
    );
  for (const c of diff.changed)
    console.log(
      `  [changed] ${c.source.id}${c.source.contentType ? ` (${c.source.contentType})` : ""}`,
    );
  for (const i of diff.deleted)
    console.log(`  [target]  ${i.id} (absent in source)`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  assertGuards(opts);

  const spaceId = process.env.CONTENTFUL_SPACE_ID;
  const token = process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN;
  if (!spaceId || !token) {
    console.error(
      "error: CONTENTFUL_SPACE_ID and CONTENTFUL_MANAGEMENT_ACCESS_TOKEN are required",
    );
    process.exit(2);
  }
  const client = createClient({ accessToken: token }, { type: "plain" });
  const src = { spaceId, environmentId: opts.from };
  const dst = { spaceId, environmentId: opts.to };
  const direction = directionOf(opts);
  console.log(
    `sync-entries: ${opts.from} -> ${opts.to} (${direction})${opts.apply ? " [APPLY]" : " [dry-run]"}`,
  );

  // 1. Model-compatibility gate.
  if (opts.modelCheck) {
    const [sCT, tCT] = await Promise.all([
      fetchContentTypes(client, src),
      fetchContentTypes(client, dst),
    ]);
    const norm = (list) =>
      list.map((t) => ({
        id: t.sys.id,
        fields: (t.fields ?? []).map((f) => ({
          id: f.id,
          type: f.type,
          linkType: f.linkType,
          required: f.required,
          items: f.items,
        })),
      }));
    const typeIds = opts.contentTypes.length ? opts.contentTypes : null;
    const { compatible, problems } = compareContentTypes(
      norm(sCT),
      norm(tCT),
      typeIds,
    );
    if (!compatible) {
      console.error(
        "\nMODEL MISMATCH — aborting (use --skip-model-check to override):",
      );
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(3);
    }
    console.log("model-compatibility: OK");
  }

  // 2. Fetch + diff.
  const [srcEntries, tgtEntries] = await Promise.all([
    fetchEntries(client, src, opts),
    fetchEntries(client, dst, opts),
  ]);
  const entryDiff = diffById(
    srcEntries.map(toEntryItem),
    tgtEntries.map(toEntryItem),
  );
  report("entries", entryDiff);

  let assetDiff = { created: [], changed: [], unchanged: [], deleted: [] };
  if (opts.assets) {
    const [srcAssets, tgtAssets] = await Promise.all([
      fetchAssets(client, src, opts),
      fetchAssets(client, dst, opts),
    ]);
    assetDiff = diffById(
      srcAssets.map(toAssetItem),
      tgtAssets.map(toAssetItem),
    );
    report("assets", assetDiff);
  }

  if (!opts.apply) {
    console.log(
      "\ndry-run — nothing written. Re-run with --apply to perform the sync.",
    );
    return;
  }
  if (!(await confirmProd(opts))) {
    console.log("aborted by user.");
    process.exit(1);
  }

  // 3. Conflict filter for changed items (target newer than source unless --force).
  const newer = (c) =>
    Date.parse(c.target.updatedAt) > Date.parse(c.source.updatedAt);
  const pickChanged = (diff) => {
    const apply = [];
    for (const c of diff.changed) {
      if (newer(c) && !opts.force) {
        console.warn(
          `  [skip] ${c.source.id}: target newer than source (use --force to overwrite)`,
        );
      } else {
        apply.push(c.source);
      }
    }
    return apply;
  };

  // 4. Apply — assets first (entries link to them), then entries.
  let counts = { created: 0, updated: 0, published: 0, deleted: 0, errors: 0 };
  if (opts.assets) {
    for (const a of [...assetDiff.created, ...pickChanged(assetDiff)]) {
      const action = resolvePublishAction({
        direction,
        sourcePublished: a.published,
        publishFlag: opts.publish,
      });
      try {
        await upsertAsset(client, dst, a.raw, action);
        counts[assetDiff.created.includes(a) ? "created" : "updated"] += 1;
        if (action === "publish") counts.published += 1;
        console.log(`  [asset ${action}] ${a.id}`);
      } catch (e) {
        counts.errors += 1;
        console.error(`  [asset ERR] ${a.id}: ${e.message}`);
      }
    }
  }
  for (const en of [...entryDiff.created, ...pickChanged(entryDiff)]) {
    const action = resolvePublishAction({
      direction,
      sourcePublished: en.published,
      publishFlag: opts.publish,
    });
    try {
      await upsertEntry(client, dst, en.raw, action);
      counts[entryDiff.created.includes(en) ? "created" : "updated"] += 1;
      if (action === "publish") counts.published += 1;
      console.log(`  [entry ${action}] ${en.id} (${en.contentType})`);
    } catch (e) {
      counts.errors += 1;
      console.error(`  [entry ERR] ${en.id}: ${e.message}`);
    }
  }

  // 5. Deletions (opt-in).
  if (opts.allowDeletes) {
    for (const en of entryDiff.deleted) {
      try {
        if (en.published)
          await client.entry.unpublish({ ...dst, entryId: en.id });
        await client.entry.delete({ ...dst, entryId: en.id });
        counts.deleted += 1;
        console.log(`  [entry delete] ${en.id}`);
      } catch (e) {
        counts.errors += 1;
        console.error(`  [entry del ERR] ${en.id}: ${e.message}`);
      }
    }
  } else if (entryDiff.deleted.length) {
    console.log(
      `\n${entryDiff.deleted.length} entries exist only in target; pass --allow-deletes to remove them.`,
    );
  }

  // 6. Revalidate after a production apply.
  if (opts.revalidate) await revalidate();

  console.log(
    `\nDONE: ${counts.created} created, ${counts.updated} updated, ${counts.published} published, ${counts.deleted} deleted, ${counts.errors} errors`,
  );
  if (counts.errors) process.exit(1);
}

const invokedAsScript =
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main().catch((e) => {
    console.error(`error: ${e.message}`);
    process.exit(1);
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- scripts/contentful/sync-entries.test.mjs`
Expected: PASS (all describe blocks green). The guarded `main()` does not run on import.

- [ ] **Step 6: Type-check + lint + commit**

Run: `pnpm type-check && pnpm lint`
Expected: no errors (the `.mjs` is plain JS; ESLint should accept it — if `no-undef` fires on `fetch`/`process`, confirm the repo's eslint env already allows Node globals in scripts; the existing `scripts/contentful/*.mjs` pass lint, so this will too).

```bash
git add vitest.config.ts scripts/contentful/sync-entries.mjs scripts/contentful/sync-entries.test.mjs
git commit -m "feat(ICR-83): add Contentful entry-sync tool — dry-run diff + model-compat gate

Pure helpers (parseArgs/diffById/compareContentTypes/publish policy) are
unit-tested; the CMA apply path (asset+entry upsert, conflict guard,
deletions, revalidate) ships with a guarded main(). Dry-run is the
default; the master alias is refused; --to production needs --apply+confirm.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PVRy5k6byGbyDrgfA178rZ"
```

---

### Task 2: Smoke-test the sync tool against the live space (read-only)

**Files:** none (operational verification of Task 1).

**Interfaces:** Consumes the Task 1 CLI. Produces confidence that the diff + model gate work against real envs.

- [ ] **Step 1: Dry-run the default direction (prod → staging)**

Run (env from `.env.local`, which the script reads via `process.env` only — export it or use `dotenv -e .env.local --`; the repo already has `.env.local`):

```bash
node --env-file=.env.local scripts/contentful/sync-entries.mjs
```

Expected: prints `model-compatibility: OK`, then an `entries:` and `assets:` diff report, then `dry-run — nothing written`. This is the **current drift** between production and staging.

- [ ] **Step 2: Dry-run the reverse direction (staging → production)**

Run:

```bash
node --env-file=.env.local scripts/contentful/sync-entries.mjs --from staging --to production
```

Expected: a diff report (likely showing staging-only experiments), then dry-run exit. **No writes** (no `--apply`).

- [ ] **Step 3: Verify the guards**

Run:

```bash
node --env-file=.env.local scripts/contentful/sync-entries.mjs --to master
```

Expected: exits non-zero with `refusing to sync the 'master' alias`.

Run:

```bash
node --env-file=.env.local scripts/contentful/sync-entries.mjs --from staging --to production --apply
```

Expected (non-TTY in CI) or interactive: prompts for `yes` / refuses without confirmation. Press Ctrl-C / answer `no` — **do not apply yet** (the human-gated initial refresh is Task 7).

> No commit — this task records evidence on the Trello card.

---

### Task 3: Re-point `/predica` to production (draft-only)

**Files:**

- Modify: `.claude/config.json` (predica block: `_note`, `contentfulEnv`, `contentfulEnvNote`, the Gate-2 note)
- Modify: `.claude/commands/predica.md` (all `agent-sandbox` → `production`; drop env-recreate step)
- Modify: `.claude/agents/predica-publisher.md` (target production; reads pass `environmentId: "production"`)
- Modify: `.claude/scripts/predica/create-contentful-entry.mjs` (header + guard message)
- Modify: `.claude/scripts/predica/upload-contentful-asset.mjs` (header + guard message)
- Modify: `tasks/specs/sermon-pipeline.md` (top-of-file v2 note)
- Modify: `.gitignore` (add backups dir)

**Interfaces:** Consumes nothing from prior tasks. Produces a `/predica` pipeline that writes a DRAFT sermon to `production`.

- [ ] **Step 1: `.claude/config.json` — predica block**

Edit line 378: `"contentfulEnv": "agent-sandbox",` → `"contentfulEnv": "production",`

Replace `contentfulEnvNote` (line 380) with:

```json
    "contentfulEnvNote": "The publisher creates the sermon as a DRAFT in `production` (the live env behind the master alias) via the two committed CMA scripts — it has NO publish call, so nothing goes live until a human reviews both locales and clicks Publish at Gate 2. The scripts refuse the `master` ALIAS by name (you write the `production` ENV, never the alias). The MCP server runs PROTECTED_ENVIRONMENTS=master,production as a backstop, which does not affect these scripts (they use the management token directly, not the MCP).",
```

In `_note` (line 371), replace `a Contentful DRAFT in agent-sandbox` with `a Contentful DRAFT in production` and replace `writes only to agent-sandbox` with `writes only a DRAFT to production (never publishes)`.

Replace the Gate-2 `note` (line ~439) with:

```json
        "note": "Gate 2 — the orchestrator presents the summary and stops. The human reviews the DRAFT in Contentful (production), attaches any deferred media (audio, featuredImage), reviews both locales, and Publishes; then pastes the WhatsApp text. No agent publishes or sends."
```

- [ ] **Step 2: `.claude/scripts/predica/create-contentful-entry.mjs` — header + guard**

Replace the guard message (line 75):

```js
die(
  2,
  `error: refusing to write to protected environment '${a.env}'. Use 'production' or 'staging' (never the master alias).`,
);
```

Update the header doc comment block (lines 12–14) from the `SANDBOX-ONLY` / `master` wording to:

```js
 * DRAFT-ONLY by construction:
 *   - It has NO publish call. It creates a draft entry and stops.
 *   - It HARD-REFUSES the `master` alias (and any `master*` env). It writes the
 *     `production` ENV directly; a human reviews + Publishes at Gate 2.
```

- [ ] **Step 3: `.claude/scripts/predica/upload-contentful-asset.mjs` — header + guard**

Replace the guard message (line 94):

```js
die(
  2,
  `error: refusing to write to protected environment '${env}'. Use 'production' or 'staging' (never the master alias).`,
);
```

Update the header doc comment block (lines 10–13) to:

```js
 * DRAFT-ONLY by construction:
 *   - It has NO publish call. It creates and processes a draft asset and stops.
 *   - It HARD-REFUSES the `master` alias (and any `master*` env). It writes the
 *     `production` ENV directly; a human reviews + Publishes at Gate 2.
```

- [ ] **Step 4: `.claude/commands/predica.md` + `.claude/agents/predica-publisher.md`**

Read both files. In each, replace every `agent-sandbox` with `production`, and:

- In `predica.md`: delete the step that re-creates `agent-sandbox` if missing (around line 45 — "if it is missing… re-create it"). Replace the Gate-2 promotion wording ("merge agent-sandbox → master, and Publish") with "review both locales in Contentful (production), attach a featuredImage if deferred, and **Publish**." Change "Never touch `master`. All Contentful writes target `agent-sandbox`" to "Never write the `master` alias. All Contentful writes target the `production` env as a DRAFT (server backstop: `PROTECTED_ENVIRONMENTS=master,production`)."
- In `predica-publisher.md`: change `contentfulEnv` (= `production`); change the "Write ONLY to `agent-sandbox`" rule to "Write ONLY to `production` as a DRAFT (never the master alias)"; ensure all read tool calls (`search_entries`, `get_entry`, `list_content_types`, `get_content_type`) **pass `environmentId: "production"`** explicitly (add an instruction line: "Every Contentful MCP read passes `environmentId: \"production\"` — the MCP default is `staging`."). Update the `editUrl` template `environments/agent-sandbox/` → `environments/production/`.

- [ ] **Step 5: `tasks/specs/sermon-pipeline.md` — v2 note**

Add immediately under the H1 title:

```markdown
> **v2 update (ICR-83, 2026-06-25):** `agent-sandbox` is retired. `/predica` now creates the sermon as a **DRAFT in `production`**; a human reviews both locales and **Publishes** (Gate 2). The "merge agent-sandbox → master" step below is historical. See `docs/contentful-environments.md`.
```

- [ ] **Step 6: `.gitignore` — backups dir**

Append:

```
# Contentful cold-backup exports (heavy-cutover insurance; local only)
scripts/contentful/backups/
```

- [ ] **Step 7: Verify + commit**

Run:

```bash
grep -rn "agent-sandbox" .claude/config.json .claude/commands/predica.md .claude/agents/predica-publisher.md .claude/scripts/predica/
```

Expected: **no matches** (all re-pointed). Then confirm the guards still refuse master:

```bash
node .claude/scripts/predica/create-contentful-entry.mjs --content-type x --fields /dev/null --space s --env master; echo "exit=$?"
```

Expected: prints the refusal message, `exit=2`.

```bash
git add .claude/config.json .claude/commands/predica.md .claude/agents/predica-publisher.md .claude/scripts/predica/ tasks/specs/sermon-pipeline.md .gitignore
git commit -m "fix(ICR-83): point /predica at production (draft-only); guard the master alias

Re-points the retired agent-sandbox to the production env across config,
command, publisher agent, and the two CMA scripts. Sermon is created as a
DRAFT; a human reviews both locales and Publishes (Gate 2). Reads pass
environmentId=production explicitly. Adds scripts/contentful/backups/ to .gitignore.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PVRy5k6byGbyDrgfA178rZ"
```

---

### Task 4: MCP config — default staging, protect master + production

**Files:**

- Modify: `.claude/config.json` (the `contentful` block, lines 278–321)
- Modify: `docs/contentful-mcp.md` (env-config section)

**Interfaces:** Consumes nothing. Produces the hardened MCP write boundary.

- [ ] **Step 1: `.claude/config.json` — contentful block alignment with v2**

- Line 285: `"aliasTarget": "master-0.0.1",` → `"aliasTarget": "production",`
- Line 304: `"protectedEnvironments": "master",` → `"protectedEnvironments": "master,production",`
- Line 305 `protectedNote`: replace with:

```json
      "protectedNote": "PROTECTED_ENVIRONMENTS=master,production blocks MCP WRITE tools against the live alias AND the live env. Model changes go to `staging` only; production is changed by a human cutover (Merge / committed scripts / alias-swap), never by an agent via the MCP. Reads work against any env (environmentId is a required per-call arg)."
```

- Replace the `workEnvNaming` object (lines 290–300) with the stable-name heavy-cutover description:

```json
    "heavyCutover": {
      "_note": "Big BREAKING model changes (type deletions, field renames, merges) use a stable-name alias-swap, NOT semver work-env names. Runbook: docs/contentful-environments.md §5.",
      "steps": [
        "Cold-backup old production (npx contentful space export -> scripts/contentful/backups/).",
        "Re-point master alias -> staging (live now reads the tested staging env).",
        "Delete the old production env (frees the free-tier slot).",
        "Clone staging -> a fresh env named `production`.",
        "Re-point master alias -> production; refresh staging from production for the next cycle."
      ],
      "tradeoff": "Free tier holds 2 envs, so steps 1-4 have no separate rollback env; the alias serves the known-good staging the whole window, and the cold backup is the last resort."
    },
```

- Update `appEnvVarNote` (line 289): replace the `master-1.0.0` example with `staging`.
- Update `perCycleConfigTouch` (lines 315–320): replace `new work env` with `staging` and drop the per-cycle framing (staging is permanent now) — set it to:

```json
    "oneTimeConfigTouch": [
      "Delivery (CDA) + Preview (CPA) API keys -> add `staging` (Settings -> API keys -> Environments) [human-only, once]",
      "MCP ENVIRONMENT_ID -> staging (default; reads override per-call)",
      ".env.local CONTENTFUL_ENVIRONMENT -> staging (for local model-change testing)",
      "Vercel Preview CONTENTFUL_ENVIRONMENT (branch-scoped) -> staging (model-change PRs only)"
    ],
```

(Delete the old `perCycleConfigTouch` key.)

- [ ] **Step 2: `docs/contentful-mcp.md` — env config**

Read the file. Update the MCP env-config description so it states: default `ENVIRONMENT_ID=staging`; `PROTECTED_ENVIRONMENTS=master,production`; and that **every MCP tool takes `environmentId` as a required per-call argument**, so reads target any env explicitly while writes to `master`/`production` are blocked. Remove/ækcorrect the stale "agent-sandbox" mention (the doc already notes it is "now retired").

- [ ] **Step 3: Validate JSON + commit**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/config.json','utf8')); console.log('config.json OK')"
```

Expected: `config.json OK`.

```bash
git add .claude/config.json docs/contentful-mcp.md
git commit -m "chore(ICR-83): MCP default=staging, protect master+production

Aligns the contentful config block with the v2 topology: aliasTarget=production,
PROTECTED_ENVIRONMENTS=master,production, stable-name heavy cutover (replaces the
semver work-env naming), and a one-time (not per-cycle) staging config touch.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PVRy5k6byGbyDrgfA178rZ"
```

---

### Task 5: Drift detector — weekly report-only GitHub Action

**Files:**

- Create: `.github/workflows/contentful-drift.yml`

**Interfaces:** Consumes the Task 1 CLI (dry-run). Produces a weekly read-only drift report as a rolling GitHub issue.

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/contentful-drift.yml`:

````yaml
name: Contentful drift detector

on:
  schedule:
    - cron: "0 12 * * 1" # Mondays 12:00 UTC
  workflow_dispatch:

permissions:
  contents: read
  issues: write

jobs:
  drift:
    runs-on: ubuntu-latest
    env:
      CONTENTFUL_SPACE_ID: ${{ secrets.CONTENTFUL_SPACE_ID }}
      CONTENTFUL_MANAGEMENT_ACCESS_TOKEN: ${{ secrets.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22.14.0"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Detect drift (read-only, both directions)
        id: drift
        run: |
          {
            echo "## production -> staging (refresh candidates)"
            echo '```'
            node scripts/contentful/sync-entries.mjs --from production --to staging || true
            echo '```'
            echo "## staging -> production (promotion candidates)"
            echo '```'
            node scripts/contentful/sync-entries.mjs --from staging --to production || true
            echo '```'
          } > drift.md
          # "drift present" = any [new]/[changed]/[target] line in the report
          if grep -qE '\[(new|changed|target)\]' drift.md; then
            echo "present=true" >> "$GITHUB_OUTPUT"
          else
            echo "present=false" >> "$GITHUB_OUTPUT"
          fi
      - name: Open/update/close the drift issue
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const body = fs.readFileSync('drift.md', 'utf8');
            const title = 'Contentful drift: staging ↔ production';
            const present = '${{ steps.drift.outputs.present }}' === 'true';
            const { data: issues } = await github.rest.issues.listForRepo({
              owner: context.repo.owner, repo: context.repo.repo, state: 'open', labels: 'contentful-drift',
            });
            const existing = issues.find((i) => i.title === title);
            if (present) {
              const stamped = `_Last checked: ${new Date().toISOString()}_\n\n${body}`;
              if (existing) {
                await github.rest.issues.update({ owner: context.repo.owner, repo: context.repo.repo, issue_number: existing.number, body: stamped });
              } else {
                await github.rest.issues.create({ owner: context.repo.owner, repo: context.repo.repo, title, body: stamped, labels: ['contentful-drift'] });
              }
            } else if (existing) {
              await github.rest.issues.createComment({ owner: context.repo.owner, repo: context.repo.repo, issue_number: existing.number, body: 'Environments are in sync — closing.' });
              await github.rest.issues.update({ owner: context.repo.owner, repo: context.repo.repo, issue_number: existing.number, state: 'closed' });
            }
````

- [ ] **Step 2: Note the required secrets (no commit content)**

The workflow needs repo secrets `CONTENTFUL_SPACE_ID` and `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` (Settings → Secrets and variables → Actions) and a `contentful-drift` label. Record this on the Trello card as a human follow-up; the workflow degrades gracefully (the tool errors → `|| true` → "no drift" issue logic still runs) if secrets are missing, so it won't fail the default branch.

- [ ] **Step 3: Lint YAML (best-effort) + commit**

Run (optional, if `actionlint` is available — otherwise rely on the dispatch run in Task 7):

```bash
git add .github/workflows/contentful-drift.yml
git commit -m "ci(ICR-83): weekly report-only Contentful staging<->production drift detector

Runs the sync tool in dry-run both directions on a weekly cron (+ manual
dispatch) and opens/updates/closes one rolling GitHub issue. Zero writes
to Contentful.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PVRy5k6byGbyDrgfA178rZ"
```

---

### Task 6: Rewrite `docs/contentful-environments.md` as the canonical doc + close PR #54

**Files:**

- Modify (rewrite): `docs/contentful-environments.md`
- Modify: `docs/contentful-data-layer.md` (one cross-link)
- Modify: `CLAUDE.md` (the architecture note's revalidation/draft section already references envs — add a one-line pointer if absent)

**Interfaces:** Consumes the spec (`docs/superpowers/specs/2026-06-25-contentful-workflow-v2-design.md`). Produces the single source of truth humans + agents read.

- [ ] **Step 1: Rewrite `docs/contentful-environments.md`**

Replace the whole file with a doc structured as:

1. **TL;DR + topology table** (`master`→`production`, `staging`; free-tier = 2 envs).
2. **The mental model** ("content down, models up") — verbatim from spec §2.
3. **Scenario A / B / C playbooks** — from spec §4 (include the exact `sync-entries.mjs` commands).
4. **Heavy alias-swap cutover runbook** — from spec §5 (the §0 `npx contentful space export` cold backup, the no-rollback-window tradeoff).
5. **Safety model** — from spec §6 (MCP default staging + `PROTECTED_ENVIRONMENTS=master,production`; CMA scripts refuse the alias; per-call `environmentId` reads).
6. **The entry-sync tool** — flags table + the publish policy + the model-compat gate (spec §7.1/§7.3 summary, link to the tool).
7. **Drift detector** — one paragraph (spec §10).
8. **Quick-reference table** — production/staging roles, app override, write paths, cutover/rollback, free-tier cap.

Remove the ICR-76-in-flight sections (the old "This epic (ICR-76)" + semver naming). Keep it accurate to the live state.

- [ ] **Step 2: Cross-links**

In `docs/contentful-data-layer.md`, add (near the revalidation/draft section): `> Environment topology + the content/model workflow: see docs/contentful-environments.md.` In `CLAUDE.md`, ensure the docs list line for `contentful-environments.md` describes it as "the canonical content/model workflow (3 scenarios, cutover, entry-sync)".

- [ ] **Step 3: Commit**

```bash
git add docs/contentful-environments.md docs/contentful-data-layer.md CLAUDE.md
git commit -m "docs(ICR-83): rewrite contentful-environments as the canonical workflow doc

Single source of truth on the final master->production + staging topology:
the content-down/models-up mental model, the three scenario playbooks, the
stable-name heavy cutover runbook, the safety model, and the entry-sync +
drift-detector tooling. Folds in the PR #54 handoff brief.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PVRy5k6byGbyDrgfA178rZ"
```

- [ ] **Step 4: Close PR #54 (its content is absorbed)**

Run:

```bash
gh pr close 54 --comment "Folded into ICR-83: the design lives in docs/superpowers/specs/2026-06-25-contentful-workflow-v2-design.md and the canonical doc is the rewritten docs/contentful-environments.md (PR for branch feat/ICR-83-contentful-workflow-v2)." --delete-branch
```

Expected: PR #54 closed, branch `docs/contentful-entry-sync-handoff` deleted.

---

### Task 7: Full verification + the initial prod→staging refresh (human-gated)

**Files:** none (verification + one operational apply).

**Interfaces:** Consumes everything above.

- [ ] **Step 1: Run the full gate**

Run: `pnpm type-check && pnpm lint && pnpm test && pnpm build`
Expected: all green (the sync-tool unit tests included).

- [ ] **Step 2: Re-show the initial refresh dry-run to the human**

Run:

```bash
node --env-file=.env.local scripts/contentful/sync-entries.mjs --from production --to staging
```

Present the diff to the user. **Wait for explicit approval.**

- [ ] **Step 3: Apply the refresh (only after approval)**

Run:

```bash
node --env-file=.env.local scripts/contentful/sync-entries.mjs --from production --to staging --apply
```

Expected: assets/entries created/updated in `staging`, mirroring production publish state; ends with a `DONE:` summary, 0 errors. Re-run Step 2's dry-run → should now report `0 new, 0 changed`.

- [ ] **Step 4: Record on the card**

Comment on ICR-83 with the dry-run + apply summaries and the remaining human follow-ups (GH secrets for the drift workflow; archive ICR-72; verify the staging API-key grant).

---

### Task 8: Open the PR

**Files:** none.

- [ ] **Step 1: Push + open the draft PR**

```bash
git push -u origin feat/ICR-83-contentful-workflow-v2
gh pr create --draft --title "feat(ICR-83): Contentful workflow v2 — entry-sync, /predica → production, drift detector" --body "<PR template; links the spec + ICR-83 + notes PR #54 is folded in>"
```

- [ ] **Step 2: Comment the PR URL on ICR-83 and move it to In Review**

(Use the Trello MCP, or `/work`'s pr-author behavior. Card stays human-gated for merge.)

## Self-Review

**Spec coverage:**

- §2 mental model → Task 6 doc + Task 1 header. ✓
- §4 scenarios → Task 6 §1 (doc). ✓
- §5 heavy cutover + cold backup → Task 6 doc + Task 3 `.gitignore` + Task 4 config `heavyCutover`. ✓
- §6 safety model → Task 4 (MCP) + Task 3 (CMA guard messages) + Task 1 (`assertGuards`). ✓
- §7 entry-sync tool → Task 1 (code+tests) + Task 2 (smoke). ✓
- §8 /predica re-point → Task 3 (all 6 files). ✓
- §9 MCP config → Task 4. ✓
- §10 drift detector → Task 5. ✓
- §11 files (new/modified) → covered across Tasks 1–6; `.gitignore` in Task 3. ✓
- §12 edge cases → handled in Task 1 code (model gate abort, conflict skip, asset URL convert, empty diff, deletions opt-in, revalidate non-fatal). ✓
- §13 testing → Task 1 unit tests + Task 2 smoke + Task 7 gate. ✓
- §14 checkpoints → Tasks 1,2(merged smoke),3,4,5,6,7. ✓
- §15 open questions → drift issue uses `github-script` (resolved); asset publish re-get before publish (handled); predica per-call env (Task 3 step 4). ✓

**Placeholder scan:** PR body in Task 8 is the only `<...>` — intentional (follow the repo PR template at author time). No TBD/TODO in code or config steps.

**Type consistency:** `Item = {id, fields, published, updatedAt, contentType?, raw}` is produced by `toEntryItem`/`toAssetItem` and consumed by `diffById`/`report`/the apply loop consistently. `CT = {id, fields:[{id,type,linkType,required,items}]}` produced by the `norm()` mapper in `main` and consumed by `compareContentTypes` — matches the test fixtures. `resolvePublishAction` direction values (`'promote'|'refresh'`) match `directionOf`. ✓
