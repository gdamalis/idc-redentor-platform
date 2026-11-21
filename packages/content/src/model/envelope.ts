/**
 * The envelope every content document is stored in (epic brief §3.1, amended 2026-11-19).
 *
 * Ids are plain strings at the package boundary: this package never depends on `mongodb`/`bson`,
 * so the services (ICR-195) convert `ObjectId` <-> string at the database edge.
 */
export interface ContentDoc<TFields> {
  _id: string;
  /** Always present: the working copy editors save. */
  draft: TFields;
  /** Snapshot copied from `draft` on Publish. Absent = never published (or unpublished). */
  published?: TFields;
  /** Last publish. A future date is reserved for scheduling (no scheduler in v1). */
  publishedAt?: Date;
  /** Set on the first publish and never cleared, so "first publish" side effects fire once. */
  firstPublishedAt?: Date;
  /** Server-owned counter, incremented on every editor write (optimistic locking, ICR-195). */
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  /** Admin user id, or a service identity for script-created drafts. */
  updatedBy: string;
  /** Importer idempotency key; dropped at decommission. */
  sourceContentfulId?: string;
}

/** The three derived statuses (F-editor-ux §2.2). Never stored. */
export const CONTENT_STATUS = {
  draft: "draft",
  changed: "changed",
  published: "published",
} as const;

export type ContentStatus =
  (typeof CONTENT_STATUS)[keyof typeof CONTENT_STATUS];
