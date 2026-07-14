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
 */
export function resolveInterpreted(input: {
  flag?: boolean;
  sermon?: { interpreted?: boolean } | null;
}): boolean {
  return input.flag === true || input.sermon?.interpreted === true;
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
