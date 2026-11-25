// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(__dirname, "../../..");

describe("content read layer wiring", () => {
  it("confirms LocaleLayout mounts PreviewBanner and reads from @lib/content/*", () => {
    const layout = readFileSync(
      path.join(WEB_ROOT, "src/app/[locale]/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("PreviewBanner");
    expect(layout).toContain("@lib/content/draft-mode");
    expect(layout).toContain("@lib/content/getFooter");
    expect(layout).toContain("@lib/content/getNavigationMenu");
    expect(layout).toContain("@lib/content/getSingleEmailForm");
  });
});
