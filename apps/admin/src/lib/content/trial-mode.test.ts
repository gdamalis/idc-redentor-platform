import { describe, expect, it } from "vitest";
import { isContentTrialMode } from "./trial-mode";

describe("isContentTrialMode", () => {
  it("defaults to true (fail-safe) when unset or blank", () => {
    expect(isContentTrialMode({})).toBe(true);
    expect(isContentTrialMode({ CONTENT_TRIAL_MODE: "" })).toBe(true);
    expect(isContentTrialMode({ CONTENT_TRIAL_MODE: "true" })).toBe(true);
  });

  it("returns false only when explicitly set to 'false'", () => {
    expect(isContentTrialMode({ CONTENT_TRIAL_MODE: "false" })).toBe(false);
    expect(isContentTrialMode({ CONTENT_TRIAL_MODE: " FALSE " })).toBe(false);
    expect(isContentTrialMode({ CONTENT_TRIAL_MODE: "0" })).toBe(true);
  });
});
