import { PermissionDenied } from "@src/components/rbac/permission-denied";
import { MediaLibraryView } from "@src/components/content/media";
import { callerFromAuthorized } from "@src/lib/content/caller";
import { MEDIA_KIND, type MediaKind } from "@src/lib/media/policy";
import { listMedia } from "@src/service/media/media.service";
import { requireContentPageAuth } from "../shell-helpers";

const PAGE_SIZE = 24;

function parseKindParam(raw: string | string[] | undefined): MediaKind | "" {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  if (
    value === MEDIA_KIND.image ||
    value === MEDIA_KIND.audio ||
    value === MEDIA_KIND.pdf
  ) {
    return value;
  }
  return "";
}

function parseBoolParam(raw: string | string[] | undefined): boolean {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  return value === "1" || value === "true";
}

function parsePageParam(raw: string | string[] | undefined): number {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseStringParam(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
}

/**
 * Media Library page (`/content/media`, `ICR-196` AC7 & `F-editor-ux-decisions.md` §2.7).
 * Reached from the Content hub (not main navigation), URL-driven filters (`?kind=&unused=&q=&page=`).
 */
export default async function MediaLibraryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{
    readonly kind?: string | string[];
    readonly unused?: string | string[];
    readonly q?: string | string[];
    readonly page?: string | string[];
  }>;
}) {
  const { locale } = await params;
  const authz = await requireContentPageAuth(locale);
  if (!authz) return <PermissionDenied />;

  const sp = await searchParams;
  const kind = parseKindParam(sp.kind);
  const unused = parseBoolParam(sp.unused);
  const q = parseStringParam(sp.q);
  const page = parsePageParam(sp.page);

  const listed = await listMedia(callerFromAuthorized(authz), {
    ...(kind ? { kind } : {}),
    ...(unused ? { unused: true } : {}),
    ...(q ? { query: q } : {}),
    page,
    pageSize: PAGE_SIZE,
  });

  const initialItems = listed.ok
    ? listed.items.map((doc) => ({
        ...doc,
        createdAt: doc.createdAt.toISOString(),
      }))
    : [];

  return (
    <MediaLibraryView
      initialItems={initialItems}
      total={listed.ok ? listed.total : 0}
      page={page}
      pageSize={PAGE_SIZE}
      currentKind={kind}
      currentUnused={unused}
      currentQuery={q}
      canManageMedia={authz.permissions.has("media:manage")}
    />
  );
}
