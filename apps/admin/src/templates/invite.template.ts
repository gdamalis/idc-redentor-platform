import { getTranslations } from "next-intl/server";
import type { Locale } from "@src/i18n/config";

export interface InviteEmailParams {
  inviteUrl: string;
  locale: Locale;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Builds the bilingual, branded invite email (R11): the invitee's
 * `Invite.locale` decides which language renders, so an English-first team
 * member gets an English email + lands on the English login (R18). Pure
 * builder — sending happens in `service/auth-email.ts`.
 */
export async function buildInviteEmail({
  inviteUrl,
  locale,
}: InviteEmailParams): Promise<EmailTemplate> {
  const t = await getTranslations({ locale, namespace: "auth.email.invite" });

  const subject = t("subject");
  const heading = t("heading");
  const greeting = t("greeting");
  const body = t("body");
  const cta = t("cta");
  const expiryNote = t("expiryNote");
  const footer = t("footer");

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
  <h1 style="margin:0 0 16px;font-size:22px;color:#111;">${heading}</h1>
  <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#444;">${greeting}</p>
  <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#444;">${body}</p>
  <p style="margin:0 0 24px;">
    <a href="${inviteUrl}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">${cta}</a>
  </p>
  <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#777;">${expiryNote}</p>
  <p style="margin:0;font-size:13px;line-height:1.5;color:#999;">${footer}</p>
</div>
`.trim();

  const text = [heading, greeting, body, `${cta}: ${inviteUrl}`, expiryNote, footer].join("\n\n");

  return { subject, html, text };
}
