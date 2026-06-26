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
 *     --content-type <contentTypeId> --fields <fields.json> --space <spaceId> --env <environmentId>
 *
 * Output (stdout): { "ok": true, "entryId": "...", "editUrl": "..." }
 * Exit codes: 0 success · 2 usage/auth/guard error · 1 create failure
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const CMA = "https://api.contentful.com";
const JSON_CT = "application/vnd.contentful.management.v1+json";

function die(code, msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    if (!k.startsWith("--")) die(2, `unexpected arg: ${k}`);
    out[k.slice(2)] = argv[i + 1];
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
    const editUrl = `https://app.contentful.com/spaces/${a.space}/environments/${a.env}/entries/${entryId}`;
    process.stdout.write(JSON.stringify({ ok: true, entryId, editUrl }) + "\n");
  } catch (e) {
    die(1, `error: ${e.message}`);
  }
}

main();
