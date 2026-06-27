import { describe, it, expect } from "vitest";
import { isValidSlug } from "./slug";

describe("isValidSlug", () => {
  it("accepts kebab-case slugs", () => {
    for (const good of [
      "privacidad",
      "quien-es-jesus",
      "la-gracia-de-dios",
      "post-123",
      "2026-06-14",
      "a",
    ]) {
      expect(isValidSlug(good)).toBe(true);
    }
  });

  it("rejects off-shape and injection input (GraphQL injection guard)", () => {
    for (const bad of [
      'a" }) { __typename } #', // GraphQL break-out
      '" }) {',
      '"',
      "Privacy", // uppercase
      "a b", // whitespace
      "../secret", // path traversal
      "a/b", // slash
      "a_b", // underscore
      "-leading",
      "trailing-",
      "double--hyphen",
      "café", // non-ascii
      "", // empty
    ]) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });
});
