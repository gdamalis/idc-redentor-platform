#!/usr/bin/env node
/**
 * predica-ingest-client.mjs — Service-token client for `/api/predica/*` (`ICR-204`).
 *
 * Replaces the legacy CMA upload/create/delete scripts. Holds ZERO database URIs
 * and ZERO Blob storage keys — authenticates solely with a per-environment
 * `PREDICA_INGEST_TOKEN_{PROD,STAGING}` Bearer secret and uploads files directly
 * to Vercel Blob via `@vercel/blob/client` (`upload()`, 8 MB multipart for audio).
 *
 * Target rules (`01-decisions.md` L39-41):
 *   - Default (no `--test`): production (`https://ministerio.idcredentor.org`, `PREDICA_INGEST_TOKEN_PROD`)
 *   - `--test`:              staging    (`https://staging.ministerio.idcredentor.org`, `PREDICA_INGEST_TOKEN_STAGING`)
 *   - `--admin-url <url>`:   optional override (e.g. preview QA); enforces `https:`
 *                            (except `http://localhost` / `http://127.0.0.1`) and refuses
 *                            production admin hosts when `--test` is set (`R2`).
 *
 * Exit codes:
 *   0  success (JSON printed to stdout)
 *   1  network / server / upload failure
 *   2  usage / config / missing token / local validation error
 *   4  409 conflict (stale revision or human-edited draft — needs --overwrite)
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { upload as vercelBlobUpload } from "@vercel/blob/client";
import {
  buildPredicaIngestPayload,
  validateSermonJson,
} from "./build-sermon-payload.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");

const DEFAULT_TARGETS = {
  prod: {
    adminBaseUrl: "https://ministerio.idcredentor.org",
    tokenEnvVar: "PREDICA_INGEST_TOKEN_PROD",
    headerTarget: "production",
  },
  staging: {
    adminBaseUrl: "https://staging.ministerio.idcredentor.org",
    tokenEnvVar: "PREDICA_INGEST_TOKEN_STAGING",
    headerTarget: "staging",
  },
};

const DEFAULT_ENV_FILES = [".env.local", "apps/admin/.env.local"];

/** Denied production admin/website hosts when `--test` is active (`R2`). */
const PRODUCTION_HOST_DENY = new Set([
  "ministerio.idcredentor.org",
  "idc-redentor-admin.vercel.app",
  "idcredentor.org",
  "www.idcredentor.org",
  "idcredentor.com",
  "www.idcredentor.com",
  "idc-redentor-web.vercel.app",
  "idc-redentor-website.vercel.app",
]);

const MEDIA_CAPS_BY_TYPE = {
  "image/jpeg": 15 * 1024 * 1024,
  "image/png": 15 * 1024 * 1024,
  "image/webp": 15 * 1024 * 1024,
  "application/pdf": 25 * 1024 * 1024,
  "audio/mpeg": 200 * 1024 * 1024,
  "audio/mp4": 200 * 1024 * 1024,
};

const CONTENT_TYPE_ALIASES = {
  "image/jpg": "image/jpeg",
  "audio/mp3": "audio/mpeg",
  "audio/x-m4a": "audio/mp4",
};

export function normalizeContentType(raw) {
  const base = String(raw ?? "").split(";")[0].trim().toLowerCase();
  return CONTENT_TYPE_ALIASES[base] ?? base;
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

/** Reads `.claude/config.json` -> `predica.ingest` with safe defaults. */
export function loadPredicaIngestConfig(repoRoot = REPO_ROOT) {
  const configPath = path.join(repoRoot, ".claude", "config.json");
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    const ingest = raw?.predica?.ingest;
    if (ingest && typeof ingest === "object") {
      return {
        targets: {
          prod: {
            adminBaseUrl:
              ingest.targets?.prod?.adminBaseUrl ??
              DEFAULT_TARGETS.prod.adminBaseUrl,
            tokenEnvVar:
              ingest.targets?.prod?.tokenEnvVar ??
              DEFAULT_TARGETS.prod.tokenEnvVar,
            headerTarget: "production",
          },
          staging: {
            adminBaseUrl:
              ingest.targets?.staging?.adminBaseUrl ??
              DEFAULT_TARGETS.staging.adminBaseUrl,
            tokenEnvVar:
              ingest.targets?.staging?.tokenEnvVar ??
              DEFAULT_TARGETS.staging.tokenEnvVar,
            headerTarget: "staging",
          },
        },
        envFiles: Array.isArray(ingest.envFiles)
          ? ingest.envFiles
          : DEFAULT_ENV_FILES,
      };
    }
  } catch {
    // Fall back to canonical defaults
  }
  return {
    targets: DEFAULT_TARGETS,
    envFiles: DEFAULT_ENV_FILES,
  };
}

