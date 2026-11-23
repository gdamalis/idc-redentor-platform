"use client";

import {
  preparePublishAction,
  saveDraftAction,
} from "@src/app/[locale]/(app)/content/actions";
import type { EntryEditorActionHandlers } from "@src/components/content/entry-editor-types";

function normalizePatchKeys<TFields extends object>(
  baseline: TFields,
  patch: Partial<TFields>,
  normalizeFn: (merged: TFields) => TFields,
): Partial<TFields> {
  const keys = Object.keys(patch) as (keyof TFields)[];
  if (keys.length === 0) return patch;

  const merged = { ...baseline, ...patch } as TFields;
  const normalized = normalizeFn(merged);
  const nextPatch: Partial<TFields> = {};
  for (const key of keys) {
    // Preserve explicit `undefined` on keys that were cleared so `ICR-195` `$unset`s them.
    nextPatch[key] = normalized[key];
  }
  return nextPatch;
}

/**
 * Wraps `saveDraft` and `preparePublish` via `EntryEditor.actionOverrides` so
 * every site editor normalizes changed keys through `@src/lib/content/site/normalize.ts`
 * before Server Action submission (omitting blank `en-US` string-list items,
 * `$unset`ting cleared optional localized fields, trimming URLs, stripping leading
 * `?` on `urlParameters`, and applying `lockContactFormFields` defense-in-depth).
 */
export function createNormalizedSiteActions<TFields extends object>(
  baseline: TFields,
  normalizeFn: (merged: TFields) => TFields,
): Partial<EntryEditorActionHandlers<TFields>> {
  return {
    saveDraft: (input) =>
      saveDraftAction<TFields>({
        ...input,
        patch: normalizePatchKeys(baseline, input.patch, normalizeFn),
      }),
    preparePublish: (input) =>
      preparePublishAction<TFields>({
        ...input,
        ...(input.draftPatch !== undefined
          ? {
              draftPatch: normalizePatchKeys(
                baseline,
                input.draftPatch,
                normalizeFn,
              ),
            }
          : {}),
      }),
  };
}
