// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(__dirname, "../../../..");

const EXEMPT_PREFIXES = [
  path.join(WEB_ROOT, "lib", "contentful") + path.sep,
  path.join(WEB_ROOT, "lib", "content", "parity") + path.sep,
  path.join(WEB_ROOT, "lib", "content", "rich-text", "__tests__") + path.sep,
  path.join(WEB_ROOT, "src", "app", "api", "predica", "regenerate-pdf") + path.sep,
  path.join(WEB_ROOT, "src", "service", "predica") + path.sep,
  path.join(WEB_ROOT, "src", "utils", "predica") + path.sep,
];

function walkSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "__tests__") {
        continue;
      }
      results.push(...walkSourceFiles(full));
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      !entry.endsWith(".spec.ts") &&
      !entry.endsWith(".spec.tsx")
    ) {
      results.push(full);
    }
  }
  return results;
}

describe("ICR-205 cutover guard — rich-text renderer", () => {
  it("proves zero live pages, layouts, components, or metadata modules import @contentful/* or @lib/contentful/*", () => {
    const filesToScan = [
      ...walkSourceFiles(path.join(WEB_ROOT, "src")),
      path.join(WEB_ROOT, "lib", "metadata.ts"),
      path.join(WEB_ROOT, "lib", "sermonMetadata.ts"),
    ].filter(
      (file) => !EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );

    expect(filesToScan.length).toBeGreaterThan(20);

    const forbiddenPatterns = [
      /(?:from|import)\s+["']@contentful\/[^"']+["']/,
      /import\s*\(\s*["']@contentful\/[^"']+["']\s*\)/,
      /(?:from|import)\s+["']@lib\/contentful(?:\/[^"']*)?["']/,
      /(?:from|import)\s+["']\.\/contentful(?:\/[^"']*)?["']/,
    ];

    const offenders: string[] = [];
    for (const file of filesToScan) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(content)) {
          offenders.push(path.relative(WEB_ROOT, file));
          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });

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