/**
 * Validates and normalizes `--admin-url` (`R2`):
 * - Requires `https:` everywhere, except `http://localhost` / `http://127.0.0.1` for local tests.
 * - Under `--test`, refuses every production host (case-insensitive, trailing dot stripped).
 */
export function validateAdminUrl(rawUrl, isTest) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: `Invalid admin URL: ${rawUrl}` };
  }

  const hostNormalized = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  const isLoopback =
    hostNormalized === "localhost" || hostNormalized === "127.0.0.1";

  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
    return {
      ok: false,
      error: `Refusing insecure admin URL (${parsed.protocol}): https: is required (http: allowed only for localhost/127.0.0.1)`,
    };
  }

  if (isTest && PRODUCTION_HOST_DENY.has(hostNormalized)) {
    return {
      ok: false,
      error: `Refusing production host '${hostNormalized}' when --test is set`,
    };
  }

  return { ok: true, origin: parsed.origin };
}

export function resolveTarget(options = {}, config = loadPredicaIngestConfig()) {
  const isTest = Boolean(options.test);
  const key = isTest ? "staging" : "prod";
  const baseTarget = config.targets[key];
  const rawUrl = options.adminUrl ?? baseTarget.adminBaseUrl;
  const checked = validateAdminUrl(rawUrl, isTest);
  if (!checked.ok) {
    return { ok: false, error: checked.error };
  }
  return {
    ok: true,
    targetKey: key,
    isTest,
    adminBaseUrl: checked.origin,
    tokenEnvVar: baseTarget.tokenEnvVar,
    headerTarget: baseTarget.headerTarget,
  };
}

/** Parses `KEY=VALUE` lines from a dotenv file without evaluating shell code. */
function readKeyFromDotenvFile(filePath, allowedKeys) {
  if (!existsSync(filePath)) return null;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!allowedKeys.includes(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val.length > 0) return val;
  }
  return null;
}

/**
 * Resolves the target's Bearer token strictly by environment:
 * 1. Explicit `--token-file <path>` (checks target env var, then bare `PREDICA_INGEST_TOKEN`)
 * 2. `env[target.tokenEnvVar]` (`PREDICA_INGEST_TOKEN_PROD` or `PREDICA_INGEST_TOKEN_STAGING`)
 * 3. Configured shared env files (`.env.local`, `apps/admin/.env.local`) for `target.tokenEnvVar` ONLY
 *    (never bare `PREDICA_INGEST_TOKEN` from a shared file, preventing cross-env mistakes).
 */
export function resolveIngestToken(target, options = {}) {
  const env = options.env ?? process.env;
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const envFiles = options.envFiles ?? DEFAULT_ENV_FILES;

  if (options.tokenFile) {
    const resolvedFile = path.resolve(options.tokenFile);
    if (!existsSync(resolvedFile)) {
      return {
        ok: false,
        error: `Token file not found: ${options.tokenFile}`,
      };
    }
    const token = readKeyFromDotenvFile(resolvedFile, [
      target.tokenEnvVar,
      "PREDICA_INGEST_TOKEN",
    ]);
    if (!token) {
      return {
        ok: false,
        error: `Token file ${options.tokenFile} does not define ${target.tokenEnvVar} or PREDICA_INGEST_TOKEN`,
      };
    }
    return { ok: true, token, source: options.tokenFile };
  }

  const fromEnv = env[target.tokenEnvVar]?.trim();
  if (fromEnv) {
    return { ok: true, token: fromEnv, source: `env:${target.tokenEnvVar}` };
  }

  for (const rel of envFiles) {
    const abs = path.isAbsolute(rel) ? rel : path.join(repoRoot, rel);
    const found = readKeyFromDotenvFile(abs, [target.tokenEnvVar]);
    if (found) {
      return { ok: true, token: found, source: `${rel}:${target.tokenEnvVar}` };
    }
  }

  const targetDesc = target.isTest ? "staging (--test)" : "production";
  return {
    ok: false,
    error: `Missing ${target.tokenEnvVar} for ${targetDesc} target (${target.adminBaseUrl}). Set ${target.tokenEnvVar} in your environment / .env.local or pass --token-file <path>. No requests were sent.`,
  };
}

/** Streams SHA-256 of a local file without loading large audio into RAM at once. */
export async function computeFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function authHeaders(token, target) {
  return {
    Authorization: `Bearer ${token}`,
    "X-Predica-Target": target.headerTarget,
  };
}

