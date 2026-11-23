import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import type { AuthorFields, BibleVerseFields, SermonFields } from "@idcr/content";
import { PREDICA_INGEST_CALLER, PREDICA_INGEST_SERVICE_ID } from "@src/lib/predica/auth";
import type { PredicaIngestRequest } from "@src/lib/predica/schemas";
import {
  ingestSermonDraft,
  lookupSermonsForGate0,
  resolveOrCreateAuthor,
  resolveOrCreateBibleVerse,
  type PredicaIngestDeps,
} from "./ingest.service";

const SERMON_ID = "65f1a2b3c4d5e6f7a8b9c001";
const PREACHER_ID = "65f1a2b3c4d5e6f7a8b9c010";
const INTERPRETER_ID = "65f1a2b3c4d5e6f7a8b9c011";
const VERSE_ID_1 = "65f1a2b3c4d5e6f7a8b9c020";
const VERSE_ID_2 = "65f1a2b3c4d5e6f7a8b9c021";
const AUDIO_ID = "65f1a2b3c4d5e6f7a8b9c030";
const IMG_ID = "65f1a2b3c4d5e6f7a8b9c031";
const PDF_ES_ID = "65f1a2b3c4d5e6f7a8b9c032";
const PDF_EN_ID = "65f1a2b3c4d5e6f7a8b9c033";
const OLD_IMG_ID = "65f1a2b3c4d5e6f7a8b9c039";

function makeBaseRequest(
  overrides: Partial<PredicaIngestRequest> = {},
): PredicaIngestRequest {
  return {
    mode: "create",
    sermon: {
      slug: "amor-que-derriba-muros",
      sermonDate: "2026-11-22",
      durationSeconds: 1800,
      title: { "es-AR": "Amor que derriba muros", "en-US": "Love that breaks walls" },
      thesis: { "es-AR": "Tesis", "en-US": "Thesis" },
      mainPoints: { "es-AR": ["Punto 1"], "en-US": ["Point 1"] },
      excerpt: { "es-AR": "Extracto", "en-US": "Excerpt" },
      content: {
        "es-AR": {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Cuerpo en español." }] },
          ],
        },
        "en-US": {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Body in English." }] },
          ],
        },
      },
      seoTitle: { "es-AR": "Amor", "en-US": "Love" },
      seoDescription: { "es-AR": "Desc", "en-US": "Desc" },
      keywords: { "es-AR": ["amor"], "en-US": ["love"] },
    },
    preacher: { name: "Jonathan Hanegan" },
    scriptureReferences: [
      {
        book: { "es-AR": "Efesios", "en-US": "Ephesians" },
        chapter: 2,
        fromVerse: 14,
        text: { "es-AR": "Porque él es nuestra paz.", "en-US": "For he himself is our peace." },
        version: { "es-AR": "NVI", "en-US": "NIV" },
      },
    ],
    media: {
      audioMediaId: AUDIO_ID,
      featuredImageId: IMG_ID,
      pdfSummaryMediaId: { "es-AR": PDF_ES_ID, "en-US": PDF_EN_ID },
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<PredicaIngestDeps> = {}): PredicaIngestDeps {
  const now = new Date("2026-11-23T05:00:00.000Z");
  return {
    getContentDb: vi.fn() as unknown as PredicaIngestDeps["getContentDb"],
    sermonService: {
      getById: vi.fn(),
      create: vi.fn().mockImplementation(async (_caller, draft: SermonFields) => ({
        ok: true as const,
        status: "draft" as const,
        doc: {
          _id: SERMON_ID,
          draft,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          updatedBy: PREDICA_INGEST_SERVICE_ID,
        },
      })),
      saveDraft: vi.fn().mockImplementation(async (_caller, input) => ({
        ok: true as const,
        status: "draft" as const,
        changedFields: ["title"],
        noOp: false,
        doc: {
          _id: input.docId,
          draft: input.patch as SermonFields,
          revision: input.expectedRevision + 1,
          createdAt: now,
          updatedAt: now,
          updatedBy: PREDICA_INGEST_SERVICE_ID,
        },
      })),
    },
    authorService: {
      list: vi.fn().mockResolvedValue({
        ok: true,
        total: 1,
        items: [
          {
            status: "published",
            doc: {
              _id: PREACHER_ID,
              draft: { name: "Jonathan Hanegan" } as AuthorFields,
              published: { name: "Jonathan Hanegan" } as AuthorFields,
              revision: 1,
              createdAt: now,
              updatedAt: now,
              updatedBy: "admin-1",
            },
          },
        ],
      }),
      create: vi.fn().mockResolvedValue({
        ok: true,
        status: "draft",
        doc: {
          _id: INTERPRETER_ID,
          draft: { name: "Doug Wagner" } as AuthorFields,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          updatedBy: PREDICA_INGEST_SERVICE_ID,
        },
      }),
    },
    bibleVerseService: {
      getByNaturalKey: vi.fn().mockResolvedValue({ ok: false, reason: "not-found" }),
      create: vi.fn().mockResolvedValue({
        ok: true,
        status: "draft",
        doc: {
          _id: VERSE_ID_1,
          draft: {} as BibleVerseFields,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          updatedBy: PREDICA_INGEST_SERVICE_ID,
        },
      }),
    },
    getMediaById: vi.fn().mockResolvedValue({ ok: false, reason: "not-found" }),
    computeSermonHashForSnapshot: vi.fn().mockResolvedValue({
      contentHash: "a".repeat(64),
      resolved: { authorsById: new Map(), versesById: new Map() },
    }),
    checkSermonSlugConflict: vi.fn().mockResolvedValue(null),
    markSermonPdfDirty: vi.fn().mockResolvedValue(true),
    syncContentPdfJobOnDiscard: vi.fn().mockResolvedValue(undefined),
    isContentTrialMode: vi.fn().mockReturnValue(true),
    ...overrides,
  };
}

