import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("PWA manifest", () => {
  it("declares the fields Chromium requires to offer installation", () => {
    const result = manifest();

    expect(result.name).toBeTruthy();
    expect(result.short_name).toBeTruthy();
    expect(result.start_url).toBe("/");
    expect(result.display).toBe("standalone");
  });

  it("ships both icon sizes Chromium requires", () => {
    const sizes = (manifest().icons ?? []).map((icon) => icon.sizes);

    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("points every icon at a real public path", () => {
    for (const icon of manifest().icons ?? []) {
      expect(icon.src.startsWith("/assets/img/")).toBe(true);
      expect(icon.type).toBe("image/png");
    }
  });

  it("uses the light-theme brand tokens for its chrome colors", () => {
    const result = manifest();

    expect(result.theme_color).toBe("#0059b3");
    expect(result.background_color).toBe("#f9fafb");
  });
});