async function fetchJson(url, init, fetchFn = fetch) {
  let res;
  try {
    res = await fetchFn(url, init);
  } catch (err) {
    return {
      ok: false,
      networkError: true,
      status: 0,
      body: {
        ok: false,
        error: `Unable to reach admin endpoint ${url}: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { ok: false, error: text.slice(0, 300) || `HTTP ${res.status}` };
  }

  return {
    ok: res.ok,
    networkError: false,
    status: res.status,
    body,
  };
}

// ── Command Runners (exported for unit tests) ───────────────────────────────

export async function runHealth(ctx) {
  const url = `${ctx.target.adminBaseUrl}/api/predica/health`;
  const res = await fetchJson(
    url,
    {
      method: "GET",
      headers: authHeaders(ctx.token, ctx.target),
    },
    ctx.fetchFn,
  );
  if (!res.ok) {
    return { exitCode: 1, output: { ok: false, status: res.status, ...res.body } };
  }
  return { exitCode: 0, output: res.body };
}

export async function runLookup(ctx, { slug, sermonDate }) {
  const qs = new URLSearchParams({ slug });
  if (sermonDate) qs.set("sermonDate", sermonDate);
  const url = `${ctx.target.adminBaseUrl}/api/predica/sermons/lookup?${qs.toString()}`;
  const res = await fetchJson(
    url,
    {
      method: "GET",
      headers: authHeaders(ctx.token, ctx.target),
    },
    ctx.fetchFn,
  );
  if (!res.ok) {
    return { exitCode: 1, output: { ok: false, status: res.status, ...res.body } };
  }
  return { exitCode: 0, output: res.body };
}

export async function runUploadMedia(ctx, opts) {
  const normalizedType = normalizeContentType(opts.contentType);
  const cap = MEDIA_CAPS_BY_TYPE[normalizedType];
  if (!cap) {
    return {
      exitCode: 2,
      output: {
        ok: false,
        error: `Unsupported content type: ${opts.contentType}`,
      },
    };
  }

  let fileStat;
  try {
    fileStat = await stat(opts.file);
  } catch (err) {
    return {
      exitCode: 2,
      output: {
        ok: false,
        error: `Cannot stat file ${opts.file}: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  if (fileStat.size <= 0) {
    return {
      exitCode: 2,
      output: { ok: false, error: `File is empty: ${opts.file}` },
    };
  }

  if (fileStat.size > cap) {
    return {
      exitCode: 2,
      output: {
        ok: false,
        reason: "file-too-large",
        maxBytes: cap,
        actualBytes: fileStat.size,
        error: `File ${path.basename(opts.file)} (${formatBytes(fileStat.size)}) exceeds the ${formatBytes(cap)} cap for ${normalizedType}`,
      },
    };
  }

  const filename = opts.filename ?? path.basename(opts.file);
  const sha256 = await computeFileSha256(opts.file);

  // Step 1: Prepare (SHA-256 dedupe + server policy check + pathname allocation)
  const prepRes = await fetchJson(
    `${ctx.target.adminBaseUrl}/api/predica/media/prepare`,
    {
      method: "POST",
      headers: {
        ...authHeaders(ctx.token, ctx.target),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename,
        contentType: normalizedType,
        size: fileStat.size,
        sha256,
      }),
    },
    ctx.fetchFn,
  );

  if (!prepRes.ok) {
    return {
      exitCode: prepRes.status === 413 ? 2 : 1,
      output: { ok: false, status: prepRes.status, ...prepRes.body },
    };
  }

  if (prepRes.body.status === "duplicate" && prepRes.body.media) {
    return {
      exitCode: 0,
      output: {
        ok: true,
        reused: true,
        mediaId: prepRes.body.media._id,
        pathname: prepRes.body.media.pathname,
        url: prepRes.body.media.url,
        contentType: prepRes.body.media.contentType,
        size: prepRes.body.media.size,
      },
    };
  }

  const prepared = prepRes.body;

  // Step 2: Direct-to-Blob upload (8 MB multipart automatically for audio)
  const uploadFn = ctx.blobUploadFn ?? vercelBlobUpload;
  let blob;
  const body = createReadStream(opts.file);
  body.on("error", () => {
    // Handled via uploadFn rejection or cleanup destroy
  });
  try {
    blob = await uploadFn(prepared.pathname, body, {
      access: "public",
      handleUploadUrl: `${ctx.target.adminBaseUrl}/api/predica/media/upload`,
      headers: authHeaders(ctx.token, ctx.target),
      multipart: Boolean(prepared.multipart),
      contentType: prepared.normalizedContentType,
      clientPayload: JSON.stringify({
        mediaId: prepared.mediaId,
        contentType: prepared.normalizedContentType,
        size: fileStat.size,
      }),
    });
  } catch (err) {
    return {
      exitCode: 1,
      output: {
        ok: false,
        error: `Direct-to-Blob upload failed for ${filename}: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  } finally {
    body.destroy();
  }

  // Step 3: Confirm (server verifies head() + magic bytes + inserts media doc)
  const confirmPayload = {
    mediaId: prepared.mediaId,
    pathname: blob.pathname,
    url: blob.url,
    filename,
    sha256,
    ...(opts.width !== undefined ? { width: opts.width } : {}),
    ...(opts.height !== undefined ? { height: opts.height } : {}),
    ...(opts.durationSeconds !== undefined
      ? { durationSeconds: opts.durationSeconds }
      : {}),
    title: {
      "es-AR": opts.titleEs,
      ...(opts.titleEn ? { "en-US": opts.titleEn } : {}),
    },
    ...(opts.decorative
      ? { decorative: true }
      : opts.altEs
        ? {
            alt: {
              "es-AR": opts.altEs,
              ...(opts.altEn ? { "en-US": opts.altEn } : {}),
            },
          }
        : {}),
  };

  const confirmRes = await fetchJson(
    `${ctx.target.adminBaseUrl}/api/predica/media/confirm`,
    {
      method: "POST",
      headers: {
        ...authHeaders(ctx.token, ctx.target),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(confirmPayload),
    },
    ctx.fetchFn,
  );

  if (!confirmRes.ok) {
    return {
      exitCode: 1,
      output: { ok: false, status: confirmRes.status, ...confirmRes.body },
    };
  }

  return {
    exitCode: 0,
    output: {
      ok: true,
      reused: false,
      mediaId: confirmRes.body.media._id,
      pathname: confirmRes.body.media.pathname,
      url: confirmRes.body.media.url,
      contentType: confirmRes.body.media.contentType,
      size: confirmRes.body.media.size,
    },
  };
}

export async function runIngest(ctx, opts) {
  let sermon;
  try {
    sermon = JSON.parse(await readFile(opts.sermonPath, "utf8"));
  } catch (err) {
    return {
      exitCode: 2,
      output: {
        ok: false,
        error: `Cannot read sermon JSON ${opts.sermonPath}: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  const errs = validateSermonJson(sermon);
  if (errs.length > 0) {
    return {
      exitCode: 2,
      output: { ok: false, error: "sermon.json schema errors", errors: errs },
    };
  }

  let links = {};
  if (opts.linksPath) {
    try {
      links = JSON.parse(await readFile(opts.linksPath, "utf8"));
    } catch (err) {
      return {
        exitCode: 2,
        output: {
          ok: false,
          error: `Cannot read links JSON ${opts.linksPath}: ${err instanceof Error ? err.message : String(err)}`,
        },
      };
    }
  }

  const payload = buildPredicaIngestPayload(sermon, links, {
    mode: opts.mode,
    docId: opts.docId,
    expectedRevision: opts.expectedRevision,
    overwrite: opts.overwrite,
    keepExistingFeaturedImage: opts.keepFeatured,
    queuePdfRebuild: opts.queuePdfRebuild,
  });

  const res = await fetchJson(
    `${ctx.target.adminBaseUrl}/api/predica/sermons`,
    {
      method: "POST",
      headers: {
        ...authHeaders(ctx.token, ctx.target),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    ctx.fetchFn,
  );

  if (res.status === 409 && res.body.reason === "conflict") {
    const editor = res.body.updatedByLabel ?? res.body.updatedBy ?? "unknown";
    const when = res.body.updatedAt ?? "unknown time";
    process.stderr.write(
      `Conflict: draft was edited by ${editor} at ${when} (current revision ${res.body.currentRevision}). Re-run with --overwrite only after explicit human confirmation.\n`,
    );
    return {
      exitCode: 4,
      output: { ok: false, status: 409, ...res.body },
    };
  }

  if (!res.ok) {
    return {
      exitCode: 1,
      output: { ok: false, status: res.status, ...res.body },
    };
  }

  return { exitCode: 0, output: res.body };
}

// ── CLI Entrypoint ──────────────────────────────────────────────────────────

function getFlag(args, name) {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  if (val === undefined || val.startsWith("--")) {
    throw new Error(`Flag ${name} requires a value`);
  }
  return val;
}

function getOptionalNumberFlag(args, name) {
  const raw = getFlag(args, name);
  if (raw === undefined) return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    throw new Error(`Flag ${name} must be a finite number`);
  }
  return num;
}

function usage() {
  process.stderr.write(
    [
      "usage: node .claude/scripts/predica/predica-ingest-client.mjs <command> [options]",
      "",
      "commands:",
      "  health        Verify token, target environment, and trial mode",
      "  lookup        Gate 0 lookup (--slug <slug> [--sermon-date YYYY-MM-DD])",
      "  upload-media  Prepare + direct-to-Blob upload + confirm one file",
      "  ingest        Create or update draft sermon (--sermon <path> --mode create|update ...)",
      "",
      "global flags:",
      "  --test                Target staging instead of production",
      "  --admin-url <url>     Override admin base URL (https required; prod denied under --test)",
      "  --token-file <path>   Read target token from a 0600 env file",
      "",
    ].join("\n"),
  );
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === "-h" || cmd === "--help") {
    usage();
    process.exit(cmd ? 0 : 2);
  }

  const isTest = args.includes("--test");
  const adminUrl = getFlag(args, "--admin-url");
  const tokenFile = getFlag(args, "--token-file");

  const config = loadPredicaIngestConfig();
  const target = resolveTarget({ test: isTest, adminUrl }, config);
  if (!target.ok) {
    process.stderr.write(`error: ${target.error}\n`);
    process.exit(2);
  }

  process.stderr.write(
    `[predica-ingest] Target: ${target.headerTarget} (${target.adminBaseUrl})\n`,
  );

  const tokenRes = resolveIngestToken(target, {
    tokenFile,
    envFiles: config.envFiles,
  });
  if (!tokenRes.ok) {
    process.stderr.write(`error: ${tokenRes.error}\n`);
    process.exit(2);
  }

  const ctx = { target, token: tokenRes.token };
  let result;

  if (cmd === "health") {
    result = await runHealth(ctx);
    if (result.exitCode === 0 && result.output.trialMode) {
      process.stderr.write(
        "[predica-ingest] WARNING: Admin is in pre-cutover trial mode — drafts written before cutover may be overwritten by the final migration import.\n",
      );
    }
  } else if (cmd === "lookup") {
    const slug = getFlag(args, "--slug");
    if (!slug) throw new Error("lookup requires --slug <slug>");
    const sermonDate = getFlag(args, "--sermon-date");
    result = await runLookup(ctx, { slug, sermonDate });
  } else if (cmd === "upload-media") {
    const file = getFlag(args, "--file");
    const contentType = getFlag(args, "--content-type");
    const titleEs = getFlag(args, "--title-es");
    if (!file || !contentType || !titleEs) {
      throw new Error(
        "upload-media requires --file <path> --content-type <mime> --title-es <title>",
      );
    }
    result = await runUploadMedia(ctx, {
      file,
      contentType,
      filename: getFlag(args, "--filename"),
      titleEs,
      titleEn: getFlag(args, "--title-en"),
      altEs: getFlag(args, "--alt-es"),
      altEn: getFlag(args, "--alt-en"),
      decorative: args.includes("--decorative"),
      width: getOptionalNumberFlag(args, "--width"),
      height: getOptionalNumberFlag(args, "--height"),
      durationSeconds: getOptionalNumberFlag(args, "--duration-seconds"),
    });
  } else if (cmd === "ingest") {
    const sermonPath = getFlag(args, "--sermon");
    const mode = getFlag(args, "--mode") ?? "create";
    if (!sermonPath) throw new Error("ingest requires --sermon <sermon.json>");
    if (mode !== "create" && mode !== "update") {
      throw new Error("--mode must be 'create' or 'update'");
    }
    const docId = getFlag(args, "--doc-id");
    const expectedRevision = getOptionalNumberFlag(args, "--expected-revision");
    if (mode === "update" && (!docId || expectedRevision === undefined)) {
      throw new Error("ingest --mode update requires --doc-id and --expected-revision");
    }
    result = await runIngest(ctx, {
      sermonPath,
      linksPath: getFlag(args, "--links"),
      mode,
      docId,
      expectedRevision,
      overwrite: args.includes("--overwrite"),
      keepFeatured: args.includes("--keep-featured"),
      queuePdfRebuild: args.includes("--queue-pdf-rebuild"),
    });
  } else {
    process.stderr.write(`error: unknown command '${cmd}'\n`);
    usage();
    process.exit(2);
  }

  process.stdout.write(JSON.stringify(result.output, null, 2) + "\n");
  process.exit(result.exitCode);
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(
      `error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(2);
  });
}