describe("ingestSermonDraft", () => {
  it("creates a draft-only sermon marked needsReview with contentHash and zero redundant PDF job when both PDFs are uploaded", async () => {
    const deps = makeDeps();
    const res = await ingestSermonDraft(
      PREDICA_INGEST_CALLER,
      makeBaseRequest(),
      { adminOrigin: "https://staging.ministerio.idcredentor.org" },
      deps,
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mode).toBe("create");
    expect(res.published).toBe(false);
    expect(res.needsReview).toBe(true);
    expect(res.revision).toBe(1);
    expect(res.preacherId).toBe(PREACHER_ID);
    expect(res.scriptureRefIds).toEqual([VERSE_ID_1]);
    expect(res.bibleVerses).toEqual({ created: 1, reused: 0 });
    expect(res.pdfJobQueued).toBe(false);
    expect(res.editUrl).toBe(
      `https://staging.ministerio.idcredentor.org/es-AR/content/sermons/${SERMON_ID}`,
    );
    expect(deps.markSermonPdfDirty).not.toHaveBeenCalled();
  });

  it("queues content_pdf_jobs when PDFs are omitted or queuePdfRebuild is true", async () => {
    const deps = makeDeps();
    const res = await ingestSermonDraft(
      PREDICA_INGEST_CALLER,
      makeBaseRequest({
        media: { audioMediaId: AUDIO_ID, featuredImageId: IMG_ID },
      }),
      { adminOrigin: "https://staging.ministerio.idcredentor.org" },
      deps,
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pdfJobQueued).toBe(true);
    expect(deps.markSermonPdfDirty).toHaveBeenCalledWith(SERMON_ID, "a".repeat(64));
  });

  it("refuses to overwrite a human-edited draft with 409 conflict unless overwrite:true is passed (Edge Case #1)", async () => {
    const now = new Date("2026-11-23T04:00:00.000Z");
    const deps = makeDeps({
      sermonService: {
        ...makeDeps().sermonService,
        getById: vi.fn().mockResolvedValue({
          ok: true,
          status: "draft",
          updatedByLabel: "Pastor Gabriel",
          doc: {
            _id: SERMON_ID,
            draft: {
              slug: "amor-que-derriba-muros",
              title: { "es-AR": "Edited by human" },
              featuredImageId: OLD_IMG_ID,
              relatedSermonIds: ["65f1a2b3c4d5e6f7a8b9c099"],
            },
            revision: 2,
            createdAt: now,
            updatedAt: now,
            updatedBy: "human-user-id-123",
          },
        }),
      },
    });

    // Without overwrite -> 409 conflict even if expectedRevision matches
    const blocked = await ingestSermonDraft(
      PREDICA_INGEST_CALLER,
      makeBaseRequest({
        mode: "update",
        docId: SERMON_ID,
        expectedRevision: 2,
      }),
      { adminOrigin: "https://staging.ministerio.idcredentor.org" },
      deps,
    );
    expect(blocked).toEqual({
      ok: false,
      status: 409,
      reason: "conflict",
      humanEdited: true,
      updatedBy: "human-user-id-123",
      updatedByLabel: "Pastor Gabriel",
      updatedAt: now.toISOString(),
      currentRevision: 2,
    });

    // With explicit overwrite:true & keepExistingFeaturedImage:true -> succeeds and preserves featured + related
    const allowed = await ingestSermonDraft(
      PREDICA_INGEST_CALLER,
      makeBaseRequest({
        mode: "update",
        docId: SERMON_ID,
        expectedRevision: 2,
        overwrite: true,
        keepExistingFeaturedImage: true,
      }),
      { adminOrigin: "https://staging.ministerio.idcredentor.org" },
      deps,
    );
    expect(allowed.ok).toBe(true);
    expect(deps.sermonService.saveDraft).toHaveBeenCalledWith(
      PREDICA_INGEST_CALLER,
      expect.objectContaining({
        docId: SERMON_ID,
        expectedRevision: 2,
        overwrite: true,
        patch: expect.objectContaining({
          featuredImageId: OLD_IMG_ID,
          relatedSermonIds: ["65f1a2b3c4d5e6f7a8b9c099"],
        }),
      }),
    );
    expect(deps.syncContentPdfJobOnDiscard).toHaveBeenCalledWith(
      SERMON_ID,
      "a".repeat(64),
      true,
    );
  });

  it("links interpreter to interpreterId only (never additionalPreacherIds) and defaults audioLanguages to bilingual", async () => {
    const deps = makeDeps();
    const res = await ingestSermonDraft(
      PREDICA_INGEST_CALLER,
      makeBaseRequest({
        interpreter: { name: "Doug Wagner" },
      }),
      { adminOrigin: "https://staging.ministerio.idcredentor.org" },
      deps,
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.interpreterId).toBe(INTERPRETER_ID);
    expect(res.additionalPreacherIds).toEqual([]);
    expect(deps.sermonService.create).toHaveBeenCalledWith(
      PREDICA_INGEST_CALLER,
      expect.objectContaining({
        interpreterId: INTERPRETER_ID,
        audioLanguages: ["es-AR", "en-US"],
      }),
    );
  });

  it("reuses existing Bible verses by natural key and handles concurrent duplicate-key race", async () => {
    const now = new Date();
    const getByNaturalKey = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: "not-found" })
      .mockResolvedValueOnce({
        ok: true,
        status: "draft",
        doc: {
          _id: VERSE_ID_2,
          draft: {} as BibleVerseFields,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          updatedBy: PREDICA_INGEST_SERVICE_ID,
        },
      });
    const deps = makeDeps({
      bibleVerseService: {
        getByNaturalKey,
        create: vi.fn().mockResolvedValue({
          ok: false,
          reason: "duplicate-key",
          field: "reference",
          fieldErrors: { reference: ["duplicate-key"] },
        }),
      },
    });

    const res = await resolveOrCreateBibleVerse(
      PREDICA_INGEST_CALLER,
      {
        book: { "es-AR": "Joel", "en-US": "Joel" },
        chapter: 2,
        fromVerse: 13,
        version: { "es-AR": "NVI", "en-US": "NIV" },
      },
      deps,
    );
    expect(res).toEqual({ ok: true, id: VERSE_ID_2, reused: true });
    expect(getByNaturalKey).toHaveBeenCalledWith(
      PREDICA_INGEST_CALLER,
      "joel|2|13|13|nvi",
    );
  });

  it("reuses existing author case-insensitively and prefers published author", async () => {
    const deps = makeDeps();
    const res = await resolveOrCreateAuthor(
      PREDICA_INGEST_CALLER,
      { name: "  jonathan   hanegan " },
      deps,
    );
    expect(res).toEqual({ ok: true, id: PREACHER_ID, reused: true });
    expect(deps.authorService.create).not.toHaveBeenCalled();
  });
});

