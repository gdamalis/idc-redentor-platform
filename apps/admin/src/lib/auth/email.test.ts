import { describe, it, expect } from "vitest";
import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("lowercases and trims", () =>
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com"));

  it("returns empty string for nullish", () => {
    expect(normalizeEmail(null)).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
  });
});
