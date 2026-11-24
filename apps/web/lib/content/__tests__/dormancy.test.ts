// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(__dirname, "../../..");

const FORBIDDEN_CONTENTFUL_PATTERNS = [
  /from\s+["']@lib\/contentful(?:\/|["'])/,
  /from\s+["'](?:\.\.?\/)+lib\/contentful(?:\/|["'])/,
  /from\s+["']\.\/contentful(?:\/|["'])/,
  /import\s*\(\s*["']@lib\/contentful(?:\/|["'])/,
  /require\s*\(\s*["']@lib\/contentful(?:\/|["'])/,
  /from\s+["']@contentful\//,
  /import\s*\(\s*["']@contentful\//,
  /require\s*\(\s*["']@contentful\//,
  /contentful-preview/,
  /\bContentfulPreviewProvider\b/,
];

// Legacy web predica PDF worker & webhook stay dormant until ICR-207 deletes them.
const EXEMPT_PREFIXES = [
  path.join(WEB_ROOT, "src/app/api/predica/regenerate-pdf") + path.sep,
  path.join(WEB_ROOT, "src/service/predica") + path.sep,
  path.join(WEB_ROOT, "src/utils/predica") + path.sep,
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

describe("ICR-205 cutover guard — content read layer", () => {
  it("proves zero live apps/web/src/**, metadata.ts, or sermonMetadata.ts modules import @lib/contentful or @contentful/*", () => {
    const liveSrcFiles = collectSourceFiles(path.join(WEB_ROOT, "src")).filter(
      (file) => !EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );

    const targets = [
      ...liveSrcFiles,
      path.join(WEB_ROOT, "lib/metadata.ts"),
      path.join(WEB_ROOT, "lib/sermonMetadata.ts"),
    ];

    const violations: string[] = [];
    for (const file of targets) {
      const content = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_CONTENTFUL_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(
            `${path.relative(WEB_ROOT, file)} matched ${pattern}`,
          );
        }
      }
    }

    expect(targets.length).toBeGreaterThan(20);
    expect(violations).toEqual([]);
  });

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
