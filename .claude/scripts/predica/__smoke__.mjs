#!/usr/bin/env node
/**
 * Regression smoke check for the root-invoked /predica harness scripts (ICR-145).
 *
 * Runs the PDF + featured-image scripts against the committed fixture and asserts
 * each one exits 0 AND writes a non-empty output. This guards the bare-specifier
 * resolution of "@playwright/test" from the repo root: before ICR-145 these scripts
 * died with ERR_MODULE_NOT_FOUND, because @playwright/test was installed only into
 * apps/web/node_modules and Node's resolution walk never reaches it.
 *
 * Hermetic by construction: the featured script runs with --no-ai, so there is no
 * network call and no GEMINI_API_KEY is required.
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
    outputs: ["predica.es-AR.pdf", "predica.en-US.pdf"],
  },
  {
    script: "build-predica-featured.mjs",
    args: ["--no-ai"],
    outputs: ["featured.png"],
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
    for (const { script, args, outputs } of CASES) {
      const scriptPath = path.join(HERE, script);
      const res = spawnSync(
        process.execPath,
        [scriptPath, FIXTURE, ...args, "--out", outDir],
        { encoding: "utf8" },
      );

      if (res.error) {
        fail(`${script}: could not spawn — ${res.error.message}`);
        continue;
      }
      if (res.status !== 0) {
        fail(
          `${script}: exited ${res.status}\n` +
            `--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`,
        );
        continue;
      }

      // Assert positively: the artifact must exist AND be non-empty. A check that
      // passes when nothing ran is worse than no check at all.
      for (const name of outputs) {
        const outPath = path.join(outDir, name);
        if (!existsSync(outPath)) {
          fail(`${script}: expected output missing: ${name}`);
          continue;
        }
        const { size } = statSync(outPath);
        if (size < MIN_BYTES) {
          fail(
            `${script}: ${name} is only ${size} bytes (expected >= ${MIN_BYTES})`,
          );
          continue;
        }
        process.stdout.write(`✓ ${script} → ${name} (${size} bytes)\n`);
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
  "\n✓ predica smoke passed — scripts resolved @playwright/test and rendered\n",
);
