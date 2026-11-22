"use client";

import * as React from "react";
import {
  canonicalEqual,
  normalizeLocalized,
  type Localized,
} from "@idcr/content";

export interface LocalRecoveryRecord<TFields> {
  readonly revision: number;
  readonly savedAt: number;
  readonly values: TFields;
}

export interface UseEntryFormOptions<TFields> {
  readonly initialValues: TFields;
  readonly loadedRevision: number;
  readonly storageKey: string;
  /** Keys that must NEVER be submitted in `buildPatch()` (e.g. `["pdfSummaryMediaId"]` in ICR-200). */
  readonly excludeFromPatch?: readonly (keyof TFields)[];
  readonly recoveryIntervalMs?: number;
}

export interface UseEntryFormReturn<TFields> {
  readonly values: TFields;
  readonly savedBaseline: TFields;
  readonly revision: number;
  readonly isDirty: boolean;
  readonly fieldErrors: Record<string, string[]>;
  readonly pendingRecovery: LocalRecoveryRecord<TFields> | null;
  readonly lossyFields: ReadonlySet<string>;
  readonly hasDirtyLossyFields: boolean;
  readonly setField: <K extends keyof TFields>(key: K, next: TFields[K]) => void;
  readonly setValues: React.Dispatch<React.SetStateAction<TFields>>;
  readonly setFieldErrors: React.Dispatch<
    React.SetStateAction<Record<string, string[]>>
  >;
  readonly clearFieldError: (pathPrefix: string) => void;
  readonly markLossyField: (fieldPath: string, isLossy: boolean) => void;
  readonly buildPatch: () => Partial<TFields>;
  readonly buildFullDraft: () => TFields;
  readonly commitSaved: (nextValues: TFields, nextRevision: number) => void;
  readonly flushRecovery: () => void;
  readonly clearRecovery: () => void;
  readonly restoreRecovery: () => void;
  readonly dismissRecovery: () => void;
}

function isLocalizedMap(value: unknown): value is Localized<unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  return (
    keys.length > 0 &&
    keys.includes("es-AR") &&
    keys.every((k) => k === "es-AR" || k === "en-US")
  );
}

/** Strips empty `en-US` leaves recursively so fallback to `es-AR` stays intact. */
export function normalizeDraftForSubmit<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => normalizeDraftForSubmit(item)) as unknown as T;
  }
  const record = value as Record<string, unknown>;
  if (record.type === "doc") return value;
  if (isLocalizedMap(record)) {
    return normalizeLocalized(record) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = normalizeDraftForSubmit(v);
  }
  return out as T;
}

function safeReadStorage<TFields>(
  storageKey: string,
): LocalRecoveryRecord<TFields> | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalRecoveryRecord<TFields>>;
    if (
      typeof parsed?.savedAt !== "number" ||
      typeof parsed?.revision !== "number" ||
      parsed.values === undefined
    ) {
      return null;
    }
    return parsed as LocalRecoveryRecord<TFields>;
  } catch {
    return null;
  }
}

function safeWriteStorage<TFields>(
  storageKey: string,
  record: LocalRecoveryRecord<TFields>,
): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Private browsing / quota exceeded: editor works cleanly without recovery.
  }
}

function safeRemoveStorage(storageKey: string): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore
  }
}

/**
 * Shared editor form hook (`F-editor-ux-decisions.md` §2.3, §2.12, §7 #10):
 * - Plain React state (no `react-hook-form`).
 * - Dirty tracking via `@idcr/content`'s `canonicalEqual`.
 * - Sends ONLY changed keys in `buildPatch()` (unchanged rich-text bodies and
 *   slugs are never re-submitted; `excludeFromPatch` keys are never submitted).
 * - Mirrors dirty state to `localStorage` every 2 seconds AND synchronously
 *   via `flushRecovery()` before any Server Action so mid-edit session expiry
 *   redirects never lose edits.
 */
