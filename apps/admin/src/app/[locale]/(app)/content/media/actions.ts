"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import type { Localized, MediaDoc } from "@idcr/content";
import { redirect } from "@src/i18n/routing";
import {
  REQUEST_PATHNAME_HEADER,
  sanitizeRequestPathname,
} from "@src/lib/http/request-pathname";
import type { PermissionKey } from "@src/lib/rbac/permissions";
import {
  getSessionPermissions,
  type Authorized,
} from "@src/lib/rbac/require-permission";
import { requireActionPermission } from "@src/lib/rbac/require-action-permission";
import { callerFromAuthorized } from "@src/lib/content/caller";
import type { ContentReferenceUsage } from "@src/lib/content/errors";
import type { MediaResult } from "@src/lib/media/errors";
import type { AllowedMediaContentType, MediaKind } from "@src/lib/media/policy";
import {
  confirmMediaUpload,
  deleteMedia,
  getMediaByIds,
  getMediaUsages,
  listMedia,
  prepareMediaUpload,
  updateMediaDetails,
} from "@src/service/media/media.service";

/** Client-compatible media record accepting either RSC `MediaDoc` (`Date`) or Server Action `SerializedMediaDoc` (`string`). */
export interface MediaDocLike extends Omit<MediaDoc, "createdAt"> {
  readonly createdAt: string | Date;
}

/** JSON-safe media record passed between RSCs, Server Actions, and Client Components. */
export interface SerializedMediaDoc extends Omit<MediaDoc, "createdAt"> {
  readonly createdAt: string;
}

function serializeMediaDoc(doc: MediaDoc): SerializedMediaDoc {
  return {
    ...doc,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * Local multi-permission Server Action gate (kept inside `content/media/actions.ts`
 * to maintain zero edits to `apps/admin/src/lib/rbac/*`). Mirrors `requireActionPermission`
 * redirect behavior for expired/disabled sessions while allowing ANY of `keys`.
 */
async function requireAnyMediaActionPermission(
  keys: readonly [PermissionKey, ...PermissionKey[]],
): Promise<
  | Authorized
  | {
      readonly ok: false;
      readonly reason: "forbidden";
      readonly requiredPermission: PermissionKey;
    }
> {
  const result = await getSessionPermissions();
  if (!result.ok) {
    if (result.reason === "forbidden") {
      return { ok: false, reason: "forbidden", requiredPermission: keys[0] };
    }
    const locale = await getLocale();
    if (result.reason === "unauthenticated") {
      const requestHeaders = await headers();
      const callbackUrl = sanitizeRequestPathname(
        requestHeaders.get(REQUEST_PATHNAME_HEADER),
      );
      return redirect({
        href: callbackUrl
          ? { pathname: "/login", query: { callbackUrl } }
          : "/login",
        locale,
      });
    }
    return redirect({ href: "/no-access", locale });
  }

  const allowed = keys.some((key) => result.permissions.has(key));
  if (!allowed) {
    return { ok: false, reason: "forbidden", requiredPermission: keys[0] };
  }
  return result;
}

export async function listMediaAction(input: {
  readonly kind?: MediaKind;
  readonly kinds?: readonly MediaKind[];
  readonly query?: string;
  readonly unused?: boolean;
  readonly page?: number;
  readonly pageSize?: number;
}): Promise<
  MediaResult<{
    readonly items: SerializedMediaDoc[];
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
    readonly hasMore: boolean;
  }>
> {
  // AC6: picking an existing file needs ONLY `content:write` (library view uses `content:read`).
  const authz = await requireAnyMediaActionPermission([
    "content:write",
    "content:read",
    "media:manage",
  ]);
  if (!authz.ok) return authz;

  const res = await listMedia(callerFromAuthorized(authz), input);
  if (!res.ok) return res;
  return {
    ok: true,
    items: res.items.map(serializeMediaDoc),
    total: res.total,
    page: res.page,
    pageSize: res.pageSize,
    hasMore: res.hasMore,
  };
}

export async function getMediaByIdsAction(
  ids: readonly string[],
): Promise<MediaResult<{ readonly items: SerializedMediaDoc[] }>> {
  const authz = await requireAnyMediaActionPermission([
    "content:write",
    "content:read",
    "media:manage",
  ]);
  if (!authz.ok) return authz;

  const res = await getMediaByIds(callerFromAuthorized(authz), ids);
  if (!res.ok) return res;
  return { ok: true, items: res.items.map(serializeMediaDoc) };
}

export async function getMediaUsagesAction(
  mediaId: string,
): Promise<MediaResult<{ readonly usedBy: ContentReferenceUsage[] }>> {
  const authz = await requireAnyMediaActionPermission([
    "content:read",
    "media:manage",
  ]);
  if (!authz.ok) return authz;

  return getMediaUsages(callerFromAuthorized(authz), mediaId);
}

export async function prepareMediaUploadAction(input: {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly sha256: string;
}): Promise<
  MediaResult<
    | { readonly status: "duplicate"; readonly existing: SerializedMediaDoc }
    | {
        readonly status: "ready";
        readonly mediaId: string;
        readonly pathname: string;
        readonly normalizedContentType: AllowedMediaContentType;
        readonly maxBytes: number;
        readonly multipart: boolean;
      }
  >
> {
  const authz = await requireActionPermission("media:manage");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    };
  }

  const res = await prepareMediaUpload(callerFromAuthorized(authz), input);
  if (!res.ok) return res;
  if (res.status === "duplicate") {
    return {
      ok: true,
      status: "duplicate",
      existing: serializeMediaDoc(res.existing),
    };
  }
  return res;
}

export async function confirmMediaUploadAction(input: {
  readonly mediaId: string;
  readonly pathname: string;
  readonly url: string;
  readonly filename: string;
  readonly sha256: string;
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
  readonly title: Localized<string>;
  readonly alt?: Localized<string>;
  readonly decorative?: boolean;
  readonly caption?: Localized<string>;
  readonly credit?: Localized<string>;
}): Promise<MediaResult<{ readonly doc: SerializedMediaDoc }>> {
  const authz = await requireActionPermission("media:manage");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    };
  }

  const res = await confirmMediaUpload(callerFromAuthorized(authz), input);
  if (!res.ok) return res;

  revalidatePath("/[locale]/content/media", "page");
  return { ok: true, doc: serializeMediaDoc(res.doc) };
}

export async function updateMediaDetailsAction(input: {
  readonly mediaId: string;
  readonly patch: {
    readonly title?: Localized<string>;
    readonly alt?: Localized<string>;
    readonly decorative?: boolean;
    readonly caption?: Localized<string>;
    readonly credit?: Localized<string>;
    readonly durationSeconds?: number;
  };
}): Promise<MediaResult<{ readonly doc: SerializedMediaDoc }>> {
  const authz = await requireActionPermission("media:manage");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    };
  }

  const res = await updateMediaDetails(callerFromAuthorized(authz), {
    mediaId: input.mediaId,
    patch: input.patch,
  });
  if (!res.ok) return res;

  revalidatePath("/[locale]/content/media", "page");
  return { ok: true, doc: serializeMediaDoc(res.doc) };
}

export async function deleteMediaAction(
  mediaId: string,
): Promise<MediaResult<{ readonly docId: string; readonly blobDeleted: boolean }>> {
  const authz = await requireActionPermission("media:manage");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "media:manage",
    };
  }

  const res = await deleteMedia(callerFromAuthorized(authz), mediaId);
  if (!res.ok) return res;

  revalidatePath("/[locale]/content/media", "page");
  return res;
}
