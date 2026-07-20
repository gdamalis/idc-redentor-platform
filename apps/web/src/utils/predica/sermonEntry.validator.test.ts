/**
 * Validator tests for the interpreted-sermon provenance fields (ICR-147).
 *
 * validateSermonForEntry() lives ONLY in the .mjs entry builder (there is no Zod and no TS
 * twin of it), so these drive the real script the way the orchestrator does — by spawning it.
 *
 * NOTE: the committed .claude/scripts/predica/__fixtures__/sample-sermon.json is a PDF
 * fixture and does NOT satisfy this validator (verified: exit 2, 9 errors, before any change
 * in this ticket). We therefore build a minimal VALID document inline instead of leaning on it.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../..");
const BUILDER = path.join(
  REPO_ROOT,
  ".claude/scripts/predica/build-sermon-entry.mjs",
);

/** A minimal document that satisfies validateSermonForEntry today. */
function makeSermon(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const locale = () => ({
    title: "Título",
    thesis: "Tesis",
    mainPoints: ["Punto uno"],
    excerpt: "Resumen breve",
    seoTitle: "SEO",
    seoDescription: "SEO description",
    keywords: ["fe"],
    content: [{ type: "paragraph", text: "Cuerpo" }],
  });
  return {
    slug: "un-sermon-de-ejemplo",
    sermonDate: "2026-07-12",
    preacher: "Doug Wagner",
    internalName: "2026-07-12 · Un sermón de ejemplo",
    locales: { "es-AR": locale(), "en-US": locale() },
    ...overrides,
  };
}

/** Run the real entry builder against a document; return its exit code + stderr. */
function validate(doc: Record<string, unknown>): {
  status: number;
  stderr: string;
} {
  const dir = mkdtempSync(path.join(tmpdir(), "icr147-"));
  const file = path.join(dir, "sermon.json");
  writeFileSync(file, JSON.stringify(doc), "utf8");
  const res = spawnSync("node", [BUILDER, file], { encoding: "utf8" });
  return { status: res.status ?? -1, stderr: res.stderr };
}

describe("validateSermonForEntry — interpreted provenance", () => {
  it("accepts a legacy document carrying NEITHER field (back-compat)", () => {
    expect(validate(makeSermon()).status).toBe(0);
  });

  it("accepts a well-formed interpreted document", () => {
    const { status } = validate(
      makeSermon({
        interpreted: true,
        interpreter: { name: "Jonathan Hanegan" },
      }),
    );
    expect(status).toBe(0);
  });

  it("accepts an explicit non-interpreted document", () => {
    expect(validate(makeSermon({ interpreted: false })).status).toBe(0);
  });

  it("REJECTS interpreted:true with no interpreter — a half-populated document must not reach Contentful", () => {
    const { status, stderr } = validate(makeSermon({ interpreted: true }));
    expect(status).toBe(2);
    expect(stderr).toMatch(/interpreter/);
  });

  it("REJECTS interpreted:true with a blank interpreter name", () => {
    const { status, stderr } = validate(
      makeSermon({ interpreted: true, interpreter: { name: "  " } }),
    );
    expect(status).toBe(2);
    expect(stderr).toMatch(/interpreter/);
  });

  it("REJECTS a non-boolean interpreted", () => {
    const { status, stderr } = validate(makeSermon({ interpreted: "yes" }));
    expect(status).toBe(2);
    expect(stderr).toMatch(/interpreted/);
  });

  it("REJECTS a named interpreter with `interpreted` absent — a forgotten flag must not silently publish without the badge/credit", () => {
    const { status, stderr } = validate(
      makeSermon({ interpreter: { name: "Jonathan Hanegan" } }),
    );
    expect(status).toBe(2);
    expect(stderr).toMatch(/interpreter/);
  });

  it("REJECTS a named interpreter with `interpreted:false` — mirrors the voice guard's fail-closed rule", () => {
    const { status, stderr } = validate(
      makeSermon({
        interpreted: false,
        interpreter: { name: "Jonathan Hanegan" },
      }),
    );
    expect(status).toBe(2);
    expect(stderr).toMatch(/interpreter/);
  });

  it("REJECTS interpreted:true with a blank interpreter email", () => {
    const { status, stderr } = validate(
      makeSermon({
        interpreted: true,
        interpreter: { name: "Jonathan Hanegan", email: "" },
      }),
    );
    expect(status).toBe(2);
    expect(stderr).toMatch(/interpreter\.email/);
  });

  it("REJECTS interpreted:true with a whitespace-only interpreter email", () => {
    const { status, stderr } = validate(
      makeSermon({
        interpreted: true,
        interpreter: { name: "Jonathan Hanegan", email: "   " },
      }),
    );
    expect(status).toBe(2);
    expect(stderr).toMatch(/interpreter\.email/);
  });

  it("accepts interpreted:true with a real interpreter email", () => {
    const { status } = validate(
      makeSermon({
        interpreted: true,
        interpreter: { name: "Jonathan Hanegan", email: "doug@example.org" },
      }),
    );
    expect(status).toBe(0);
  });

  it("accepts interpreted:true with no interpreter email (fallback path)", () => {
    const { status } = validate(
      makeSermon({
        interpreted: true,
        interpreter: { name: "Jonathan Hanegan" },
      }),
    );
    expect(status).toBe(0);
  });
});
