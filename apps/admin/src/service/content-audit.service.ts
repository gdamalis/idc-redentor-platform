import { z } from "zod";
import type { ClientSession, ObjectId } from "mongodb";
import { COLLECTIONS, type CollectionName } from "@idcr/content";
import { getContentDb } from "@src/service/database.service";

export const CONTENT_AUDIT_COLLECTION = "content_audit";

export const CONTENT_AUDIT_ACTIONS = [
  "content.create",
  "content.save",
  "content.publish",
  "content.publish-protected",
  "content.cascade-publish",
  "content.unpublish",
  "content.discard",
  "content.delete",
  "content.pdf-update",
  "media.create",
  "media.update",
  "media.delete",
] as const;

export type ContentAuditAction = (typeof CONTENT_AUDIT_ACTIONS)[number];

export interface ContentAuditMeta {
  readonly overwrite?: boolean;
  readonly notifyRequested?: boolean;
  readonly notifySent?: boolean;
  readonly cascadedFrom?: {
    readonly collection: CollectionName;
    readonly docId: string;
  };
  /** Optional field reserved for protected-publish confirmation tick. */
  readonly approvedConfirmed?: boolean;
}

/**
 * Compact content audit record stored in `website*.content_audit`.
 *
 * Deliberately stores ONLY metadata and changed field names — NEVER full
 * before/after document snapshots — to stay well within Atlas M0's 0.5 GB
 * storage limit (ICR-195, epic brief D9).
 */
export interface ContentAuditEntry {
  _id: ObjectId;
  at: Date;
  actorId: string;
  actorLabel: string;
  actorKind: "user" | "service";
  action: ContentAuditAction;
  collection: CollectionName;
  docId: string;
  naturalKey?: string;
  changedFields: string[];
  revision: number;
  meta?: ContentAuditMeta;
}

const COLLECTION_NAME_VALUES = Object.values(COLLECTIONS) as [
  CollectionName,
  ...CollectionName[],
];

const objectIdSchema = z.custom<ObjectId>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toHexString?: unknown }).toHexString === "function",
  { message: "Expected an ObjectId" },
);

const contentAuditMetaSchema = z.strictObject({
  overwrite: z.boolean().optional(),
  notifyRequested: z.boolean().optional(),
  notifySent: z.boolean().optional(),
  cascadedFrom: z
    .strictObject({
      collection: z.enum(COLLECTION_NAME_VALUES),
      docId: z.string().min(1),
    })
    .optional(),
  approvedConfirmed: z.boolean().optional(),
});

export const contentAuditEntrySchema = z.strictObject({
  _id: objectIdSchema,
  at: z.date(),
  actorId: z.string().min(1),
  actorLabel: z.string().min(1),
  actorKind: z.enum(["user", "service"]),
  action: z.enum(CONTENT_AUDIT_ACTIONS),
  collection: z.enum(COLLECTION_NAME_VALUES),
  docId: z.string().min(1),
  naturalKey: z.string().optional(),
  changedFields: z.array(z.string()),
  revision: z.number().int().min(0),
  meta: contentAuditMetaSchema.optional(),
}) satisfies z.ZodType<ContentAuditEntry>;

let indexesPromise: Promise<void> | null = null;

export function ensureContentAuditIndexes(): Promise<void> {
  indexesPromise ??= (async () => {
    const audit = getContentDb().collection(CONTENT_AUDIT_COLLECTION);

    await Promise.all([
      audit.createIndex({ at: -1 }),
      audit.createIndex({ collection: 1, docId: 1, at: -1 }),
      audit.createIndex({ actorId: 1, at: -1 }),
    ]);
  })();

  return indexesPromise;
}

function stripUndefinedMeta(
  meta: ContentAuditMeta | undefined,
): ContentAuditMeta | undefined {
  if (!meta) return undefined;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) cleaned[key] = value;
  }
  return Object.keys(cleaned).length > 0
    ? (cleaned as ContentAuditMeta)
    : undefined;
}

/**
 * Append-only audit writer bound to `getContentDb()` (`website*` DB).
 *
 * NEVER reuse `appendAuditEntry` from `rbac-audit.service.ts` — that function
 * is bound to `getAdminDb()`, and passing a website-client `ClientSession` to
 * the admin client throws `MongoInvalidArgumentError`.
 *
 * `session` is REQUIRED so every audit row commits atomically with its content
 * mutation. `at` is stamped server-side, never taken from caller input.
 */
export async function appendContentAuditEntry(
  entry: Omit<ContentAuditEntry, "_id" | "at">,
  session: ClientSession,
): Promise<void> {
  await ensureContentAuditIndexes();
  const cleanedMeta = stripUndefinedMeta(entry.meta);
  const doc: Omit<ContentAuditEntry, "_id"> = {
    at: new Date(),
    actorId: entry.actorId,
    actorLabel: entry.actorLabel,
    actorKind: entry.actorKind,
    action: entry.action,
    collection: entry.collection,
    docId: entry.docId,
    ...(entry.naturalKey !== undefined && { naturalKey: entry.naturalKey }),
    changedFields: [...entry.changedFields],
    revision: entry.revision,
    ...(cleanedMeta !== undefined && { meta: cleanedMeta }),
  };

  await getContentDb()
    .collection(CONTENT_AUDIT_COLLECTION)
    .insertOne(doc, { session });
}
