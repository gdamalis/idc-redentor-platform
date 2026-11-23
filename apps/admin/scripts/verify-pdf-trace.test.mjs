// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hasTracedAsset } from "./verify-pdf-trace.mjs";

describe("verify-pdf-trace (admin)", () => {
  it("matches exact filename or trailing path segment only", () => {
    expect(
      hasTracedAsset(
        [
          "../../../node_modules/.pnpm/playwright-core@1.61.0/node_modules/playwright-core/browsers.json",
        ],
        "browsers.json",
      ),
    ).toBe(true);
    expect(hasTracedAsset(["browsers.json"], "browsers.json")).toBe(true);
    expect(hasTracedAsset(["foo-browsers.json"], "browsers.json")).toBe(false);
    expect(hasTracedAsset([], "browsers.json")).toBe(false);
  });
});
