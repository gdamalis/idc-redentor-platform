// @vitest-environment node
import { describe, expect, it } from "vitest";

import { hasTracedAsset } from "./verify-pdf-trace.mjs";

describe("hasTracedAsset", () => {
  it("finds the asset when a traced path ends with it", () => {
    const files = [
      "../../node_modules/.pnpm/playwright-core@1.61.0/node_modules/playwright-core/lib/coreBundle.js",
      "../../node_modules/.pnpm/playwright-core@1.61.0/node_modules/playwright-core/browsers.json",
    ];
    expect(hasTracedAsset(files, "browsers.json")).toBe(true);
  });

  it("returns false when only the JS is traced (the ICR-143 bug state)", () => {
    const files = [
      "../../node_modules/.pnpm/playwright-core@1.61.0/node_modules/playwright-core/lib/coreBundle.js",
      "../../node_modules/.pnpm/playwright-core@1.61.0/node_modules/playwright-core/package.json",
    ];
    expect(hasTracedAsset(files, "browsers.json")).toBe(false);
  });

  it("does not match a filename that merely ends with the same suffix", () => {
    expect(hasTracedAsset(["a/not-browsers.json"], "browsers.json")).toBe(
      false,
    );
  });

  it("returns false for an empty trace", () => {
    expect(hasTracedAsset([], "browsers.json")).toBe(false);
  });
});
