import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(__dirname, "../../../..");

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

describe("Dormancy check (AC8)", () => {
  it("proves zero live pages, layouts, components, or routes import lib/content/rich-text or tiptapRegenContent", () => {
    const richTextDir = path.join(WEB_ROOT, "lib", "content", "rich-text");
    const tiptapRegenFile = path.join(
      WEB_ROOT,
      "src",
      "utils",
      "predica",
      "tiptapRegenContent.ts",
    );

    const filesToScan = [
      ...walkSourceFiles(path.join(WEB_ROOT, "src")),
      ...walkSourceFiles(path.join(WEB_ROOT, "lib")),
    ].filter(
      (file) =>
        !file.startsWith(richTextDir + path.sep) && file !== tiptapRegenFile,
    );

    expect(filesToScan.length).toBeGreaterThan(20);

    const forbiddenImportPatterns = [
      /from\s+["'][^"']*content\/rich-text(?:\/[^"']*)?["']/,
      /import\s*\(\s*["'][^"']*content\/rich-text(?:\/[^"']*)?["']\s*\)/,
      /from\s+["'][^"']*tiptapRegenContent["']/,
      /import\s*\(\s*["'][^"']*tiptapRegenContent["']\s*\)/,
    ];

    const offenders: string[] = [];
    for (const file of filesToScan) {
      const content = readFileSync(file, "utf8");
      for (const pattern of forbiddenImportPatterns) {
        if (pattern.test(content)) {
          offenders.push(path.relative(WEB_ROOT, file));
          break;
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
