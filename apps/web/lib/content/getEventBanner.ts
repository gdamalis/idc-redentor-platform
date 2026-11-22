import {
  COLLECTIONS,
  GLOBAL_KIND,
  isValidSlug,
  type EventBannerFields,
  type Locale,
  type LocationFields,
} from "@idcr/content";
import { isValidLocale } from "@src/i18n/config";
import { createCachedReader } from "./cache";
import { requireContentDb, type StoredEnvelope } from "./db";
import { resolveLocalized, resolveSnapshot, snapshotKey } from "./locale";
import { loadMediaMap, toImageView } from "./media";
import type { EventBannerLocationView, EventBannerView } from "./types";

async function fetchEventBanner(
  name: string,
  locale: Locale,
  isDraftMode: boolean,
): Promise<EventBannerView | undefined> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);

  const [bannerDoc, locationDoc] = await Promise.all([
    db
      .collection<StoredEnvelope<EventBannerFields>>(COLLECTIONS.eventBanners)
      .findOne({ [`${snap}.machineName`]: name }),
    db
      .collection<StoredEnvelope<LocationFields>>(COLLECTIONS.globals)
      .findOne({
        [`${snap}.kind`]: GLOBAL_KIND.location,
        [`${snap}.machineName`]: "location",
      }),
  ]);

  const fields = resolveSnapshot(bannerDoc, isDraftMode);
  if (!bannerDoc || !fields) return undefined;

  const locationFields = resolveSnapshot(locationDoc, isDraftMode);
  const mediaMap = await loadMediaMap(db, [fields.image]);

  const location: EventBannerLocationView | null = locationFields
    ? {
        addressLine1: locationFields.addressLine1 ?? "",
        neighborhood: locationFields.neighborhood,
        city: locationFields.city ?? "",
        country: locationFields.country ?? "",
        mapEmbedUrl: locationFields.mapEmbedUrl,
        googleMapsUrl: locationFields.googleMapsUrl,
        location:
          locationFields.lat != null && locationFields.lon != null
            ? { lat: locationFields.lat, lon: locationFields.lon }
            : null,
      }
    : null;

  return {
    eventInfo: {
      name: resolveLocalized(fields.event?.name, locale) ?? "",
      dayOfWeek: resolveLocalized(fields.event?.dayOfWeek, locale) ?? "",
      date: fields.event?.date ?? null,
      time: fields.event?.time ?? "",
      note: resolveLocalized(fields.event?.note, locale) ?? null,
    },
    location,
    image: fields.image
      ? toImageView(mediaMap.get(fields.image), locale) ?? null
      : null,
    sys: { id: bannerDoc._id.toHexString() },
    __typename: "EventBanner",
  };
}

const publishedEventBannerReader = createCachedReader(
  "event-banner",
  (name: string, locale: Locale) => fetchEventBanner(name, locale, false),
);

const draftEventBannerReader = createCachedReader(
  "event-banner-draft",
  (name: string, locale: Locale) => fetchEventBanner(name, locale, true),
);

export async function getEventBanner(
  name: string,
  locale: string,
  isDraftMode = false,
): Promise<EventBannerView | undefined> {
  if (!isValidSlug(name) || !isValidLocale(locale)) return undefined;
  return isDraftMode
    ? draftEventBannerReader.readDraft(name, locale)
    : publishedEventBannerReader.readPublished(name, locale);
}
