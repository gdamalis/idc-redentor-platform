import { z } from "zod";
import {
  isEmptyValue,
  normalizeLocalized,
  type Localized,
} from "../model/localized";

/**
 * Localized field schema (`{ "es-AR": T, "en-US"?: T }`).
 *
 * - `mode: "es-optional"` (drafts): `es-AR` may be empty if the inner schema allows it; `en-US` is
 *   optional and any empty English value is normalised to absent so the site's fallback keeps working.
 * - `mode: "es-required"` (standard publishable): `es-AR` must be non-empty; `en-US` is optional
 *   (and normalised to absent when empty).
 * - `mode: "both-required"` (protected publishable: belief collections, protected topics): both
 *   `es-AR` and `en-US` must be present and non-empty.
 */
export function localizedSchema<TSchema extends z.ZodTypeAny>(
  inner: TSchema,
  options: { requireEs?: boolean; requireEn?: boolean } = {},
) {
  const { requireEs = false, requireEn = false } = options;

  const base = z
    .strictObject({
      "es-AR": inner,
      "en-US": inner.optional(),
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

  return base;
}
