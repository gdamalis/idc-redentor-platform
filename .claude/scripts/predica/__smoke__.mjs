#!/usr/bin/env node
/**
 * Regression smoke check for the root-invoked /predica harness scripts (ICR-145, ICR-116, ICR-204).
 *
 * Runs the render scripts (PDF + featured image) and the admin-ingest payload
 * builder against the committed fixture, asserting each exits 0 AND produces a
 * positive signal — a non-empty output file for the renderers, explicit stdout
 * markers for the validator and TipTap payload builder.
 *
 * Two things are guarded:
 *   1. Bare-specifier resolution of "@playwright/test" from the repo root (ICR-145):
 *      before that fix these scripts died with ERR_MODULE_NOT_FOUND, because
 *      @playwright/test was installed only into apps/web/node_modules and Node's
 *      resolution walk never reaches it.
 *   2. Fixture/schema drift (ICR-116, ICR-204): the committed fixture must satisfy
 *      BOTH validateSermon (renderers) and validateSermonJson + buildPredicaIngestPayload
 *      (admin ingest publisher).
 *
 * Hermetic by construction: the featured script runs with --no-ai and the payload
 * builder runs offline (summary + --payload), so there is no network call and no
 * API key or service token is required.
 *
 * Usage: pnpm predica:smoke
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "__fixtures__", "sample-sermon.json");

/** Outputs below this are treated as truncated/empty rather than a real render. */
const MIN_BYTES = 1024;

const CASES = [
  {
    script: "build-predica-pdf.mjs",
    args: [],
    usesOutDir: true,
    outputs: ["predica.es-AR.pdf", "predica.en-US.pdf"],
  },
  {
    script: "build-predica-featured.mjs",
    args: ["--no-ai"],
    usesOutDir: true,
    outputs: ["featured.png"],
  },
  {
    // Schema gate (ICR-116 / ICR-204). The committed fixture must stay valid for
    // the admin-ingest payload builder, not just the renderers.
    // Hermetic: invoked with no flags this script is a pure validate-and-summarise
    // dry run — no network, no credentials, no writes.
    script: "build-sermon-payload.mjs",
    args: [],
    usesOutDir: false,
    outputs: [],
    stdoutIncludes: "sermon.json: VALID",
  },
  {
    // Payload-shaping gate (ICR-204): verify --payload emits valid TipTap JSON
    // for POST /api/predica/sermons with zero network or credentials.
    script: "build-sermon-payload.mjs",
    args: ["--payload"],
    usesOutDir: false,
    outputs: [],
    assertJson: (parsed) => {
      if (parsed?.mode !== "create") return "expected mode='create'";
      if (parsed?.sermon?.content?.["es-AR"]?.type !== "doc") {
        return "expected TipTap doc in sermon.content['es-AR']";
      }
      if (parsed?.sermon?.content?.["en-US"]?.type !== "doc") {
        return "expected TipTap doc in sermon.content['en-US']";
      }
      if ("published" in parsed || "published" in (parsed.sermon ?? {})) {
        return "payload must never include published state";
      }
      return null;
    },
  },
];

let failures = 0;

/** @param {string} msg */
function fail(msg) {
  process.stderr.write(`✗ ${msg}\n`);
  failures += 1;
}

const outDir = mkdtempSync(path.join(tmpdir(), "predica-smoke-"));

try {
  if (!existsSync(FIXTURE)) {
    fail(`fixture not found: ${FIXTURE}`);
  } else {
    for (const {
      script,
      args,
      usesOutDir,
      outputs,
      stdoutIncludes,
      assertJson,
    } of CASES) {
      const scriptPath = path.join(HERE, script);
      const label = args.length > 0 ? `${script} ${args.join(" ")}` : script;
      const res = spawnSync(
        process.execPath,
        [
          scriptPath,
          FIXTURE,
          ...args,
          ...(usesOutDir ? ["--out", outDir] : []),
        ],
        { encoding: "utf8" },
      );

      if (res.error) {
        fail(`${label}: could not spawn — ${res.error.message}`);
        continue;
      }
      if (res.status !== 0) {
        fail(
          `${label}: exited ${res.status}\n` +
            `--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`,
        );
        continue;
      }

      if (stdoutIncludes) {
        if (!res.stdout.includes(stdoutIncludes)) {
          fail(
            `${label}: stdout did not contain ${JSON.stringify(stdoutIncludes)}\n` +
              `--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`,
          );
          continue;
        }
        process.stdout.write(`✓ ${label} → ${stdoutIncludes}\n`);
      }

      if (assertJson) {
        let parsed;
        try {
          parsed = JSON.parse(res.stdout);
        } catch (err) {
          fail(`${label}: stdout was not valid JSON (${err.message})`);
          continue;
        }
        const errMsg = assertJson(parsed);
        if (errMsg) {
          fail(`${label}: ${errMsg}`);
          continue;
        }
        process.stdout.write(`✓ ${label} → valid TipTap ingest payload\n`);
      }

      for (const name of outputs) {
        const outPath = path.join(outDir, name);
        if (!existsSync(outPath)) {
          fail(`${label}: expected output missing: ${name}`);
          continue;
        }
        const { size } = statSync(outPath);
        if (size < MIN_BYTES) {
          fail(
            `${label}: ${name} is only ${size} bytes (expected >= ${MIN_BYTES})`,
          );
          continue;
        }
        process.stdout.write(`✓ ${label} → ${name} (${size} bytes)\n`);
      }
    }
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures > 0) {
  process.stderr.write(`\n✗ predica smoke FAILED (${failures} problem(s))\n`);
  process.exit(1);
}

process.stdout.write(
  "\n✓ predica smoke passed — scripts resolved @playwright/test, rendered PDFs/card, and built TipTap payload\n",
);
