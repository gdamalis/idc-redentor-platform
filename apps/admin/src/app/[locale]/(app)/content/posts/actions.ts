"use server";

import { revalidatePath } from "next/cache";
import type { ContentDoc, ContentStatus, PostFields } from "@idcr/content";
import { requireActionPermission } from "@src/lib/rbac/require-action-permission";
import { callerFromAuthorized } from "@src/lib/content/caller";
import type {
  ContentCollectionName,
  ContentFailure,
} from "@src/lib/content/errors";
import type { RevalidateFailureReason } from "@src/lib/content/revalidate";
import {
  confirmPublishAction,
  preparePublishAction,
  type ContentActionResult,
  type PreparePublishResult,
  type SerializedContentDoc,
  type SerializedContentFailure,
} from "@src/app/[locale]/(app)/content/actions";
import {
  createGuardedPost,
  saveGuardedPostDraft,
  validatePostBeforePublish,
} from "@src/service/content/editorial/editorial-guards.service";

const CONTENT_LAYOUT_ROUTE = "/[locale]/content";

function serializeDoc(
  doc: ContentDoc<PostFields>,
  updatedByLabel?: string,
): SerializedContentDoc<PostFields> {
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
    ...(doc.sourceContentfulId !== undefined && {
      sourceContentfulId: doc.sourceContentfulId,
    }),
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

export async function createPostAction(input: {
  readonly collection: ContentCollectionName;
  readonly draft: PostFields;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<PostFields>;
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
  const res = await createGuardedPost(caller, input.draft);
  if (!res.ok) return serializeFailure(res);

  revalidatePath(CONTENT_LAYOUT_ROUTE, "layout");
  return {
    ok: true,
    doc: serializeDoc(res.doc, authz.user.displayName ?? authz.user.email),
    status: res.status,
  };
}

export async function savePostDraftAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly patch: Partial<PostFields>;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<PostFields>;
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
  const res = await saveGuardedPostDraft(caller, {
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

export async function preparePostPublishAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId?: string;
  readonly newDraft?: PostFields;
  readonly draftPatch?: Partial<PostFields>;
  readonly expectedRevision?: number;
  readonly overwrite?: boolean;
}): Promise<PreparePublishResult<PostFields>> {
  const authz = await requireActionPermission("content:publish");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "content:publish",
    };
  }

  const caller = callerFromAuthorized(authz);
  const guardFailure = await validatePostBeforePublish(caller, {
    docId: input.docId,
    newDraft: input.newDraft,
    draftPatch: input.draftPatch,
  });
  if (guardFailure) return serializeFailure(guardFailure);

  return preparePublishAction<PostFields>({
    ...input,
    collection: "posts",
  });
}

export async function confirmPostPublishAction(input: {
  readonly collection: ContentCollectionName;
  readonly docId: string;
  readonly expectedRevision: number;
  readonly overwrite?: boolean;
  readonly notify?: boolean;
  readonly approvedConfirmed?: boolean;
}): Promise<
  ContentActionResult<{
    readonly doc: SerializedContentDoc<PostFields>;
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
  const guardFailure = await validatePostBeforePublish(caller, {
    docId: input.docId,
  });
  if (guardFailure) return serializeFailure(guardFailure);

  return confirmPublishAction<PostFields>({
    ...input,
    collection: "posts",
  });
}
