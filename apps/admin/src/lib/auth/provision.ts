import type { DecodedIdToken } from "firebase-admin/auth";
import { i18n } from "@src/i18n/config";
import {
  createUserFromInvite,
  findUserByFirebaseUid,
} from "@src/service/user.service";
import {
  claimPendingInvite,
  revertInviteClaim,
} from "@src/service/invite.service";
import type { SessionResult } from "@src/service/types";
import { normalizeEmail } from "./email";

interface MongoDuplicateKeyError {
  code?: number;
}

function isDuplicateKeyError(error: unknown): error is MongoDuplicateKeyError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as MongoDuplicateKeyError).code === 11000
  );
}

/**
 * Invite-only provisioning (spec §2 R5). Given a verified `DecodedIdToken`:
 *
 * 1. No usable email on the token ⇒ nothing to match ⇒ `no-invite`.
 * 2. A `User` already exists for this `firebaseUid` ⇒ returning sign-in:
 *    `active` → `ok`; `disabled` → `disabled`. The invite is left untouched.
 * 3. First sign-in, unverified email ⇒ `email-unverified`, **creating
 *    nothing**. Firebase's public email/password signup lets anyone create
 *    an account for ANY email address with `email_verified: false` — without
 *    this gate, an attacker could self-report someone else's invited address
 *    and inherit that invite's `roleIds`. Google sign-in always carries
 *    `email_verified: true`, so it's never affected; neither is a returning
 *    user (step 2 already resolved before this check runs).
 * 4. First sign-in, verified email: **atomically claim** a pending invite by
 *    normalized email (`claimPendingInvite`, Codex round-2 P1 fix — closes a
 *    TOCTOU window a separate find + accept left open, where an invite
 *    revoked/expired between the two steps could still provision a user). No
 *    match (also covers expired/revoked/mismatched/already-claimed — all
 *    excluded at the query layer) ⇒ `no-invite`, **creating nothing**. A
 *    claimed invite creates the `User` (seeding `preferredLocale` from the
 *    invite, defaulting to the app's default locale). If that create fails
 *    for any reason OTHER than the duplicate-key race `createUserFromInvite`
 *    already recovers from internally, the claim is reverted back to
 *    `"pending"` so the invite isn't stranded `"accepted"` with no user.
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

  // First-time provisioning only, gated BEFORE any invite lookup: an
  // unverified email never gets to consume — or even see whether it
  // matches — a pending invite.
  if (decoded.email_verified !== true) {
    return { ok: false, reason: "email-unverified" };
  }

  const invite = await claimPendingInvite(email);
  if (!invite) return { ok: false, reason: "no-invite" };

  try {
    const user = await createUserFromInvite({
      firebaseUid: decoded.uid,
      email,
      roleIds: invite.roleIds,
      preferredLocale: invite.locale ?? i18n.defaultLocale,
    });
    return { ok: true, user };
  } catch (error) {
    // The one expected throw here is the pre-existing duplicate-key race
    // inside `createUserFromInvite`, when its own re-read also comes back
    // empty — an exceedingly rare inconsistency that predates this fix.
    // Propagate it unchanged rather than reverting a claim a user may have
    // genuinely (if racily) already consumed. Any OTHER failure means the
    // invite was claimed but no user was created — revert the claim so it
    // isn't stranded.
    if (isDuplicateKeyError(error)) throw error;
    await revertInviteClaim(invite._id);
    return { ok: false, reason: "no-invite" };
  }
}
