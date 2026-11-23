import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  SITE_PAGES,
  findFixedEntry,
  type FixedEntryType,
  type Locale,
} from "@idcr/content";
import { callerFromAuthorized, type ContentCaller } from "@src/lib/content/caller";
import type { ContentCollectionName } from "@src/lib/content/errors";
import { COLLECTION_META } from "@src/lib/content/guards";
import { isPublishEmailsEnabled } from "@src/lib/content/revalidate";
import { isContentTrialMode } from "@src/lib/content/trial-mode";
import type { EntryEditorPermissions } from "@src/components/content/entry-editor-types";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import {
  extractPermissions,
  requireContentPageAuth,
  serializeDocView,
} from "@src/app/[locale]/(app)/content/shell-helpers";
import {
  getContentById,
  getContentByNaturalKey,
} from "@src/service/content/content-core.service";
import type { ContentStatus } from "@idcr/content";

export type FixedCollectionName =
  | "sections"
  | "belief_collections"
  | "event_banners"
  | "seo_entries"
  | "globals";

export type FixedEditorPageData<TFields> =
  | { readonly forbidden: true }
  | {
      readonly forbidden: false;
      readonly caller: ContentCaller;
      readonly panelLocale: Locale;
      readonly initialDoc: SerializedContentDoc<TFields>;
      readonly initialStatus: ContentStatus;
      readonly initialValues: TFields;
      readonly permissions: EntryEditorPermissions;
      readonly canManageMedia: boolean;
      readonly isTrialMode: boolean;
      readonly isPublishEmailsEnabled: boolean;
      readonly backHref: string;
      readonly backLabel: string;
      readonly friendlyTitle: string;
      readonly machineName: string;
      readonly appearsOn: readonly string[];
      readonly liveUrl?: string;
    };

export async function loadFixedEditorPageData<TFields extends { machineName: string }>(input: {
  readonly locale: string;
  readonly collection: FixedCollectionName;
  readonly docId?: string;
  readonly machineName?: string;
  readonly backHref: string;
  readonly backLabelKey: string;
}): Promise<FixedEditorPageData<TFields>> {
  const authz = await requireContentPageAuth(input.locale);
  if (!authz) return { forbidden: true };

  const panelLocale = (input.locale === "en-US" ? "en-US" : "es-AR") as Locale;
  const caller = callerFromAuthorized(authz);
  const t = await getTranslations("content");

  const loaded = input.docId
    ? await getContentById<TFields>(caller, input.collection, input.docId)
    : input.machineName
      ? await getContentByNaturalKey<TFields>(
          caller,
          input.collection as Exclude<ContentCollectionName, "authors">,
          input.machineName,
        )
      : ({ ok: false, reason: "not-found" } as const);

  if (!loaded.ok) notFound();

  const resolvedMachineName = loaded.doc.draft.machineName || input.machineName;
  if (!resolvedMachineName) notFound();

  const fixedType = COLLECTION_META[input.collection].contentType as FixedEntryType;
  const fixedMeta = findFixedEntry(fixedType, resolvedMachineName);
  if (!fixedMeta) notFound();

  const baseSiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL?.trim();
  const previewPath = SITE_PAGES[fixedMeta.previewPage].path;
  const liveUrl = baseSiteUrl
    ? `${baseSiteUrl.replace(/\/$/, "")}/${panelLocale}${previewPath}`
    : undefined;

  return {
    forbidden: false,
    caller,
    panelLocale,
    initialDoc: serializeDocView(loaded),
    initialStatus: loaded.status,
    initialValues: loaded.doc.draft,
    permissions: extractPermissions(authz),
    canManageMedia: authz.permissions.has("media:manage"),
    isTrialMode: isContentTrialMode(),
    isPublishEmailsEnabled: isPublishEmailsEnabled(),
    backHref: input.backHref,
    backLabel: t(input.backLabelKey as never),
    friendlyTitle: fixedMeta.name[panelLocale],
    machineName: fixedMeta.machineName,
    appearsOn: fixedMeta.appearsOn.map((slug) => SITE_PAGES[slug].label[panelLocale]),
    ...(liveUrl !== undefined && { liveUrl }),
  };
}
