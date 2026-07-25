"use server";

import { getCurrentUser } from "@src/lib/auth/current-user";
import { updatePreferredLocale } from "@src/service/user.service";
import { isValidLocale, type Locale } from "@src/i18n/config";

/**
 * Persists the current user's `preferredLocale` (spec §2 R18 / §4 Server
 * Action). Best-effort — the `LocaleSwitcher` applies the URL/`NEXT_LOCALE`
 * change regardless of this result, so a failure here (no session, an
 * out-of-set locale, or a Mongo write failure) never blocks the visual
 * switch — it just leaves the stored preference unchanged until the next
 * toggle.
 */
export async function setPreferredLocale(
  locale: Locale,
): Promise<{ ok: boolean }> {
  if (!isValidLocale(locale)) return { ok: false };

  const result = await getCurrentUser();
  if (!result.ok) return { ok: false };

  const ok = await updatePreferredLocale(result.user.firebaseUid, locale);
  return { ok };
}
