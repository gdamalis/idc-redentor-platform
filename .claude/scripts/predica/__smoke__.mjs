#!/usr/bin/env node
/**
 * Regression smoke check for the root-invoked /predica harness scripts (ICR-145, ICR-116).
 *
 * Runs the render scripts (PDF + featured image) and the Contentful-entry schema
 * validator against the committed fixture, asserting each exits 0 AND produces a
 * positive signal — a non-empty output file for the renderers, an explicit stdout
 * marker for the validator.
 *
 * Two things are guarded:
 *   1. Bare-specifier resolution of "@playwright/test" from the repo root (ICR-145):
 *      before that fix these scripts died with ERR_MODULE_NOT_FOUND, because
 *      @playwright/test was installed only into apps/web/node_modules and Node's
 *      resolution walk never reaches it.
 *   2. Fixture/schema drift (ICR-116): the committed fixture must satisfy BOTH
 *      validateSermon (renderers) and validateSermonForEntry (publisher). It
 *      previously satisfied only the first, silently.
 *
 * Hermetic by construction: the featured script runs with --no-ai and the entry
 * builder runs as a dry run, so there is no network call and no API key is required.
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
    // Schema gate (ICR-116). The committed fixture must stay valid for the
    // Contentful ENTRY builder, not just the renderers — the two validators are
    // different, and the fixture used to satisfy only the first.
    //
    // Hermetic: invoked with no flags this script is a pure validate-and-summarise
    // dry run (see build-sermon-entry.mjs:18) — no network, no credentials, no
    // writes — so it is safe in CI. If that ever stops being true, this case has to
    // be reconsidered rather than quietly dropped.
    script: "build-sermon-entry.mjs",
    args: [],
    usesOutDir: false,
    outputs: [],
    stdoutIncludes: "sermon.json: VALID",
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
    } of CASES) {
      const scriptPath = path.join(HERE, script);
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

      // Assert positively, same discipline as the byte-size check below: a validator
      // that printed nothing is indistinguishable from one that never ran.
      if (stdoutIncludes) {
        if (!res.stdout.includes(stdoutIncludes)) {
          fail(
            `${script}: stdout did not contain ${JSON.stringify(stdoutIncludes)}\n` +
              `--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`,
          );
          continue;
        }
        process.stdout.write(`✓ ${script} → ${stdoutIncludes}\n`);
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
