import { describe, expect, it } from "vitest";
import {
  countMissingEnglishInDraft,
  isNeedsReviewDraft,
  isServiceIdentity,
} from "./status-helpers";

describe("status-helpers", () => {
  it("detects service identities vs human user ids", () => {
    expect(isServiceIdentity("service:predica-ingest")).toBe(true);
    expect(isServiceIdentity("system:pdf-worker")).toBe(true);
    expect(isServiceIdentity("65f1234567890abcdef12345")).toBe(false);
  });

  it("derives Para revisar only for never-published service-created drafts", () => {
    expect(
      isNeedsReviewDraft({
        published: undefined,
        updatedBy: "service:predica-ingest",
      }),
    ).toBe(true);
    expect(
      isNeedsReviewDraft({
        published: undefined,
        updatedBy: "65f1234567890abcdef12345",
      }),
    ).toBe(false);
    expect(
      isNeedsReviewDraft({
        published: { title: "x" },
        updatedBy: "service:predica-ingest",
      }),
    ).toBe(false);
  });

  it("counts missing English fields recursively without descending into rich-text docs", () => {
    const draft = {
      title: { "es-AR": "Hola", "en-US": "Hello" },
      subtitle: { "es-AR": "Subtítulo" },
      excerpt: { "es-AR": "Extracto", "en-US": "   " },
      content: {
        "es-AR": {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Texto" }] }],
        },
      },
      slug: "hola",
    };

    expect(countMissingEnglishInDraft(draft)).toBe(3);
  });
});
