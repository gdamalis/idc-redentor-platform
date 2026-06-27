#!/usr/bin/env node
/**
 * create-contentful-entry.mjs — Create ONE Contentful entry as a DRAFT from a
 * fields JSON file, via the CMA.
 *
 * Why a script (not the MCP create_entry tool): a sermon's `fields` payload is
 * tens of KB (a 40+ node Rich Text document in two locales). Round-tripping that
 * through an LLM tool call is fragile (one missing brace fails the call). Building
 * the fields deterministically (build-sermon-entry.mjs) and POSTing them straight
 * to the CMA is reliable at any size.
 *
 * IDEMPOTENT UPSERT (--upsert-by-internal-name): for content types whose
 * `internalName` is a stable dedup key (e.g. `bibleVerse`, where it is derived from
 * the passage + version — "Joel 2:13 (NVI)"), pass this flag to make re-runs reuse the
 * existing entry instead of creating a duplicate. The script GETs by content_type +
 * fields.internalName first; on a hit it returns that id (`reused:true`) WITHOUT
 * writing; otherwise it creates as normal (`reused:false`). Deterministic — it does
 * not depend on the agent remembering to search. See docs/predica-bibleverse-reuse.md.
 *
 * DRAFT-ONLY by construction:
 *   - It has NO publish call. It creates a draft entry and stops.
 *   - It HARD-REFUSES the `master` alias (and any `master*` env). It writes the
 *     `production` ENV directly; a human reviews + Publishes at Gate 2.
 *
 * Auth: reads CONTENTFUL_MANAGEMENT_ACCESS_TOKEN from env, else parses .env.local
 * at the repo root. The token NAME only is referenced — never printed.
 *
 * Usage:
 *   node .claude/scripts/predica/create-contentful-entry.mjs \
 *     --content-type <contentTypeId> --fields <fields.json> --space <spaceId> --env <environmentId> \
 *     [--upsert-by-internal-name]
 *
 * Output (stdout): { "ok": true, "entryId": "...", "editUrl": "...", "reused": <bool> }
 * Exit codes: 0 success · 2 usage/auth/guard error · 1 create failure
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const CMA = "https://api.contentful.com";
const JSON_CT = "application/vnd.contentful.management.v1+json";
const DEFAULT_LOCALE = "es-AR";

function die(code, msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

// Supports both `--key value` pairs and bare boolean flags (`--upsert-by-internal-name`).
// A flag is boolean when the next token is absent or another `--option` (our values —
// ids, paths, env names — never start with `--`).
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const k = argv[i];
    if (!k.startsWith("--")) die(2, `unexpected arg: ${k}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[k.slice(2)] = true;
    } else {
      out[k.slice(2)] = next;
      i += 1;
    }
  }
  return out;
}

async function loadToken() {
  if (process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN)
    return process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN;
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    const p = path.join(dir, ".env.local");
    if (existsSync(p)) {
      const text = await readFile(p, "utf8");
      for (const line of text.split("\n")) {
        const m = line.match(/^\s*CONTENTFUL_MANAGEMENT_ACCESS_TOKEN\s*=\s*(.+)\s*$/);
        if (m) return m[1].replace(/^["']|["']$/g, "").trim();
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  for (const r of ["content-type", "fields", "space", "env"]) {
    if (!a[r]) die(2, `error: --${r} is required`);
  }
  if (a.env === "master" || /^master(-|$)/.test(a.env)) {
    die(
      2,
      `error: refusing to write to protected environment '${a.env}'. Use 'production' or 'staging' (never the master alias).`,
    );
  }

  const token = await loadToken();
  if (!token) die(2, "error: CONTENTFUL_MANAGEMENT_ACCESS_TOKEN not found in env or .env.local");

  let fields;
  try {
    fields = JSON.parse(await readFile(a.fields, "utf8"));
  } catch (e) {
    die(2, `error: cannot read/parse ${a.fields}: ${e.message}`);
  }

  const url = `${CMA}/spaces/${a.space}/environments/${a.env}/entries`;
  const editUrlFor = (id) =>
    `https://app.contentful.com/spaces/${a.space}/environments/${a.env}/entries/${id}`;

  // Idempotent upsert: reuse an existing entry with the same internalName instead of
  // creating a duplicate. Read-only lookup; if no match, fall through to the create.
  if (a["upsert-by-internal-name"]) {
    const internalName = fields?.internalName?.[DEFAULT_LOCALE];
    if (typeof internalName !== "string" || !internalName.trim()) {
      die(2, `error: --upsert-by-internal-name requires fields.internalName["${DEFAULT_LOCALE}"]`);
    }
    const q = new URLSearchParams({
      content_type: a["content-type"],
      "fields.internalName": internalName,
      limit: "1",
    });
    try {
      const res = await fetch(`${url}?${q}`, { headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      if (!res.ok) throw new Error(`GET entries → ${res.status} ${res.statusText}\n${text}`);
      const found = JSON.parse(text);
      const existing = Array.isArray(found?.items) ? found.items[0] : undefined;
      if (existing?.sys?.id) {
        const entryId = existing.sys.id;
        process.stdout.write(
          JSON.stringify({ ok: true, entryId, editUrl: editUrlFor(entryId), reused: true }) + "\n",
        );
        return;
      }
    } catch (e) {
      die(1, `error: upsert lookup failed: ${e.message}`);
    }
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": JSON_CT,
        "X-Contentful-Content-Type": a["content-type"],
      },
      body: JSON.stringify({ fields }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`POST entries → ${res.status} ${res.statusText}\n${text}`);
    const entry = JSON.parse(text);
    const entryId = entry?.sys?.id;
    if (!entryId) throw new Error("create returned no sys.id");
    process.stdout.write(
      JSON.stringify({ ok: true, entryId, editUrl: editUrlFor(entryId), reused: false }) + "\n",
    );
  } catch (e) {
    die(1, `error: ${e.message}`);
  }
}

main();
