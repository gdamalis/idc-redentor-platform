import {
  COLLECTIONS,
  GLOBAL_KIND,
  type FooterFields,
  type Locale,
  type LocationFields,
} from "@idcr/content";
import { isValidLocale } from "@src/i18n/config";
import { createCachedReader } from "./cache";
import { requireContentDb, type StoredEnvelope } from "./db";
import { resolveLocalized, resolveSnapshot, snapshotKey } from "./locale";
import { loadMediaMap, toImageView } from "./media";
import type { FooterLocationView, FooterView } from "./types";

async function fetchFooter(
  locale: Locale,
  isDraftMode: boolean,
): Promise<FooterView> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const globalsCol = db.collection<
    StoredEnvelope<FooterFields | LocationFields>
  >(COLLECTIONS.globals);

  const [footerDoc, locationDoc] = await Promise.all([
    globalsCol.findOne({
      [`${snap}.kind`]: GLOBAL_KIND.footer,
      [`${snap}.machineName`]: "footer",
    }) as Promise<StoredEnvelope<FooterFields> | null>,
    globalsCol.findOne({
      [`${snap}.kind`]: GLOBAL_KIND.location,
      [`${snap}.machineName`]: "location",
    }) as Promise<StoredEnvelope<LocationFields> | null>,
  ]);

  const footerFields = resolveSnapshot(footerDoc, isDraftMode);
  if (!footerFields) {
    throw new Error("[getFooter] Footer document not found");
  }

  const locationFields = resolveSnapshot(locationDoc, isDraftMode);
  const mediaMap = await loadMediaMap(db, [footerFields.logo]);

  const location: FooterLocationView | null = locationFields
    ? {
        addressLine1: locationFields.addressLine1 ?? "",
        neighborhood: locationFields.neighborhood,
        city: locationFields.city ?? "",
        country: locationFields.country ?? "",
        googleMapsUrl: locationFields.googleMapsUrl,
      }
    : null;

  return {
    logo: footerFields.logo
      ? toImageView(mediaMap.get(footerFields.logo), locale)
      : undefined,
    shortDescription:
      resolveLocalized(footerFields.shortDescription, locale) ?? "",
    socialLinks: (footerFields.socialLinks ?? []).map(({ url, platform }) => ({
      url,
      platform,
    })),
    location,
  };
}

const publishedFooterReader = createCachedReader("footer", (locale: Locale) =>
  fetchFooter(locale, false),
);

const draftFooterReader = createCachedReader("footer-draft", (locale: Locale) =>
  fetchFooter(locale, true),
);

export async function getFooter(
  locale: string,
  isDraftMode = false,
): Promise<FooterView> {
  if (!isValidLocale(locale)) {
    throw new Error(`[getFooter] Invalid locale: ${locale}`);
  }
  return isDraftMode
    ? draftFooterReader.readDraft(locale)
    : publishedFooterReader.readPublished(locale);
}
