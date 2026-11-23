import { describe, expect, it } from "vitest";
import { predicaIngestRequestSchema } from "./schemas";

const VALID_ID = "65f1a2b3c4d5e6f7a8b9c0d1";

function baseCreatePayload() {
  return {
    mode: "create" as const,
    sermon: {
      slug: "el-amor-de-dios",
      sermonDate: "2026-11-22",
      title: { "es-AR": "El amor de Dios", "en-US": "The love of God" },
      content: {
        "es-AR": {
          type: "doc" as const,
          content: [
            {
              type: "paragraph" as const,
              content: [{ type: "text" as const, text: "Mensaje de prueba." }],
            },
          ],
        },
      },
    },
    preacher: { name: "Jonathan Hanegan" },
  };
}

describe("predicaIngestRequestSchema", () => {
  it("accepts a valid create draft payload (including Spanish-only draft without en-US)", () => {
    const res = predicaIngestRequestSchema.safeParse(baseCreatePayload());
    expect(res.success).toBe(true);
  });

  it("rejects any attempt to inject published state or server-owned fields (AC5)", () => {
    const forbiddenRoot = [
      { published: {} },
      { publishedAt: "2026-11-22T00:00:00.000Z" },
      { firstPublishedAt: "2026-11-22T00:00:00.000Z" },
      { status: "published" },
      { updatedBy: "human-id" },
      { revision: 99 },
      { _id: VALID_ID },
      { _refs: {} },
    ];

    for (const extra of forbiddenRoot) {
      const res = predicaIngestRequestSchema.safeParse({
        ...baseCreatePayload(),
        ...extra,
      });
      expect(res.success).toBe(false);
    }

    // Forbidden inside sermon object too
    const withContentHash = predicaIngestRequestSchema.safeParse({
      ...baseCreatePayload(),
      sermon: {
        ...baseCreatePayload().sermon,
        contentHash: "deadbeef",
      },
    });
    expect(withContentHash.success).toBe(false);
  });

  it("rejects disallowed TipTap nodes (e.g. hardBreak or heading level 1)", () => {
    const badDoc = predicaIngestRequestSchema.safeParse({
      ...baseCreatePayload(),
      sermon: {
        ...baseCreatePayload().sermon,
        content: {
          "es-AR": {
            type: "doc",
            content: [
              {
                type: "heading",
                attrs: { level: 1 },
                content: [{ type: "text", text: "H1 not allowed" }],
              },
            ],
          },
        },
      },
    });
    expect(badDoc.success).toBe(false);
  });

  it("enforces create vs update docId/expectedRevision constraints", () => {
    expect(
      predicaIngestRequestSchema.safeParse({
        ...baseCreatePayload(),
        docId: VALID_ID,
      }).success,
    ).toBe(false);

    expect(
      predicaIngestRequestSchema.safeParse({
        ...baseCreatePayload(),
        mode: "update",
      }).success,
    ).toBe(false);

    expect(
      predicaIngestRequestSchema.safeParse({
        ...baseCreatePayload(),
        mode: "update",
        docId: VALID_ID,
        expectedRevision: 2,
      }).success,
    ).toBe(true);
  });
});
