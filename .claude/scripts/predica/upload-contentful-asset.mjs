#!/usr/bin/env node
/**
 * upload-contentful-asset.mjs — Upload ONE local file to Contentful as a DRAFT asset.
 *
 * Solves the base64 limit: the Contentful MCP `upload_asset` tool only accepts a
 * base64 data URI (or a public URL), which is fine for small PDFs but infeasible
 * for a ~20 MB sermon mp3. This uses the CMA binary-upload endpoint
 * (upload.contentful.com) → create asset → process → poll, so any size works.
 *
 * DRAFT-ONLY by construction:
 *   - It has NO publish call. It creates and processes a draft asset and stops.
 *   - It HARD-REFUSES the `master` alias (and any `master*` env). It writes the
 *     `production` ENV directly; a human reviews + Publishes at Gate 2.
 *
 * Auth: reads CONTENTFUL_MANAGEMENT_ACCESS_TOKEN from the environment; if absent,
 * it parses `.env.local` at the repo root. The token NAME only is referenced —
 * never printed.
 *
 * Usage:
 *   node .claude/scripts/predica/upload-contentful-asset.mjs \
 *     --file <path> --content-type <mime> --title "<title>" \
 *     --space <spaceId> --env <environmentId> [--locale es-AR] [--filename <name>]
 *
 * Output (stdout): a single JSON line { "ok": true, "assetId": "...", "url": "..." }
 * Exit codes: 0 success · 2 usage/auth/guard error · 1 upload/process failure
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";

const CMA = "https://api.contentful.com";
const UPLOAD = "https://upload.contentful.com";
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

/** Load CONTENTFUL_MANAGEMENT_ACCESS_TOKEN from env or .env.local (repo root). */
async function loadToken() {
  if (process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN)
    return process.env.CONTENTFUL_MANAGEMENT_ACCESS_TOKEN;
  // Walk up from cwd looking for .env.local.
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

async function cma(token, method, url, { version, body, contentType } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (contentType) headers["Content-Type"] = contentType;
  if (version != null) headers["X-Contentful-Version"] = String(version);
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${url.replace(token, "***")} → ${res.status} ${res.statusText}\n${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const required = ["file", "content-type", "title", "space", "env"];
  for (const r of required) if (!a[r]) die(2, `error: --${r} is required`);

  const locale = a.locale ?? "es-AR";
  const env = a.env;
  // Guard: never touch master (the live alias target or any master* env).
  if (env === "master" || /^master(-|$)/.test(env)) {
    die(
      2,
      `error: refusing to write to protected environment '${env}'. Use 'production' or 'staging' (never the master alias).`,
    );
  }

  const token = await loadToken();
  if (!token) die(2, "error: CONTENTFUL_MANAGEMENT_ACCESS_TOKEN not found in env or .env.local");

  const fileName = a.filename ?? path.basename(a.file);
  let bytes;
  try {
    bytes = await readFile(a.file);
  } catch (e) {
    die(2, `error: cannot read ${a.file}: ${e.message}`);
  }

  const base = `${CMA}/spaces/${a.space}/environments/${env}`;

  try {
    // 1) Upload the raw binary.
    const upload = await cma(token, "POST", `${UPLOAD}/spaces/${a.space}/environments/${env}/uploads`, {
      body: bytes,
      contentType: "application/octet-stream",
    });
    const uploadId = upload?.sys?.id;
    if (!uploadId) throw new Error("upload returned no sys.id");

    // 2) Create the asset referencing the upload (DRAFT).
    const created = await cma(token, "POST", `${base}/assets`, {
      contentType: JSON_CT,
      body: JSON.stringify({
        fields: {
          title: { [locale]: a.title },
          file: {
            [locale]: {
              contentType: a["content-type"],
              fileName,
              uploadFrom: { sys: { type: "Link", linkType: "Upload", id: uploadId } },
            },
          },
        },
      }),
    });
    const assetId = created?.sys?.id;
    if (!assetId) throw new Error("asset create returned no sys.id");

    // 3) Process the file for this locale.
    await cma(token, "PUT", `${base}/assets/${assetId}/files/${locale}/process`, {
      version: created.sys.version,
    });

    // 4) Poll until processed (file.url appears). Never publishes.
    let url = null;
    for (let i = 0; i < 30; i += 1) {
      await new Promise((r) => setTimeout(r, 1000));
      const got = await cma(token, "GET", `${base}/assets/${assetId}`);
      url = got?.fields?.file?.[locale]?.url ?? null;
      if (url) break;
    }
    if (!url) throw new Error(`asset ${assetId} did not finish processing in time`);

    process.stdout.write(JSON.stringify({ ok: true, assetId, url: `https:${url}` }) + "\n");
  } catch (e) {
    die(1, `error: ${e.message}`);
  }
}

main();
