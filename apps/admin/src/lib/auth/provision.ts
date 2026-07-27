import type { DecodedIdToken } from "firebase-admin/auth";
import { i18n } from "@src/i18n/config";
import {
  createUserFromInvite,
  findUserByFirebaseUid,
} from "@src/service/user.service";
import {
  claimPendingInvite,
  findInviteByEmail,
  revertInviteClaim,
} from "@src/service/invite.service";
import type { AdminUser, SessionResult } from "@src/service/types";
import { normalizeEmail } from "./email";

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
 *    the `User` a moment earlier. Re-read `findUserByFirebaseUid` before
 *    concluding anything — if the concurrent winner's `User` now exists,
 *    resolve exactly like the returning-user path (step 2).
 *
 *    Codex round-4 P1 fix: that re-read alone is NOT proof of `no-invite` —
 *    it's a point-in-time check with no synchronization against the winner's
 *    concurrent `insertOne`, so the loser can observe an empty re-read while
 *    the winner is still mid-`createUserFromInvite`. The `no-invite` /
 *    `provisioning-conflict` split is justified on its own merits:
 *      - `no-invite` = **provably** not provisionable — no invite for this
 *        email exists, or none can be proven to. The user is sent to
 *        `/no-access`, a dead end with no retry path.
 *      - `provisioning-conflict` = we could NOT complete provisioning and we
 *        CANNOT prove the user was never invited — a concurrent winner still
 *        mid-provision, an invite already accepted, or a transient store
 *        failure. The user is told to retry.
 *    This is not a cosmetic distinction: answering `no-invite` to a
 *    legitimately-invited person whose create merely hit a transient failure
 *    sends them to `/no-access` — a dead end telling them to "contact an
 *    administrator" when simply retrying would have worked. That user-facing
 *    bug is exactly what this split prevents.
 *
 *    So when the re-read comes back empty, look up the invite by email
 *    (`findInviteByEmail`, any status) and branch: `status === "accepted"` ⇒
 *    someone claimed it — a concurrent winner still mid-provision, or an
 *    earlier acceptance — either way we cannot prove "never invited", so
 *    `{ ok:false, reason:"provisioning-conflict" }`; no invite doc at all, or
 *    one that's `revoked`/expired `pending` ⇒ provably `no-invite`.
 *
 *    A claimed invite creates the `User` (seeding `preferredLocale` from the
 *    invite, defaulting to the app's default locale). Codex round-4 P2 fix:
 *    if that create throws for ANY reason, the claim is unconditionally
 *    reverted (Codex round-3 P2 fix: the revert is CONDITIONAL on the invite
 *    still being in the exact `"accepted"` state this claim left it in — see
 *    `revertInviteClaim` — so it can never clobber a newer transition, e.g. a
 *    concurrent revoke) and `provisioning-conflict` is returned (never
 *    `no-invite` — a create failure proves nothing about whether the user
 *    was ever invited) — see the catch block below for why no error may
 *    ever propagate past this function, and why reverting is always correct
 *    here.
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
    // ago — re-read before concluding anything, so the loser resolves like a
    // returning user instead of wrongly reporting `no-invite` against the
    // winner's just-created account (see doc comment above).
    const concurrentlyProvisioned = await findUserByFirebaseUid(decoded.uid);
    if (concurrentlyProvisioned) {
      return resultForExistingUser(concurrentlyProvisioned);
    }

    // Codex round-4 P1 fix: the re-read above is unproven against the
    // winner's concurrent `insertOne` — an empty result here does NOT prove
    // `no-invite` by itself. Check the invite doc directly (any status) to
    // make the distinction provable, no sleeps/polling required.
    const inviteByEmail = await findInviteByEmail(email);
    if (inviteByEmail?.status === "accepted") {
      // Claimed by someone — a concurrent winner still mid-provision, or an
      // earlier acceptance. We cannot prove "never invited", so this must
      // never resolve as `no-invite` — that would wrongly dead-end a
      // legitimately-invited user at `/no-access`.
      return { ok: false, reason: "provisioning-conflict" };
    }
    // No invite doc at all, or one that's `revoked`/expired `pending`:
    // provably no-invite.
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
  } catch {
    // Codex round-4 P2 fix: ANY error reaching this catch means WE created no
    // user — `createUserFromInvite`'s own internal E11000 recovery already
    // returns the existing user when the duplicate resolves to OUR
    // firebaseUid, so that path never reaches here. An error here means
    // either a non-duplicate write failure, or a duplicate whose internal
    // re-read (by firebaseUid) came back empty — which happens precisely
    // when the duplicate came from the EMAIL unique index (e.g. a
    // re-invited address whose stale Mongo row still holds that email under
    // a different/old firebaseUid, or a recreated Firebase account with a
    // new uid). Either way the claim must be reverted (Codex round-3 P2 fix:
    // conditionally, on the claim's own `acceptedAt` — see
    // `revertInviteClaim`) so it isn't stranded `"accepted"` with no user,
    // and the outcome reported as transient/ambiguous (`provisioning-conflict`)
    // — never `no-invite`, which would wrongly send a legitimately-invited
    // user whose create merely failed to a dead-end `/no-access` page.
    await revertInviteClaim(invite._id, invite.acceptedAt);
    return { ok: false, reason: "provisioning-conflict" };
  }
}