export function useEntryForm<TFields extends object>({
  initialValues,
  loadedRevision,
  storageKey,
  excludeFromPatch,
  recoveryIntervalMs = 2_000,
}: UseEntryFormOptions<TFields>): UseEntryFormReturn<TFields> {
  const [values, setValues] = React.useState<TFields>(initialValues);
  const [savedBaseline, setSavedBaseline] = React.useState<TFields>(initialValues);
  const [revision, setRevision] = React.useState<number>(loadedRevision);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const [pendingRecovery, setPendingRecovery] =
    React.useState<LocalRecoveryRecord<TFields> | null>(null);
  const [lossyFields, setLossyFields] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const valuesRef = React.useRef(values);
  const revisionRef = React.useRef(revision);
  React.useEffect(() => {
    valuesRef.current = values;
    revisionRef.current = revision;
  }, [values, revision]);

  const excludedSet = React.useMemo(
    () => new Set<string>((excludeFromPatch ?? []).map(String)),
    [excludeFromPatch],
  );

  const isDirty = React.useMemo(
    () => !canonicalEqual(values, savedBaseline),
    [values, savedBaseline],
  );

  // Check for browser-stored local recovery on mount / key change
  React.useEffect(() => {
    const stored = safeReadStorage<TFields>(storageKey);
    if (stored && !canonicalEqual(stored.values, initialValues)) {
      setPendingRecovery(stored);
    } else {
      setPendingRecovery(null);
    }
  }, [initialValues, storageKey]);

  const flushRecovery = React.useCallback(() => {
    safeWriteStorage(storageKey, {
      revision: revisionRef.current,
      savedAt: Date.now(),
      values: valuesRef.current,
    });
  }, [storageKey]);

  const clearRecovery = React.useCallback(() => {
    safeRemoveStorage(storageKey);
    setPendingRecovery(null);
  }, [storageKey]);

  // Mirror unsaved edits to localStorage every 2 seconds while dirty
  React.useEffect(() => {
    if (!isDirty) return;
    const timer = window.setInterval(() => {
      flushRecovery();
    }, recoveryIntervalMs);
    return () => window.clearInterval(timer);
  }, [flushRecovery, isDirty, recoveryIntervalMs]);

  // Browser leave prompt on tab close / reload when dirty
  React.useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      flushRecovery();
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [flushRecovery, isDirty]);

  const clearFieldError = React.useCallback((pathPrefix: string) => {
    setFieldErrors((prev) => {
      const keys = Object.keys(prev);
      const next: Record<string, string[]> = {};
      let changed = false;
      for (const k of keys) {
        if (k === pathPrefix || k.startsWith(`${pathPrefix}.`)) {
          changed = true;
        } else {
          next[k] = prev[k]!;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const setField = React.useCallback(
    <K extends keyof TFields>(key: K, next: TFields[K]) => {
      setValues((prev) => ({ ...prev, [key]: next }));
      clearFieldError(String(key));
    },
    [clearFieldError],
  );

  const markLossyField = React.useCallback(
    (fieldPath: string, isLossy: boolean) => {
      setLossyFields((prev) => {
        const has = prev.has(fieldPath);
        if (has === isLossy) return prev;
        const next = new Set(prev);
        if (isLossy) next.add(fieldPath);
        else next.delete(fieldPath);
        return next;
      });
    },
    [],
  );

  const buildPatch = React.useCallback((): Partial<TFields> => {
    const patch: Record<string, unknown> = {};
    const current = valuesRef.current as Record<string, unknown>;
    const baseline = savedBaseline as Record<string, unknown>;
    const allKeys = new Set([
      ...Object.keys(current),
      ...Object.keys(baseline),
    ]);

    for (const key of allKeys) {
      if (excludedSet.has(key)) continue;
      const nextVal = normalizeDraftForSubmit(current[key]);
      const baseVal = normalizeDraftForSubmit(baseline[key]);
      if (!canonicalEqual(nextVal, baseVal)) {
        patch[key] = nextVal;
      }
    }

    return patch as Partial<TFields>;
  }, [excludedSet, savedBaseline]);

  const buildFullDraft = React.useCallback((): TFields => {
    const cleaned = normalizeDraftForSubmit(valuesRef.current) as Record<
      string,
      unknown
    >;
    if (excludedSet.size === 0) return cleaned as TFields;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cleaned)) {
      if (!excludedSet.has(k)) out[k] = v;
    }
    return out as TFields;
  }, [excludedSet]);

  const hasDirtyLossyFields = React.useMemo(() => {
    if (lossyFields.size === 0) return false;
    const current = values as Record<string, unknown>;
    const baseline = savedBaseline as Record<string, unknown>;
    for (const fieldPath of lossyFields) {
      const topKey = fieldPath.split(".")[0];
      if (!topKey) continue;
      if (!canonicalEqual(current[topKey], baseline[topKey])) {
        return true;
      }
    }
    return false;
  }, [lossyFields, savedBaseline, values]);

  const commitSaved = React.useCallback(
    (nextValues: TFields, nextRevision: number) => {
      setValues(nextValues);
      setSavedBaseline(nextValues);
      setRevision(nextRevision);
      setFieldErrors({});
      clearRecovery();
    },
    [clearRecovery],
  );

  const restoreRecovery = React.useCallback(() => {
    if (!pendingRecovery) return;
    setValues(pendingRecovery.values);
    setPendingRecovery(null);
  }, [pendingRecovery]);

  const dismissRecovery = React.useCallback(() => {
    clearRecovery();
  }, [clearRecovery]);

  return {
    values,
    savedBaseline,
    revision,
    isDirty,
    fieldErrors,
    pendingRecovery,
    lossyFields,
    hasDirtyLossyFields,
    setField,
    setValues,
    setFieldErrors,
    clearFieldError,
    markLossyField,
    buildPatch,
    buildFullDraft,
    commitSaved,
    flushRecovery,
    clearRecovery,
    restoreRecovery,
    dismissRecovery,
  };
}
