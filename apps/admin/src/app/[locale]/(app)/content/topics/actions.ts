"use server";

import { revalidatePath } from "next/cache";
import type { ContentDoc, ContentStatus, TopicFields } from "@idcr/content";
import { requireActionPermission } from "@src/lib/rbac/require-action-permission";
import { callerFromAuthorized } from "@src/lib/content/caller";
import type {
  ContentCollectionName,
  ContentFailure,
} from "@src/lib/content/errors";
import type { RevalidateFailureReason } from "@src/lib/content/revalidate";
import {
  confirmPublishAction,
  discardChangesAction,
  preparePublishAction,
  type ContentActionResult,
  type PreparePublishResult,
  type SerializedContentDoc,
  type SerializedContentFailure,
} from "@src/app/[locale]/(app)/content/actions";
import {
  createGuardedTopic,
  saveGuardedTopicDraft,
  validateTopicBeforePublish,
} from "@src/service/content/editorial/editorial-guards.service";

const CONTENT_LAYOUT_ROUTE = "/[locale]/content";

function serializeDoc(
  doc: ContentDoc<TopicFields>,
  updatedByLabel?: string,
): SerializedContentDoc<TopicFields> {
  return {
    _id: doc._id,
    draft: doc.draft,
    ...(doc.published !== undefined && { published: doc.published }),
    ...(doc.publishedAt !== undefined && {
      publishedAt: doc.publishedAt.toISOString(),
    }),
    ...(doc.firstPublishedAt !== undefined && {
      firstPublishedAt: doc.firstPublishedAt.toISOString(),
    }),
    revision: doc.revision,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    updatedBy: doc.updatedBy,
    ...(updatedByLabel !== undefined && { updatedByLabel }),
  };
}

function serializeFailure(failure: ContentFailure): SerializedContentFailure {
  if (failure.reason === "conflict") {
    return {
      ok: false,
      reason: "conflict",
      updatedBy: failure.updatedBy,
      ...(failure.updatedByLabel !== undefined && {
        updatedByLabel: failure.updatedByLabel,
      }),
      updatedAt: failure.updatedAt.toISOString(),
      currentRevision: failure.currentRevision,
    };
  }
  return failure;
}

export async function createTopicAction(input: {
  readonly collection: ContentCollectionName;
  readonly draft: TopicFields;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<TopicFields>;
    readonly status: ContentStatus;
  }>
> {
  const authz = await requireActionPermission("content:write");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    };
  }

  const caller = callerFromAuthorized(authz);
  const res = await createGuardedTopic(caller, input.draft);
  if (!res.ok) return serializeFailure(res);

  revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  return {
    ok: true,
    doc: serializeDoc(res.doc, authz.user.displayName ?? authz.user.email),
    status: res.status,
  };
}

export async function saveTopicDraftAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly patch: Partial<TopicFields>;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<TopicFields>;
    readonly status: ContentStatus;
    readonly changedFields: string[];
    readonly noOp: boolean;
  }>
> {
  const authz = await requireActionPermission("content:write");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:write",
    };
  }

  const caller = callerFromAuthorized(authz);
  const res = await saveGuardedTopicDraft(caller, {
    docId: input.docId,
    patch: input.patch,
    expectedRevision: input.expectedRevision,
    overwrite: input.overwrite,
  });
  if (!res.ok) return serializeFailure(res);

  if (!res.noOp) {
    revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  }
  return {
    ok: true,
    doc: serializeDoc(res.doc, res.updatedByLabel),
    status: res.status,
    changedFields: res.changedFields,
    noOp: res.noOp,
  };
}

export async function prepareTopicPublishAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId?: string;
  readonly newDraft?: TopicFields;
  readonly draftPatch?: Partial<TopicFields>;
  readonly expectedRevision?: number;
  readonly overwrite?: boolean;
}): Promise<PreparePublishResult<TopicFields>> {
  const authz = await requireActionPermission("content:publish");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    };
  }

  const caller = callerFromAuthorized(authz);
  const guardFailure = await validateTopicBeforePublish(caller, {
    docId: input.docId,
    newDraft: input.newDraft,
    draftPatch: input.draftPatch,
  });
  if (guardFailure) return serializeFailure(guardFailure);

  return preparePublishAction<TopicFields>({
    ...input,
    collection: "topics",
  });
}

export async function confirmTopicPublishAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
  readonly notify?: boolean;
  readonly approvedConfirmed?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<TopicFields>;
    readonly status: ContentStatus;
    readonly revalidated: boolean;
    readonly revalidateReason?: RevalidateFailureReason;
    readonly notified: boolean;
  }>
> {
  const authz = await requireActionPermission("content:publish");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    };
  }

  const caller = callerFromAuthorized(authz);
  const guardFailure = await validateTopicBeforePublish(caller, {
    docId: input.docId,
  });
  if (guardFailure) return serializeFailure(guardFailure);

  return confirmPublishAction<TopicFields>({
    ...input,
    collection: "topics",
  });
}

export async function discardTopicChangesAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<TopicFields>;
    readonly status: ContentStatus;
    readonly noOp: boolean;
  }>
> {
  return discardChangesAction<TopicFields>({
    ...input,
    collection: "topics",
  });
}
