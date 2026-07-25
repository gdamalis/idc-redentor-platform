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
import type { AdminUser, SessionResult } from "@src/service/types";
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
 *    match can also mean a LOST RACE, not just expired/revoked/mismatched: a
 *    concurrent same-uid exchange may have claimed the invite and provisioned
 *    the `User` a moment earlier. Codex round-3 P1 fix: re-read
 *    `findUserByFirebaseUid` before concluding `no-invite` — if the
 *    concurrent winner's `User` now exists, resolve exactly like the
 *    returning-user path (step 2) instead of returning `no-invite`. Getting
 *    this wrong is not cosmetic: the client deletes the Firebase credential
 *    on `no-invite` (see below), which for a lost race would delete the
 *    WINNER's just-provisioned account too (same `firebaseUid`/browser
 *    session) — a permanent lockout plus an orphaned Mongo `User`. Only when
 *    that re-read also comes back empty is it genuinely `no-invite`
 *    (expired/revoked/mismatched), **creating nothing**. A claimed invite
 *    creates the `User` (seeding `preferredLocale` from the invite,
 *    defaulting to the app's default locale). If that create fails for any
 *    reason OTHER than the duplicate-key race `createUserFromInvite` already
 *    recovers from internally, the claim is reverted back to `"pending"`
 *    (Codex round-3 P2 fix: the revert is now CONDITIONAL on the invite
 *    still being in the exact `"accepted"` state this claim left it in — see
 *    `revertInviteClaim` — so it can never clobber a newer transition, e.g.
 *    a concurrent revoke) so the invite isn't stranded `"accepted"` with no
 *    user.
 *
 * Every outcome is a `SessionResult` return value — never thrown control
 * flow. Roles/locale come from the created/existing Mongo `User`, never the
 * token.
 */
function resultForExistingUser(user: AdminUser): SessionResult {
  if (user.status === "disabled") {
    return { ok: false, reason: "disabled" };
  }
  return { ok: true, user };
}

export async function resolveOrProvision(
  decoded: DecodedIdToken,
): Promise<SessionResult> {
  const email = normalizeEmail(decoded.email);
  if (!email) return { ok: false, reason: "no-invite" };

  const existing = await findUserByFirebaseUid(decoded.uid);
  if (existing) return resultForExistingUser(existing);

  // First-time provisioning only, gated BEFORE any invite lookup: an
  // unverified email never gets to consume — or even see whether it
  // matches — a pending invite.
  if (decoded.email_verified !== true) {
    return { ok: false, reason: "email-unverified" };
  }

  const invite = await claimPendingInvite(email);
  if (!invite) {
    // Lost-race check (Codex round-3 P1 fix): a concurrent same-uid exchange
    // may have claimed this exact invite and provisioned the `User` a moment
    // ago — re-read before concluding `no-invite`, so the loser resolves
    // like a returning user instead of triggering the client's orphan
    // cleanup against the winner's just-created account (see doc comment
    // above).
    const concurrentlyProvisioned = await findUserByFirebaseUid(decoded.uid);
    if (concurrentlyProvisioned) {
      return resultForExistingUser(concurrentlyProvisioned);
    }
    return { ok: false, reason: "no-invite" };
  }

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
    // invite was claimed but no user was created — revert the claim
    // (Codex round-3 P2 fix: conditionally, on the claim's own `acceptedAt`
    // — see `revertInviteClaim`) so it isn't stranded.
    if (isDuplicateKeyError(error)) throw error;
    await revertInviteClaim(invite._id, invite.acceptedAt);
    return { ok: false, reason: "no-invite" };
  }
}
