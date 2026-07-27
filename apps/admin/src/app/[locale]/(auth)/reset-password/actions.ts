"use server";

import { z } from "zod";
import { getAdminAuth } from "@src/lib/firebase/admin";
import { sendPasswordResetEmail } from "@src/service/auth-email";
import { tryAcquireResetThrottle } from "@src/service/reset-throttle.service";
import { normalizeEmail } from "@src/lib/auth/email";
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
 * The address is normalized (trim + lowercase, `normalizeEmail`) BEFORE
 * anything else (Codex round-2 P1 fix) so casing variants of the same
 * mailbox (`user@x.com` vs `User@X.com` — Firebase treats these
 * identically) share one throttle claim and one reset link, instead of each
 * bypassing the cooldown as if they were different addresses.
 *
 * **Throttled** (P2 finding): a per-email cooldown (`reset-throttle.service`)
 * gates the Firebase link generation + Resend send so repeat requests for
 * the same address within the cooldown window are a no-op — contains an
 * email-bomb / Admin-SDK-quota attack via this public action. The throttle
 * acquisition itself is inside the try/catch below (Codex round-2 P2 fix):
 * a throttle-store outage (Mongo down, index build failing, a non-duplicate
 * insert error) is caught + logged like any other failure here rather than
 * escaping as an uncaught throw from this public Server Action — resets are
 * briefly unavailable, but the response stays generic, never an error.
 *
 * The generated link points at the admin login (not Firebase's own reset
 * page), and the email is sent via the admin-branded template — Firebase's
 * default reset email is never triggered.
 */
export async function requestPasswordReset(
  rawEmail: string,
  locale: Locale,
): Promise<{ ok: true }> {
  const email = normalizeEmail(rawEmail);
  const parsed = emailSchema.safeParse(email);

  if (parsed.success) {
    try {
      const isAllowed = await tryAcquireResetThrottle(email);

      if (isAllowed) {
        const resetUrl = await getAdminAuth().generatePasswordResetLink(email, {
          url: `${process.env.NEXT_PUBLIC_ADMIN_BASE_URL}/${locale}/login`,
        });
        await sendPasswordResetEmail({ to: email, resetUrl, locale });
      }
    } catch (error) {
      console.error("[reset]", error);
    }
  }

  return { ok: true };
}
