import { z } from "zod";
import {
  RICH_TEXT_PROFILE_NAMES,
  type RichTextDoc,
  type RichTextProfile,
} from "./spec";
import { validateRichText } from "./validate";

/** Zod schema for a TipTap document restricted to one profile. */
export function richTextSchema(profile: RichTextProfile) {
  return z.custom<RichTextDoc>().superRefine((value, ctx) => {
    for (const issue of validateRichText(value, profile)) {
      ctx.addIssue({
        code: "custom",
        message: issue.message,
        path: issue.path,
      });
    }
  });
}

/** One schema instance per profile. */
export const RICH_TEXT_SCHEMAS = Object.fromEntries(
  RICH_TEXT_PROFILE_NAMES.map((profile) => [profile, richTextSchema(profile)]),
) as Record<RichTextProfile, ReturnType<typeof richTextSchema>>;
