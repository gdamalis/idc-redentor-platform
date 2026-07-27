import { getTranslations } from "next-intl/server";
import type { Locale } from "@src/i18n/config";
import type { EmailTemplate } from "./invite.template";

export interface PasswordResetEmailParams {
  resetUrl: string;
  locale: Locale;
}

/**
 * Builds the bilingual, branded password-reset email (R11) from the
 * Admin-SDK-generated `resetUrl` (spec §2 R10) — the admin panel's own
 * branding, never Firebase's default reset email. Pure builder — sending
 * happens in `service/auth-email.ts`.
 */
export async function buildPasswordResetEmail({
  resetUrl,
  locale,
}: PasswordResetEmailParams): Promise<EmailTemplate> {
  const t = await getTranslations({ locale, namespace: "auth.email.reset" });

  const subject = t("subject");
  const heading = t("heading");
  const body = t("body");
  const cta = t("cta");
  const expiryNote = t("expiryNote");
  const ignoreNote = t("ignoreNote");
  const footer = t("footer");

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
  <h1 style="margin:0 0 16px;font-size:22px;color:#111;">${heading}</h1>
  <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#444;">${body}</p>
  <p style="margin:0 0 24px;">
    <a href="${resetUrl}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">${cta}</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#777;">${expiryNote}</p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#777;">${ignoreNote}</p>
  <p style="margin:0;font-size:13px;line-height:1.5;color:#999;">${footer}</p>
</div>
`.trim();

  const text = [heading, body, `${cta}: ${resetUrl}`, expiryNote, ignoreNote, footer].join("\n\n");

  return { subject, html, text };
}
