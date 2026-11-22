import type { z } from "zod";
import type { CollectionName } from "@idcr/content";
import type { PermissionKey } from "@src/lib/rbac/permissions";

/** All 10 enveloped content collections (excludes `media`, owned by ICR-196). */
export type ContentCollectionName = Exclude<CollectionName, "media">;

export interface ContentReferenceUsage {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly label: string;
  readonly isPublished: boolean;
}

/**
 * Unified, documented failure contract across every content service entry point
 * (ICR-195; lifted from ICR-34). Services NEVER throw custom Error subclasses
 * for business-rule refusals — callers branch on `result.ok` and `result.reason`.
 */
export type ContentFailure =
  | {
      readonly ok: false;
      readonly reason: "forbidden";
      readonly requiredPermission: PermissionKey;
    }
  | {
      readonly ok: false;
      readonly reason: "not-found";
    }
  | {
      readonly ok: false;
      readonly reason: "invalid";
      readonly fieldErrors: Record<string, string[]>;
    }
  | {
      readonly ok: false;
      readonly reason: "conflict";
      readonly updatedBy: string;
      readonly updatedByLabel?: string;
      readonly updatedAt: Date;
      readonly currentRevision: number;
    }
  | {
      readonly ok: false;
      readonly reason: "duplicate-key";
      readonly field: string;
      readonly fieldErrors: Record<string, string[]>;
    }
  | {
      readonly ok: false;
      readonly reason: "operation-not-allowed";
      readonly detail: "fixed-entry" | "library-entry" | "immutable-field";
      readonly field?: string;
    }
  | {
      readonly ok: false;
      readonly reason: "in-use";
      readonly usedBy: readonly ContentReferenceUsage[];
    }
  | {
      readonly ok: false;
      readonly reason: "published-must-unpublish";
    }
  | {
      readonly ok: false;
      readonly reason: "nothing-to-discard";
    }
  | {
      readonly ok: false;
      readonly reason: "not-published";
    };

export type ContentResult<TSuccess> =
  | ({ readonly ok: true } & TSuccess)
  | ContentFailure;

/** Formats Zod 4 validation issues into a `{ [fieldPath]: string[] }` map. */
export function formatZodFieldErrors(
  error: z.ZodError,
  prefix = "",
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const rawPath = issue.path.map(String).join(".");
    const key = prefix
      ? rawPath
        ? `${prefix}.${rawPath}`
        : prefix
      : rawPath || "_root";
    const list = fieldErrors[key];
    if (list) {
      list.push(issue.message);
    } else {
      fieldErrors[key] = [issue.message];
    }
  }
  return fieldErrors;
}

interface MongoDuplicateErrorLike {
  code?: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
  message?: string;
}

const DUPLICATE_KEY_FIELD_MAP: Readonly<Record<string, string>> = {
  "draft.slug": "slug",
  "published.slug": "slug",
  "draft.slug.es-AR": "slug.es-AR",
  "published.slug.es-AR": "slug.es-AR",
  "draft.slug.en-US": "slug.en-US",
  "published.slug.en-US": "slug.en-US",
  "draft.machineName": "machineName",
  "published.machineName": "machineName",
  _naturalKey: "reference",
};

/** Maps a MongoDB E11000 duplicate-key error to a structured `duplicate-key` refusal. */
export function mapDuplicateKeyToFailure(
  error: unknown,
): Extract<ContentFailure, { reason: "duplicate-key" }> {
  const mongoErr = error as MongoDuplicateErrorLike | null;
  const patternKeys = mongoErr?.keyPattern
    ? Object.keys(mongoErr.keyPattern)
    : mongoErr?.keyValue
      ? Object.keys(mongoErr.keyValue)
      : [];

  let field = "naturalKey";
  for (const rawKey of patternKeys) {
    const mapped = DUPLICATE_KEY_FIELD_MAP[rawKey];
    if (mapped) {
      field = mapped;
      break;
    }
  }

  return {
    ok: false,
    reason: "duplicate-key",
    field,
    fieldErrors: { [field]: ["duplicate-key"] },
  };
}
