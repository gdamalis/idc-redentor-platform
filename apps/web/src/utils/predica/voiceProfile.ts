/**
 * The voice-learn guard (ICR-147).
 *
 * An INTERPRETED sermon (a preacher speaking one language while an interpreter renders
 * it live into another) produces a transcript of the INTERPRETER's speech. Whisper locks
 * onto whoever is louder, and that is the interpreter. Such a transcript is therefore a
 * valid source for NOBODY's voice profile:
 *   - not the PREACHER's — the words are not theirs;
 *   - not the INTERPRETER's — they are rendering someone else's content, not preaching.
 *
 * `predica-voice-coach` is a pure-prose agent and cannot enforce that. This module can,
 * and the orchestrator executes it (via the .mjs twin) before dispatching the coach.
 *
 * Interpretation is HUMAN-DECLARED (`--interpreted`), never inferred from audio: a whisper
 * language-ID sweep of a known interpreted sermon reported Spanish at p≈0.999 in 43/43
 * windows and missed the preacher's English entirely. Do not build a detector.
 *
 * CANONICAL IMPL. Its executable twin is .claude/scripts/predica/check-voice-learn.mjs —
 * keep the two in sync; voiceProfile.parity.test.ts fails if they drift.
 *
 * See docs/architecture/predica-voice-profiles.md.
 */

/** One `/predica` run, as far as the voice-learn decision is concerned. */
export interface VoiceLearnRun {
  /** True when the audio is a live interpretation (human-declared, never detected). */
  interpreted: boolean;
  /** The preacher's full name, e.g. "Doug Wagner". */
  preacher: string;
}

/** Whether the voice coach may learn from this run — and if not, why not. */
export type VoiceLearnDecision =
  | { ok: true; preacherSlug: string }
  | { ok: false; reason: "interpreted" | "missing-preacher" };

/** A non-null, non-array object we can safely read keys off. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Transliterate → lowercase → dash-collapse. The profile filename must be ASCII-stable
 * ("Jonathan Hanegán" → "jonathan-hanegan"), so accents are stripped rather than encoded.
 */
export function slugifyPersonName(name: string): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The EFFECTIVE interpreted-ness of a run: the CLI flag OR the persisted sermon.json.
 *
 * The OR is the whole point. On a regenerate the human may forget `--interpreted`; the
 * sermon.json written by the first run still says so, and a forgotten flag must never be
 * able to re-open the hole.
 *
 * FAIL-CLOSED ON A MALFORMED FIELD. `sermon.json` is produced by an LLM (predica-writer) and
 * may be hand-edited, so `interpreted` can arrive as the STRING "true", as `1`, or as any
 * other non-boolean. A strict `=== true` check would read those as NOT interpreted and let the
 * coach learn from an interpreted transcript — the precise hole this module exists to close,
 * re-opened by a typo. So anything that is not cleanly absent/null/false is treated as
 * INTERPRETED (i.e. refuse).
 *
 * The asymmetry justifies it: refusing costs one voice-profile append that the next run redoes;
 * wrongly allowing one writes the interpreter's voice into the preacher's append-only profile,
 * forever. Note `validateSermonForEntry()` rejects a non-boolean `interpreted` too — but that
 * runs at step 3, AFTER the writer has already put the file on disk, so step 2.5 cannot rely
 * on it having run.
 */
export function resolveInterpreted(input: { flag?: boolean; sermon?: unknown }): boolean {
  if (input.flag === true) return true;

  const { sermon } = input;

  // No persisted state at all (a first run) — the flag alone decides.
  if (sermon === undefined || sermon === null) return false;

  // A sermon.json WAS supplied but is not a usable object (a corrupt/truncated file parses fine as
  // an array, a string, a number...). We cannot read provenance out of it, so we must not conclude
  // "not interpreted" — that is failing OPEN on exactly the malformed persisted state this guard is
  // meant to survive.
  if (!isPlainObject(sermon)) return true;

  const interpreted = sermon.interpreted;
  if (interpreted !== undefined && interpreted !== null && interpreted !== false) return true;

  // An interpreter recorded WITHOUT `interpreted: true` is a half-populated document — e.g. a
  // hand-edit that deleted one line, or a writer that emitted only half the pair. It is schema-legal
  // today, and reading it as "not interpreted" would hand the coach an interpreted transcript while
  // the interpreter's own name sits unused in the very same file. Their presence IS the declaration.
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

/**
 * THE GUARD. Refuses whenever the run is interpreted — for ANY `preacher` value.
 *
 * That universality is deliberate: it makes "a valid source for nobody's profile" true by
 * construction. There is no name a caller can pass that yields a write on an interpreted run.
 */
export function canLearnVoiceFrom(run: VoiceLearnRun): VoiceLearnDecision {
  if (run.interpreted) return { ok: false, reason: "interpreted" };

  const preacherSlug = slugifyPersonName(run.preacher);
  if (!preacherSlug) return { ok: false, reason: "missing-preacher" };

  return { ok: true, preacherSlug };
}
