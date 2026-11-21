import { z } from "zod";
import {
  isEmptyValue,
  normalizeLocalized,
  type Localized,
} from "../model/localized";

/**
 * Normalizes blank string / empty array English inputs to `undefined` prior to inner validation
 * when English is optional. Rich-text objects are NOT pre-stripped here so that invalid TipTap
 * trees (e.g. `{ type: "doc", content: [{ type: "hardBreak" }] }`) are still rejected by
 * `RICH_TEXT_SCHEMAS` before `normalizeLocalized` drops valid empty rich-text documents.
 */
function stripEmptyOptionalEn(value: unknown): unknown {
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  return value;
}

/**
 * Localized field schema (`{ "es-AR": T, "en-US"?: T }`).
 *
 * - Default (drafts): `es-AR` may be empty if the inner schema allows it; `en-US` is optional
 *   and any empty English value (`""`, whitespace, `[]`, empty rich-text doc) is normalised to
 *   absent so the site's es-AR fallback keeps working.
 * - `requireEs: true` (standard publishable): `es-AR` must be non-empty; `en-US` is optional
 *   (and normalised to absent when empty, even if `inner` requires non-empty values like `.min(1)`
 *   or `slugSchema`).
 * - `requireEs: true, requireEn: true` (protected publishable): both locales must be non-empty.
 */
export function localizedSchema<TSchema extends z.ZodTypeAny>(
  inner: TSchema,
  options: { requireEs?: boolean; requireEn?: boolean } = {},
) {
  const { requireEs = false, requireEn = false } = options;

  const enField = requireEn
    ? inner.optional()
    : z.preprocess(stripEmptyOptionalEn, inner.optional());

  return z
    .strictObject({
      "es-AR": inner,
      "en-US": enField,
    })
    .superRefine((value, ctx) => {
      const loc = value as Localized<z.infer<TSchema>>;
      if (requireEs && isEmptyValue(loc["es-AR"])) {
        ctx.addIssue({
          code: "custom",
          path: ["es-AR"],
          message: "Spanish (es-AR) value is required",
        });
      }
      if (requireEn && isEmptyValue(loc["en-US"])) {
        ctx.addIssue({
          code: "custom",
          path: ["en-US"],
          message: "English (en-US) value is required for protected content",
        });
      }
    })
    .transform((value) =>
      normalizeLocalized(value as Localized<z.infer<TSchema>>),
    );
}
