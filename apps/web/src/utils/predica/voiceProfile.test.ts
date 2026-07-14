/**
 * Unit tests for the voice-learn guard. An INTERPRETED sermon's transcript is the
 * interpreter's speech, not the preacher's — so it is a valid source for NOBODY's
 * voice profile. These tests are the enforceable proof of that rule (ICR-147).
 */
import { describe, it, expect } from "vitest";
import {
  canLearnVoiceFrom,
  resolveInterpreted,
  slugifyPersonName,
} from "@src/utils/predica/voiceProfile";

describe("slugifyPersonName", () => {
  it("transliterates, lowercases and dash-collapses a full name", () => {
    expect(slugifyPersonName("Jonathan Hanegan")).toBe("jonathan-hanegan");
  });

  it("strips accents (the profile filename must be ASCII-stable)", () => {
    expect(slugifyPersonName("Jonathan Hanegán")).toBe("jonathan-hanegan");
  });

  it("collapses punctuation and repeated separators", () => {
    expect(slugifyPersonName("  Doug   W. Wagner  ")).toBe("doug-w-wagner");
  });

  it("returns an empty string for a name with no usable characters", () => {
    expect(slugifyPersonName("   ")).toBe("");
  });
});

describe("resolveInterpreted", () => {
  it("is true from the CLI flag alone", () => {
    expect(resolveInterpreted({ flag: true, sermon: null })).toBe(true);
  });

  it("is true from a persisted sermon.json alone — a FORGOTTEN FLAG on a regenerate cannot re-open the hole", () => {
    expect(
      resolveInterpreted({ flag: undefined, sermon: { interpreted: true } }),
    ).toBe(true);
  });

  it("is false when neither the flag nor the sermon says so (the normal path)", () => {
    expect(resolveInterpreted({ flag: undefined, sermon: null })).toBe(false);
    expect(
      resolveInterpreted({ flag: false, sermon: { interpreted: false } }),
    ).toBe(false);
  });

  it("treats a legacy sermon.json with no interpreted field as NOT interpreted (back-compat)", () => {
    expect(resolveInterpreted({ sermon: {} })).toBe(false);
  });
});

describe("canLearnVoiceFrom", () => {
  it("REFUSES an interpreted run under the PREACHER's name", () => {
    expect(
      canLearnVoiceFrom({ interpreted: true, preacher: "Doug Wagner" }),
    ).toEqual({
      ok: false,
      reason: "interpreted",
    });
  });

  it("REFUSES an interpreted run under the INTERPRETER's own name — a valid source for NOBODY", () => {
    expect(
      canLearnVoiceFrom({ interpreted: true, preacher: "Jonathan Hanegan" }),
    ).toEqual({
      ok: false,
      reason: "interpreted",
    });
  });

  it("allows a normal (non-interpreted) run and returns the profile slug", () => {
    expect(
      canLearnVoiceFrom({ interpreted: false, preacher: "Jonathan Hanegan" }),
    ).toEqual({
      ok: true,
      preacherSlug: "jonathan-hanegan",
    });
  });

  it("refuses when the preacher is missing — fail closed, never name a profile file from nothing", () => {
    expect(canLearnVoiceFrom({ interpreted: false, preacher: "   " })).toEqual({
      ok: false,
      reason: "missing-preacher",
    });
  });

  it("reports `interpreted` (not `missing-preacher`) when BOTH are wrong — interpretation is the stronger refusal", () => {
    expect(canLearnVoiceFrom({ interpreted: true, preacher: "" })).toEqual({
      ok: false,
      reason: "interpreted",
    });
  });
});
