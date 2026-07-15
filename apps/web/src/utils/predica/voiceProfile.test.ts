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

  // Regression: a strict `=== true` check let a MALFORMED interpreted field read as "not
  // interpreted", which would hand an interpreted transcript to the voice coach — the exact
  // hole this module exists to close, re-opened by a typo. sermon.json is written by an LLM and
  // may be hand-edited, so a string "true" or a 1 is an ordinary slip, not a contrived input.
  // Fail closed: anything that is not cleanly absent/null/false counts as interpreted.
  describe("fails CLOSED on a malformed `interpreted` field", () => {
    it.each([
      ["the STRING \"true\"", "true"],
      ["the STRING \"false\" (still malformed — a boolean was required)", "false"],
      ["the number 1", 1],
      ["the number 0", 0],
      ["an object", {}],
      ["an empty string", ""],
    ])("treats %s as INTERPRETED", (_label, value) => {
      expect(resolveInterpreted({ sermon: { interpreted: value } })).toBe(true);
    });

    it("still treats a CLEAN false/null/absent as not interpreted (no false positives)", () => {
      expect(resolveInterpreted({ sermon: { interpreted: false } })).toBe(false);
      expect(resolveInterpreted({ sermon: { interpreted: null } })).toBe(false);
      expect(resolveInterpreted({ sermon: { interpreted: undefined } })).toBe(false);
    });
  });

  // Regression: a SUPPLIED sermon.json whose top-level value is not a usable object (a corrupt or
  // truncated file parses fine as an array / string / number) carries no readable provenance. A
  // strict property read (`sermon?.interpreted`) yields undefined and would wrongly read as "not
  // interpreted" — failing OPEN on exactly the malformed persisted state this guard must survive.
  describe("fails CLOSED on a non-object sermon.json", () => {
    it.each([
      ["an array", ["not", "an", "object"]],
      ["a bare string", "just a string"],
      ["a bare number", 42],
    ])("treats %s as INTERPRETED (a supplied file we cannot read is not a clean 'no')", (_label, value) => {
      expect(resolveInterpreted({ sermon: value })).toBe(true);
    });

    it("still treats NO persisted sermon (undefined/null) as a clean first run (flag decides)", () => {
      expect(resolveInterpreted({ sermon: undefined })).toBe(false);
      expect(resolveInterpreted({ sermon: null })).toBe(false);
      expect(resolveInterpreted({ flag: true, sermon: null })).toBe(true);
    });
  });

  // Regression: `interpreter` recorded WITHOUT `interpreted: true` is a schema-legal half-populated
  // document (a hand-edit that dropped one line). Reading it as "not interpreted" would hand the
  // coach an interpreted transcript with the interpreter's own name sitting unused in the same file.
  describe("treats a recorded interpreter as a declaration, even without `interpreted: true`", () => {
    it("refuses when interpreter.name is present but interpreted is absent", () => {
      expect(
        resolveInterpreted({ sermon: { interpreter: { name: "Jonathan Hanegan" } } }),
      ).toBe(true);
    });

    it("does NOT refuse for an empty/blank interpreter (nothing was actually declared)", () => {
      expect(resolveInterpreted({ sermon: { interpreter: { name: "  " } } })).toBe(false);
      expect(resolveInterpreted({ sermon: { interpreter: {} } })).toBe(false);
      expect(resolveInterpreted({ sermon: { interpreter: null } })).toBe(false);
    });
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
