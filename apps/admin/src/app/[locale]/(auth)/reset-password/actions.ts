"use server";

import { z } from "zod";
import { getAdminAuth } from "@src/lib/firebase/admin";
import { sendPasswordResetEmail } from "@src/service/auth-email";
import { tryAcquireResetThrottle } from "@src/service/reset-throttle.service";
import type { Locale } from "@src/i18n/config";

const emailSchema = z.string().trim().email();

/**
 * Requests a password reset (spec §2 R10). **Enumeration-safe by
 * construction**: this always returns `{ ok: true }` — whether the address
 * is malformed, unregistered (`auth/user-not-found`), throttled, or the send
 * itself fails, the caller can never distinguish those from a genuine
 * success. Any failure is caught and logged server-side only; nothing is
 * ever thrown.
 *
 * **Throttled** (P2 finding): a per-email cooldown (`reset-throttle.service`)
 * gates the Firebase link generation + Resend send so repeat requests for
 * the same address within the cooldown window are a no-op — contains an
 * email-bomb / Admin-SDK-quota attack via this public action.
 *
 * The generated link points at the admin login (not Firebase's own reset
 * page), and the email is sent via the admin-branded template — Firebase's
 * default reset email is never triggered.
 */
export async function requestPasswordReset(
  email: string,
  locale: Locale,
): Promise<{ ok: true }> {
  const parsed = emailSchema.safeParse(email);

  if (parsed.success) {
    const isAllowed = await tryAcquireResetThrottle(parsed.data);

    if (isAllowed) {
      try {
        const resetUrl = await getAdminAuth().generatePasswordResetLink(parsed.data, {
          url: `${process.env.NEXT_PUBLIC_ADMIN_BASE_URL}/${locale}/login`,
        });
        await sendPasswordResetEmail({ to: parsed.data, resetUrl, locale });
      } catch (error) {
        console.error("[reset]", error);
      }
    }
  }

  return { ok: true };
}
