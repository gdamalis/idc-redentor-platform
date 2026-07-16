#!/usr/bin/env node
/**
 * check-voice-learn.mjs — the voice-learn guard the /predica orchestrator EXECUTES at
 * step 2.5, before dispatching predica-voice-coach (ICR-147).
 *
 * An INTERPRETED sermon's transcript is the INTERPRETER's speech, not the preacher's, so
 * it is a valid source for NOBODY's voice profile — not the preacher's, not the
 * interpreter's. predica-voice-coach is a pure-prose agent and cannot enforce that; this
 * script can, because it is run and its exit code is obeyed.
 *
 * Interpretation is HUMAN-DECLARED (--interpreted), never inferred from audio.
 * Do not build a detector: see docs/architecture/predica-voice-profiles.md.
 *
 * MUST MIRROR the canonical, Vitest-tested TypeScript at
 * apps/web/src/utils/predica/voiceProfile.ts. The parity test
 * apps/web/src/utils/predica/voiceProfile.parity.test.ts runs one case table through BOTH
 * impls and FAILS if they drift. Duplicated (not imported) because apps/web is the Vercel
 * Root Directory and cannot import out of itself — mirrors build-sermon-entry.mjs.
 *
 * Usage:
 *   node .claude/scripts/predica/check-voice-learn.mjs --preacher "<Full Name>" \
 *        [--interpreted] [--interpreter "<Full Name>"] [--sermon <path/to/sermon.json>]
 *
 * Exit codes:
 *   0 — may learn      (stdout: {"ok":true,"preacherSlug":"…"})
 *   3 — REFUSED        (stdout: {"ok":false,"reason":"interpreted"|"missing-preacher"})
 *   2 — usage/IO error (stderr: the message)
 */
import { readFileSync } from "node:fs";

const USAGE =
  'usage: check-voice-learn.mjs --preacher "<Full Name>" [--interpreted] ' +
  '[--interpreter "<Full Name>"] [--sermon <sermon.json>]';

function die(code, msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(code);
}

// ── Mirrored from voiceProfile.ts ────────────────────────────────────────────

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function slugifyPersonName(name) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * FAIL-CLOSED on malformed persisted state. sermon.json is written by an LLM and may be
 * hand-edited, so its shape and its `interpreted` field cannot be trusted. Anything we cannot read
 * as a clean "not interpreted" is treated as INTERPRETED (refuse). See voiceProfile.ts for the full
 * rationale — this is a hand-mirror of it and the parity test enforces the match.
 */
export function resolveInterpreted(input) {
  if (input.flag === true) return true;

  const { sermon } = input;

  if (sermon === undefined || sermon === null) return false;

  // A supplied-but-non-object sermon.json (corrupt/truncated → parses as an array/string/number)
  // carries no readable provenance; do not conclude "not interpreted" from it.
  if (!isPlainObject(sermon)) return true;

  const interpreted = sermon.interpreted;
  if (interpreted !== undefined && interpreted !== null && interpreted !== false) return true;

  // An interpreter recorded WITHOUT `interpreted: true` is half-populated; their presence is itself
  // a declaration that this was interpreted.
  const { interpreter } = sermon;
  if (
    isPlainObject(interpreter) &&
    typeof interpreter.name === "string" &&
    interpreter.name.trim() !== ""
  ) {
    return true;
  }

  return false;
}

export function canLearnVoiceFrom(run) {
  if (run.interpreted) return { ok: false, reason: "interpreted" };

  const preacherSlug = slugifyPersonName(run.preacher);
  if (!preacherSlug) return { ok: false, reason: "missing-preacher" };

  return { ok: true, preacherSlug };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const KNOWN_FLAGS = new Set(["--interpreted", "--interpreter", "--preacher", "--sermon"]);

function main() {
  const argv = process.argv.slice(2);
  let preacher = "";
  let flag = false;
  let sermonPath = null;

  // Consume the value token for an option, refusing to silently swallow the NEXT flag as a value.
  // Without this, `--preacher --interpreted` would set preacher="--interpreted" and DROP the guard
  // flag — degrading the guard instead of erroring. A missing/flag-looking value is a usage error.
  const takeValue = (i, opt) => {
    const next = argv[i + 1];
    if (next === undefined || KNOWN_FLAGS.has(next)) die(2, `${opt}: expected a value\n${USAGE}`);
    return next;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--interpreted") {
      flag = true;
    } else if (arg === "--interpreter") {
      // The interpreter's NAME is irrelevant to the decision — an interpreted run is
      // refused for every name. Naming one still IMPLIES the run is interpreted, and the
      // implication only ever runs toward MORE guarding, never less.
      flag = true;
      takeValue(i, "--interpreter");
      i++;
    } else if (arg === "--preacher") {
      preacher = takeValue(i, "--preacher");
      i++;
    } else if (arg === "--sermon") {
      sermonPath = takeValue(i, "--sermon");
      i++;
    } else {
      die(2, `unknown argument: ${arg}\n${USAGE}`);
    }
  }

  let sermon = null;
  if (sermonPath) {
    try {
      sermon = JSON.parse(readFileSync(sermonPath, "utf8"));
    } catch (e) {
      die(2, `error: cannot read ${sermonPath}: ${e?.message ?? e}`);
    }
  }

  const interpreted = resolveInterpreted({ flag, sermon });
  const decision = canLearnVoiceFrom({ interpreted, preacher });

  process.stdout.write(`${JSON.stringify(decision)}\n`);
  process.exit(decision.ok ? 0 : 3);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main();
}
