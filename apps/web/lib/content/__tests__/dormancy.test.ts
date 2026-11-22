// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(__dirname, "../../..");

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+["']@lib\/content(?:\/|["'])/,
  /from\s+["'](?:\.\.?\/)+lib\/content(?:\/|["'])/,
  /from\s+["']\.\/content(?:\/|["'])/,
  /import\s*\(\s*["']@lib\/content(?:\/|["'])/,
  /require\s*\(\s*["']@lib\/content(?:\/|["'])/,
  /preview-banner/,
  /\bPreviewBanner\b/,
];

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (
      /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry) &&
      !/\.(test|spec)\./.test(entry)
    ) {
      out.push(full);
    }
  }
  return out;
}

describe("ICR-201 dormancy check (AC8)", () => {
  it("proves zero page, layout, metadata, sitemap, proxy, or existing API modules import lib/content or mount PreviewBanner", () => {
    const previewApiDir = path.join(WEB_ROOT, "src/app/api/preview");
    const appFiles = collectSourceFiles(path.join(WEB_ROOT, "src/app")).filter(
      (file) => !file.startsWith(previewApiDir),
    );

    const targets = [
      ...appFiles,
      path.join(WEB_ROOT, "lib/metadata.ts"),
      path.join(WEB_ROOT, "lib/sermonMetadata.ts"),
      path.join(WEB_ROOT, "src/proxy.ts"),
      path.join(WEB_ROOT, "src/service/post-notification.service.ts"),
    ];

    const violations: string[] = [];
    for (const file of targets) {
      const content = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(
            `${path.relative(WEB_ROOT, file)} matched ${pattern}`,
          );
        }
      }
    }

    expect(targets.length).toBeGreaterThan(15);
    expect(violations).toEqual([]);
  });
});
