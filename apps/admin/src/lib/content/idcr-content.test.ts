import { COLLECTIONS } from "@idcr/content";
import { describe, expect, it } from "vitest";

// Contract: the public site resolves the shared content package (raw TS via transpilePackages).
// No runtime import in app code until ICR-195 adds the content services.
describe("@idcr/content (apps/admin)", () => {
  it("resolves the shared content model", () => {
    expect(COLLECTIONS.sermons).toBe("sermons");
  });
});
