export type TrialModeEnv = Readonly<Record<string, string | undefined>>;

/**
 * Pre-cutover trial mode setting (`ICR-197` AC9, `F-editor-ux-decisions.md` §13.7,
 * exported for `ICR-204` reuse).
 *
 * Fail-safe default ON: returns `true` everywhere (including production) until
 * `CONTENT_TRIAL_MODE` is explicitly set to `"false"` at cutover (`ICR-206`).
 */
export function isContentTrialMode(env: TrialModeEnv = process.env): boolean {
  return env.CONTENT_TRIAL_MODE?.trim().toLowerCase() !== "false";
}
