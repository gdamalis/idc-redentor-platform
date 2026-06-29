#!/usr/bin/env node
/**
 * update-content-type.mjs — Additive, idempotent update of the `sermon` content type
 * for the multi-preacher service support. TWO additive changes only:
 *
 *   1. `content` (RichText) → allow `embedded-asset-block` (so the body can interleave
 *      per-preacher audio players + PDF downloads). Keeps every existing enabled node.
 *   2. add an optional `additionalPreachers` field — Array<Link<Entry>> (linkContentType
 *      author), not localized, not required — for the multi-name byline. Inserted right
 *      after `preacher`.
 *
 * Both are backward-compatible: existing sermons keep validating and rendering unchanged.
 *
 * SAFE BY CONSTRUCTION:
 *   - DRY-RUN by default; prints the exact diff. Pass `--apply` to write + activate.
 *   - HARD-REFUSES the `master` alias (and any `master*` env). Run against `production`
 *     and/or `staging` only.
 *   - Idempotent: if both changes are already present it reports "up to date" and exits 0
 *     without writing.
 *   - Activating a CONTENT TYPE (so the CDA/GraphQL expose the new field) is NOT the same
 *     as publishing an ENTRY — the draft-only/never-publish rule for sermon entries holds.
 *
 * Auth: reads CONTENTFUL_MANAGEMENT_ACCESS_TOKEN from env, else parses .env.local
 * (repo root or apps/web). The token NAME only is referenced — never printed.
 *
 * Usage:
 *   node .claude/scripts/predica/update-content-type.mjs --space <id> --env <production|staging> [--apply]
 *
 * Exit codes: 0 success (incl. up-to-date) · 2 usage/auth/guard error · 1 write failure
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const CMA = "https://api.contentful.com";
const JSON_CT = "application/vnd.contentful.management.v1+json";
const CONTENT_TYPE_ID = "sermon";
const EMBEDDED_ASSET_NODE = "embedded-asset-block";

function die(code, msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  process.exit(code);
}

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
    for (const rel of [".env.local", path.join("apps", "web", ".env.local")]) {
      const p = path.join(dir, rel);
      if (existsSync(p)) {
        const text = await readFile(p, "utf8");
        for (const line of text.split("\n")) {
          const m = line.match(/^\s*CONTENTFUL_MANAGEMENT_ACCESS_TOKEN\s*=\s*(.+)\s*$/);
          if (m) return m[1].replace(/^["']|["']$/g, "").trim();
        }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const ADDITIONAL_PREACHERS_FIELD = {
  id: "additionalPreachers",
  name: "Additional preachers",
  type: "Array",
  localized: false,
  required: false,
  disabled: false,
  omitted: false,
  items: {
    type: "Link",
    linkType: "Entry",
    validations: [{ linkContentType: ["author"] }],
  },
};

/** Returns { changed, addNode, addField, fields, contentValidations }. Pure. */
function computePatch(ct) {
  const fields = ct.fields.map((f) => ({ ...f }));

  // 1. content → enabledNodeTypes += embedded-asset-block
  const content = fields.find((f) => f.id === "content");
  if (!content) die(1, "error: sermon content type has no `content` field");
  const validations = (content.validations ?? []).map((v) => ({ ...v }));
  const nodeVal = validations.find((v) => Array.isArray(v.enabledNodeTypes));
  let addNode = false;
  if (nodeVal && !nodeVal.enabledNodeTypes.includes(EMBEDDED_ASSET_NODE)) {
    nodeVal.enabledNodeTypes = [...nodeVal.enabledNodeTypes, EMBEDDED_ASSET_NODE];
    nodeVal.message = "Only H2, H3, lists, blockquotes and embedded assets are allowed";
    addNode = true;
  }
  content.validations = validations;

  // 2. add additionalPreachers (after preacher) if missing
  let addField = false;
  if (!fields.some((f) => f.id === "additionalPreachers")) {
    const preacherIdx = fields.findIndex((f) => f.id === "preacher");
    const insertAt = preacherIdx === -1 ? fields.length : preacherIdx + 1;
    fields.splice(insertAt, 0, { ...ADDITIONAL_PREACHERS_FIELD });
    addField = true;
  }

  return { changed: addNode || addField, addNode, addField, fields, contentValidations: content.validations };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  for (const r of ["space", "env"]) if (!a[r]) die(2, `error: --${r} is required`);
  if (a.env === "master" || /^master(-|$)/.test(a.env))
    die(2, `error: refusing to write protected environment '${a.env}'. Use production or staging.`);
  const apply = Boolean(a.apply);

  const token = await loadToken();
  if (!token) die(2, "error: CONTENTFUL_MANAGEMENT_ACCESS_TOKEN not found in env or .env.local");

  const base = `${CMA}/spaces/${a.space}/environments/${a.env}/content_types/${CONTENT_TYPE_ID}`;
  const auth = { Authorization: `Bearer ${token}` };

  const getRes = await fetch(base, { headers: auth });
  const getText = await getRes.text();
  if (!getRes.ok) die(1, `GET content_type → ${getRes.status} ${getRes.statusText}\n${getText}`);
  const ct = JSON.parse(getText);
  const version = ct.sys.version;

  const { changed, addNode, addField, fields } = computePatch(ct);

  process.stdout.write(
    `[${a.env}] sermon content type v${version}\n` +
      `  + embedded-asset-block on content : ${addNode ? "WILL ADD" : "already present"}\n` +
      `  + additionalPreachers field       : ${addField ? "WILL ADD" : "already present"}\n`,
  );

  if (!changed) {
    process.stdout.write(`[${a.env}] already up to date — nothing to do.\n`);
    return;
  }
  if (!apply) {
    process.stdout.write(`[${a.env}] DRY-RUN — re-run with --apply to write + activate.\n`);
    return;
  }

  const body = {
    name: ct.name,
    displayField: ct.displayField,
    description: ct.description,
    fields,
  };
  if (ct.metadata) body.metadata = ct.metadata;

  const putRes = await fetch(base, {
    method: "PUT",
    headers: { ...auth, "Content-Type": JSON_CT, "X-Contentful-Version": String(version) },
    body: JSON.stringify(body),
  });
  const putText = await putRes.text();
  if (!putRes.ok) die(1, `PUT content_type → ${putRes.status} ${putRes.statusText}\n${putText}`);
  const updated = JSON.parse(putText);
  const newVersion = updated.sys.version;

  // Activate so the CDA/GraphQL expose the new field + validation.
  const pubRes = await fetch(`${base}/published`, {
    method: "PUT",
    headers: { ...auth, "X-Contentful-Version": String(newVersion) },
  });
  const pubText = await pubRes.text();
  if (!pubRes.ok) die(1, `PUT content_type/published → ${pubRes.status} ${pubRes.statusText}\n${pubText}`);

  process.stdout.write(`[${a.env}] ✓ updated to v${newVersion} and activated.\n`);
}

main().catch((e) => die(1, `error: ${e?.stack ?? e}`));
