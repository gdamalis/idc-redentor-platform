import type { DecodedIdToken } from "firebase-admin/auth";
import { i18n } from "@src/i18n/config";
import {
  createUserFromInvite,
  findUserByFirebaseUid,
} from "@src/service/user.service";
import { acceptInvite, findPendingInvite } from "@src/service/invite.service";
import type { SessionResult } from "@src/service/types";
import { normalizeEmail } from "./email";

/**
 * Invite-only provisioning (spec §2 R5). Given a verified `DecodedIdToken`:
 *
 * 1. No usable email on the token ⇒ nothing to match ⇒ `no-invite`.
 * 2. A `User` already exists for this `firebaseUid` ⇒ returning sign-in:
 *    `active` → `ok`; `disabled` → `disabled`. The invite is left untouched.
 * 3. First sign-in: look up a pending invite by normalized email. No match
 *    (also covers expired/revoked/mismatched — all excluded at the query
 *    layer in `findPendingInvite`) ⇒ `no-invite`, **creating nothing**. A
 *    match creates the `User` (seeding `preferredLocale` from the invite,
 *    defaulting to the app's default locale) and accepts the invite.
 *
 * Every outcome is a `SessionResult` return value — never thrown control
 * flow. Roles/locale come from the created/existing Mongo `User`, never the
 * token.
 */
export async function resolveOrProvision(
  decoded: DecodedIdToken,
): Promise<SessionResult> {
  const email = normalizeEmail(decoded.email);
  if (!email) return { ok: false, reason: "no-invite" };

  const existing = await findUserByFirebaseUid(decoded.uid);
  if (existing) {
    if (existing.status === "disabled") {
      return { ok: false, reason: "disabled" };
    }
    return { ok: true, user: existing };
  }

  const invite = await findPendingInvite(email);
  if (!invite) return { ok: false, reason: "no-invite" };

  const user = await createUserFromInvite({
    firebaseUid: decoded.uid,
    email,
    roleIds: invite.roleIds,
    preferredLocale: invite.locale ?? i18n.defaultLocale,
  });
  await acceptInvite(invite._id);

  return { ok: true, user };
}
