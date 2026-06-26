#!/usr/bin/env node
/**
 * create-contentful-entry.mjs — Create OR update ONE Contentful entry as a DRAFT
 * from a fields JSON file, via the CMA.
 *
 * Why a script (not the MCP create_entry tool): a sermon's `fields` payload is
 * tens of KB (a 40+ node Rich Text document in two locales). Round-tripping that
 * through an LLM tool call is fragile (one missing brace fails the call). Building
 * the fields deterministically (build-sermon-entry.mjs) and POSTing them straight
 * to the CMA is reliable at any size.
 *
 * Two modes:
 *   - CREATE (default): POST a new draft entry. Requires --content-type.
 *   - UPDATE-IN-PLACE (--id <entryId>): GET the entry's current version, then PUT
 *     the full `fields` payload back under the SAME id. Used when /predica
 *     regenerates an existing sermon — no duplicate entry, the editUrl is stable.
 *     PUT replaces the whole `fields` object, so the regenerated content fully
 *     supersedes the prior content (this is what the Gate-0 approval consents to).
 *
 * DRAFT-ONLY by construction (both modes):
 *   - It has NO publish call. It creates/updates a draft entry and stops.
 *   - It HARD-REFUSES the `master` alias (and any `master*` env). It writes the
 *     `production` ENV directly; a human reviews + Publishes at Gate 2.
 *
 * Auth: reads CONTENTFUL_MANAGEMENT_ACCESS_TOKEN from env, else parses .env.local
 * at the repo root. The token NAME only is referenced — never printed.
 *
 * Usage:
 *   # create
 *   node .claude/scripts/predica/create-contentful-entry.mjs \
 *     --content-type <contentTypeId> --fields <fields.json> --space <spaceId> --env <environmentId>
 *   # update in place
 *   node .claude/scripts/predica/create-contentful-entry.mjs \
 *     --id <entryId> --fields <fields.json> --space <spaceId> --env <environmentId>
 *
 * Output (stdout): { "ok": true, "entryId": "...", "editUrl": "...", "updated"?: true }
 * Exit codes: 0 success · 2 usage/auth/guard error · 1 create/update failure
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
  const isUpdate = Boolean(a.id);
  for (const r of ["fields", "space", "env"]) {
    if (!a[r]) die(2, `error: --${r} is required`);
  }
  // --content-type is required to CREATE; for an update the entry already has a
  // type, so it is optional (and ignored) when --id is given.
  if (!isUpdate && !a["content-type"]) {
    die(2, "error: --content-type is required when creating (pass --id <entryId> to update in place)");
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

  const base = `${CMA}/spaces/${a.space}/environments/${a.env}`;
  const editUrl = (id) =>
    `https://app.contentful.com/spaces/${a.space}/environments/${a.env}/entries/${id}`;

  try {
    if (isUpdate) {
      // UPDATE-IN-PLACE: GET current version, then PUT the full fields payload.
      // No publish call — the entry stays a draft (or, if it was published, the
      // new content lands as a draft change the human re-publishes at Gate 2).
      const getRes = await fetch(`${base}/entries/${a.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const getText = await getRes.text();
      if (!getRes.ok) throw new Error(`GET entries/${a.id} → ${getRes.status} ${getRes.statusText}\n${getText}`);
      const version = JSON.parse(getText)?.sys?.version;
      if (version == null) throw new Error(`entry ${a.id} returned no sys.version`);

      const putRes = await fetch(`${base}/entries/${a.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": JSON_CT,
          "X-Contentful-Version": String(version),
        },
        body: JSON.stringify({ fields }),
      });
      const putText = await putRes.text();
      if (!putRes.ok) throw new Error(`PUT entries/${a.id} → ${putRes.status} ${putRes.statusText}\n${putText}`);
      const entryId = JSON.parse(putText)?.sys?.id ?? a.id;
      process.stdout.write(JSON.stringify({ ok: true, entryId, editUrl: editUrl(entryId), updated: true }) + "\n");
      return;
    }

    const res = await fetch(`${base}/entries`, {
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
    const entryId = JSON.parse(text)?.sys?.id;
    if (!entryId) throw new Error("create returned no sys.id");
    process.stdout.write(JSON.stringify({ ok: true, entryId, editUrl: editUrl(entryId) }) + "\n");
  } catch (e) {
    die(1, `error: ${e.message}`);
  }
}

main();
