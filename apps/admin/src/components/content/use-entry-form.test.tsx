import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEntryForm } from "./use-entry-form";

interface SampleDraft {
  title: { "es-AR": string; "en-US"?: string };
  slug: string;
  pdfSummaryMediaId?: { "es-AR": string };
}

describe("useEntryForm", () => {
  const storageKey = "idcr-admin:draft:posts:test-1";

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("tracks dirty state via canonicalEqual, omits unchanged fields & excludeFromPatch, and strips empty en-US", () => {
    const initial: SampleDraft = {
      title: { "es-AR": "Original" },
      slug: "original",
      pdfSummaryMediaId: { "es-AR": "media-1" },
    };

    const { result } = renderHook(() =>
      useEntryForm<SampleDraft>({
        initialValues: initial,
        loadedRevision: 3,
        storageKey,
        excludeFromPatch: ["pdfSummaryMediaId"],
      }),
    );

    expect(result.current.isDirty).toBe(false);
    expect(result.current.buildPatch()).toEqual({});

    act(() => {
      result.current.setField("title", { "es-AR": "Editado", "en-US": "   " });
      result.current.setField("pdfSummaryMediaId", { "es-AR": "media-stale" });
    });

    expect(result.current.isDirty).toBe(true);
    // Only `title` changed (with empty en-US stripped); `slug` untouched and `pdfSummaryMediaId` excluded!
    expect(result.current.buildPatch()).toEqual({
      title: { "es-AR": "Editado" },
    });
  });

  it("flushes local recovery synchronously and restores on reopen", () => {
    const initial: SampleDraft = {
      title: { "es-AR": "Guardado" },
      slug: "guardado",
    };

    const first = renderHook(() =>
      useEntryForm<SampleDraft>({
        initialValues: initial,
        loadedRevision: 1,
        storageKey,
      }),
    );

    act(() => {
      first.result.current.setField("title", { "es-AR": "Sin guardar" });
    });
    act(() => {
      first.result.current.flushRecovery();
    });

    // Simulate reload after forced re-login
    const second = renderHook(() =>
      useEntryForm<SampleDraft>({
        initialValues: initial,
        loadedRevision: 1,
        storageKey,
      }),
    );

    expect(second.result.current.pendingRecovery?.values.title["es-AR"]).toBe(
      "Sin guardar",
    );

    act(() => {
      second.result.current.restoreRecovery();
    });

    expect(second.result.current.values.title["es-AR"]).toBe("Sin guardar");
    expect(second.result.current.isDirty).toBe(true);
  });

  it("works cleanly when localStorage throws (private browsing)", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    const { result } = renderHook(() =>
      useEntryForm<SampleDraft>({
        initialValues: { title: { "es-AR": "A" }, slug: "a" },
        loadedRevision: 1,
        storageKey,
      }),
    );

    act(() => {
      result.current.setField("title", { "es-AR": "B" });
      result.current.flushRecovery();
    });
    expect(result.current.values.title["es-AR"]).toBe("B");
    spy.mockRestore();
  });

  it("preserves edits typed while a save is in flight instead of wiping them on commitSaved", () => {
    const initial: SampleDraft = {
      title: { "es-AR": "Original" },
      slug: "original",
    };

    const { result } = renderHook(() =>
      useEntryForm<SampleDraft>({
        initialValues: initial,
        loadedRevision: 1,
        storageKey,
      }),
    );

    act(() => {
      result.current.setField("title", { "es-AR": "Guardando v2" });
    });
    const submittedSnapshot = result.current.values;

    // User keeps typing a different field while save is in flight
    act(() => {
      result.current.setField("slug", "en-vuelo");
    });

    act(() => {
      result.current.commitSaved(
        { title: { "es-AR": "Guardando v2" }, slug: "original" },
        2,
        submittedSnapshot,
      );
    });

    expect(result.current.revision).toBe(2);
    expect(result.current.values.title["es-AR"]).toBe("Guardando v2");
    expect(result.current.values.slug).toBe("en-vuelo");
    expect(result.current.isDirty).toBe(true);
    expect(result.current.buildPatch()).toEqual({ slug: "en-vuelo" });
  });

  it("retains the recovered draft's concurrency revision and baseline when restoring stale recovery", () => {
    const rev1Baseline: SampleDraft = {
      title: { "es-AR": "Rev 1" },
      slug: "rev-1",
    };

    const first = renderHook(() =>
      useEntryForm<SampleDraft>({
        initialValues: rev1Baseline,
        loadedRevision: 1,
        storageKey,
      }),
    );

    act(() => {
      first.result.current.setField("title", { "es-AR": "Borrador local sobre rev 1" });
    });
    act(() => {
      first.result.current.flushRecovery();
    });

    // Another editor saved rev 2 before we reopened the page
    const rev2Loaded: SampleDraft = {
      title: { "es-AR": "Rev 1" },
      slug: "editado-por-otro",
    };
    const second = renderHook(() =>
      useEntryForm<SampleDraft>({
        initialValues: rev2Loaded,
        loadedRevision: 2,
        storageKey,
      }),
    );

    act(() => {
      second.result.current.restoreRecovery();
    });

    // Concurrency revision MUST stay at 1 so saving triggers 409 conflict instead of silently overwriting rev 2
    expect(second.result.current.revision).toBe(1);
    expect(second.result.current.values.title["es-AR"]).toBe(
      "Borrador local sobre rev 1",
    );
    expect(second.result.current.buildPatch()).toEqual({
      title: { "es-AR": "Borrador local sobre rev 1" },
    });
  });
});
