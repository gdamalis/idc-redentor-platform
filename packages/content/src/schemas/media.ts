import { z } from "zod";
import { isEmptyValue, type Localized } from "../model/localized";
import {
  httpUrlSchema,
  idSchema,
  longTextSchema,
  nonEmptyShortTextSchema,
  nonNegativeNumberSchema,
  positiveIntSchema,
  sha256Schema,
  shortTextSchema,
} from "./common";
import { localizedSchema } from "./localized";

/**
 * Media asset record (`media` collection). Owned by ICR-196; no draft/published envelope.
 *
 * - `pathname` is the canonical Vercel Blob key (portability key).
 * - `url` is the stored public URL (required by ICR-196 AC1 & ICR-201 because `apps/web` holds no
 *   Blob token or store origin).
 * - `sha256` is required for upload deduplication (ICR-196 AC4).
 * - Images must carry a Spanish `alt` description OR `decorative: true` (ICR-196 AC3).
 */
export interface MediaDoc {
  _id: string;
  pathname: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
  sha256: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  title: Localized<string>;
  alt?: Localized<string>;
  decorative?: boolean;
  caption?: Localized<string>;
  credit?: Localized<string>;
  createdBy: string;
  createdAt: Date;
}

export type MediaCreateInput = Omit<MediaDoc, "_id">;

const mediaShape = {
  pathname: nonEmptyShortTextSchema,
  url: httpUrlSchema,
  filename: nonEmptyShortTextSchema,
  contentType: nonEmptyShortTextSchema,
  size: z.number().int().min(0),
  sha256: sha256Schema,
  width: positiveIntSchema.optional(),
  height: positiveIntSchema.optional(),
  durationSeconds: nonNegativeNumberSchema.optional(),
  title: localizedSchema(shortTextSchema, { requireEs: true }),
  alt: localizedSchema(longTextSchema).optional(),
  decorative: z.boolean().optional(),
  caption: localizedSchema(longTextSchema).optional(),
  credit: localizedSchema(shortTextSchema).optional(),
  createdBy: idSchema,
  createdAt: z.date(),
};

export const mediaCreateSchema = z
  .strictObject(mediaShape)
  .superRefine((value, ctx) => {
    if (
      value.contentType.toLowerCase().startsWith("image/") &&
      value.decorative !== true &&
      isEmptyValue(value.alt?.["es-AR"])
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["alt", "es-AR"],
        message:
          "Images require a Spanish alt description unless marked decorative",
      });
    }
  });

/** Partial update schema for media metadata (`{}` -> `{}`). */
export const mediaUpdateSchema = z.strictObject(mediaShape).partial();
