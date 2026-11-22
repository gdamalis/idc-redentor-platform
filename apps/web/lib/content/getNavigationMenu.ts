import {
  COLLECTIONS,
  GLOBAL_KIND,
  isValidSlug,
  type Locale,
  type NavigationMenuFields,
} from "@idcr/content";
import { isValidLocale } from "@src/i18n/config";
import { createCachedReader } from "./cache";
import { requireContentDb, type StoredEnvelope } from "./db";
import { resolveLocalized, resolveSnapshot, snapshotKey } from "./locale";
import type { MenuItemView } from "./types";

async function fetchNavigationMenu(
  name: string,
  locale: Locale,
  isDraftMode: boolean,
): Promise<MenuItemView[] | undefined> {
  const db = await requireContentDb();
  const snap = snapshotKey(isDraftMode);
  const doc = await db
    .collection<StoredEnvelope<NavigationMenuFields>>(COLLECTIONS.globals)
    .findOne({
      [`${snap}.kind`]: GLOBAL_KIND.navigationMenu,
      [`${snap}.machineName`]: name,
    });

  const fields = resolveSnapshot(doc, isDraftMode);
  if (!fields) return undefined;

  return (fields.menuItems ?? []).map((item) => ({
    groupName: resolveLocalized(item.groupName, locale) ?? "",
    groupLink: { slug: item.groupLink ?? "" },
  }));
}

const publishedNavReader = createCachedReader(
  "navigation-menu",
  (name: string, locale: Locale) => fetchNavigationMenu(name, locale, false),
);

const draftNavReader = createCachedReader(
  "navigation-menu-draft",
  (name: string, locale: Locale) => fetchNavigationMenu(name, locale, true),
);

export async function getNavigationMenu(
  name: string,
  locale: string,
  isDraftMode = false,
): Promise<MenuItemView[] | undefined> {
  if (!isValidSlug(name) || !isValidLocale(locale)) return undefined;
  return isDraftMode
    ? draftNavReader.readDraft(name, locale)
    : publishedNavReader.readPublished(name, locale);
}