describe("lookupSermonsForGate0", () => {
  it("reports exactMatch, isHumanEdited, slugDateConflict, sameDateMatches, and human-replaced featuredImage", async () => {
    const exactObjId = new ObjectId(SERMON_ID);
    const otherObjId = new ObjectId("65f1a2b3c4d5e6f7a8b9c002");
    const updatedAt = new Date("2026-11-22T18:00:00.000Z");

    const fakeCol = {
      find: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          toArray: vi.fn().mockResolvedValue([
            {
              _id: exactObjId,
              draft: {
                slug: "amor-que-derriba-muros",
                sermonDate: "2026-11-15",
                title: { "es-AR": "Amor" },
                featuredImageId: OLD_IMG_ID,
              },
              revision: 3,
              createdAt: updatedAt,
              updatedAt,
              updatedBy: "human-user-1",
              updatedByLabel: "Ana",
            },
            {
              _id: otherObjId,
              draft: {
                slug: "amor-que-derriba-muros-2",
                sermonDate: "2026-11-22",
                title: { "es-AR": "Duplicado" },
              },
              revision: 1,
              createdAt: updatedAt,
              updatedAt,
              updatedBy: PREDICA_INGEST_SERVICE_ID,
            },
          ]),
        }),
      }),
    };

    const deps = makeDeps({
      getContentDb: vi.fn().mockReturnValue({
        collection: vi.fn().mockReturnValue(fakeCol),
      }) as unknown as PredicaIngestDeps["getContentDb"],
      getMediaById: vi.fn().mockResolvedValue({
        ok: true,
        doc: {
          _id: OLD_IMG_ID,
          filename: "sunday-photo.jpg",
          createdBy: "human-user-1",
        },
      }),
    });

    const res = await lookupSermonsForGate0(
      PREDICA_INGEST_CALLER,
      {
        slug: "amor-que-derriba-muros",
        sermonDate: "2026-11-22",
        environment: "staging",
        adminOrigin: "https://staging.ministerio.idcredentor.org",
      },
      deps,
    );

    expect(res.ok).toBe(true);
    expect(res.slugDateConflict).toBe(true);
    expect(res.exactMatch).toMatchObject({
      id: SERMON_ID,
      revision: 3,
      isHumanEdited: true,
      updatedByLabel: "Ana",
      featuredImage: {
        mediaId: OLD_IMG_ID,
        filename: "sunday-photo.jpg",
        isHumanReplaced: true,
      },
    });
    expect(res.sameDateMatches).toHaveLength(1);
    expect(res.sameDateMatches[0]?.slug).toBe("amor-que-derriba-muros-2");
  });
});
