import { buildInviteEmail } from "@src/templates/invite.template";
import { buildPasswordResetEmail } from "@src/templates/password-reset.template";
import type { Locale } from "@src/i18n/config";
import { sendEmail } from "./mailing/mailing.service";

export interface SendInviteEmailParams {
  to: string;
  inviteUrl: string;
  locale: Locale;
}

/**
 * Sends the bilingual invite email (R11): `locale` is the invite's own
 * `Invite.locale` — the invitee's chosen language, not the caller's UI
 * locale — so an English-first team member gets an English email + link.
 */
export async function sendInviteEmail({
  to,
  inviteUrl,
  locale,
}: SendInviteEmailParams): Promise<boolean> {
  const { subject, html, text } = await buildInviteEmail({ inviteUrl, locale });
  return sendEmail({ to, subject, html, text });
}

export interface SendPasswordResetEmailParams {
  to: string;
  resetUrl: string;
  locale: Locale;
}

/**
 * Sends the bilingual, admin-branded password-reset email (R10/R11) — never
 * Firebase's own default reset email. `resetUrl` is the Admin SDK link from
 * `getAdminAuth().generatePasswordResetLink`.
 */
export async function sendPasswordResetEmail({
  to,
  resetUrl,
  locale,
}: SendPasswordResetEmailParams): Promise<boolean> {
  const { subject, html, text } = await buildPasswordResetEmail({ resetUrl, locale });
  return sendEmail({ to, subject, html, text });
}
