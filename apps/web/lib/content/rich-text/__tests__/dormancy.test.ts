// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(__dirname, "../../../..");

describe("rich-text renderer wiring", () => {
  it("confirms all 9 rich-text consumers import @lib/content/rich-text", () => {
    const expectedConsumers = [
      "src/app/[locale]/[topic]/page.tsx",
      "src/components/features/blog-post-details/BlogPostContent.tsx",
      "src/components/features/sermon-details/SermonContent.tsx",
      "src/components/features/contact-form/ContactForm.tsx",
      "src/components/features/creed-section/CreedSection.tsx",
      "src/components/features/our-mission-section/OurMissionSection.tsx",
      "src/components/features/our-mission-cta/OurMissionCta.tsx",
      "src/components/features/info-community/InfoCommunity.tsx",
      "src/components/features/info-connect/InfoConnect.tsx",
    ];

    for (const rel of expectedConsumers) {
      const content = readFileSync(path.join(WEB_ROOT, rel), "utf8");
      expect(content, `${rel} should import @lib/content/rich-text`).toContain(
        "@lib/content/rich-text",
      );
    }
  });
});
