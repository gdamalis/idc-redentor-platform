import { COLLECTIONS } from "@idcr/content";
import { describe, expect, it } from "vitest";

// Contract: the public site resolves the shared content package (raw TS via transpilePackages).
// No runtime import in app code until ICR-201 swaps the read layer.
describe("@idcr/content (apps/web)", () => {
  it("resolves the shared content model", () => {
    expect(COLLECTIONS.sermons).toBe("sermons");
  });
});
