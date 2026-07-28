"use server";

import { revalidatePath } from "next/cache";
import { requireActionPermission } from "@src/lib/rbac/require-action-permission";
import { withAdminTransaction } from "@src/service/database.service";
import { listRoles } from "@src/service/role.service";
import {
  deleteUser,
  listUsers,
  updateUserRoles,
  updateUserStatus,
} from "@src/service/user.service";
import { createInvite } from "@src/service/invite.service";
import { sendInviteEmail } from "@src/service/auth-email";
import { appendAuditEntry } from "@src/service/rbac-audit.service";
import { touchAdministrabilityGuard } from "@src/service/rbac-guard.service";
import { retainsAdministrability } from "@src/lib/rbac/last-admin";
import {
  inviteCreateSchema,
  userDeleteSchema,
  userRolesUpdateSchema,
  userStatusUpdateSchema,
} from "@src/lib/rbac/schemas";
import type { ActionResult } from "@src/service/types";

/**
 * The route as registered in the App Router (`(app)/users/page.tsx`), not a
 * literal URL — `"page"` revalidates it for every locale segment in one call.
 * Mirrors `roles/actions.ts`'s `ROLES_ROUTE`.
 */
const USERS_ROUTE = "/[locale]/users";

function toFieldErrors(error: { flatten: () => { fieldErrors: unknown } }) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

export interface InviteUserResult {
  readonly emailSent: boolean;
  readonly refreshed: boolean;
}

/**
 * Inviting can never REDUCE administrability (it only adds a prospective
 * grantee), so — like `createRoleAction` — this needs no invariant check.
 * It DOES need the registry-derived existence check (spec R7): every
 * `roleId` must resolve to a real `Role`, or the invite is refused with
 * `reason: "not-found"` before anything is written.
 *
 * `createInvite` (service/invite.service.ts) is a Task 6 addition — ICR-127
 * shipped invite ACCEPTANCE only, never a creation path (plan correction,
 * documented on that function).
 *
 * **ICR-128 P1 fix (delivery failure was swallowed):** this used to await
 * `sendInviteEmail` and ignore its `boolean` return, so a transient Resend
 * outage produced a UI that reported success while nobody was actually
 * invited — and, before `createInvite`'s Fix A, that address could then be
 * permanently stuck: re-inviting hit `conflict` because the DB row it wrote
 * was still `"pending"`. `createInvite` no longer returns `conflict` at all
 * (see its doc comment), and this action now inspects `sendInviteEmail`'s
 * result and reports it via `data.emailSent`, so the caller (`invite-dialog.tsx`)
 * can tell the admin the invite was saved but not delivered, and that
 * retrying (which now refreshes instead of conflicting) will work.
 *
 * The action still reports `ok: true` even when `emailSent` is `false` — the
 * `Invite` document is the source of truth and a person can be provisioned
 * once told out of band; a Resend outage must not block provisioning, only
 * be surfaced honestly.
 */
export async function inviteUserAction(
  _prev: ActionResult<InviteUserResult> | undefined,
  formData: FormData,
): Promise<ActionResult<InviteUserResult>> {
  const authz = await requireActionPermission("users:manage");
  if (!authz.ok) return authz;

  const parsed = inviteCreateSchema.safeParse({
    email: formData.get("email"),
    roleIds: formData.getAll("roleIds"),
  });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  // The invitee's `preferredLocale` is seeded from `Invite.locale` (R18) —
  // the inviting admin's own locale is the sensible default here, since
  // there is no other signal for what language the invitee prefers yet.
  const locale = authz.user.preferredLocale;

  const result = await withAdminTransaction(
    async (session): Promise<ActionResult<{ refreshed: boolean }>> => {
      // EVERY read/write below passes { session } — without it the operation
      // runs OUTSIDE the transaction and the existence check reads stale data.
      const roles = await listRoles(session);
      const roleIdSet = new Set(roles.map((r) => r._id.toHexString()));
      const allRolesExist = parsed.data.roleIds.every((id) => roleIdSet.has(id));
      if (!allRolesExist) {
        await session.abortTransaction();
        return { ok: false, reason: "not-found" };
      }

      const created = await createInvite(
        {
          email: parsed.data.email,
          roleIds: parsed.data.roleIds,
          locale,
          invitedByUserId: authz.user._id.toHexString(),
        },
        session,
      );

      await appendAuditEntry(
        {
          actorUserId: authz.user._id.toHexString(),
          actorEmail: authz.user.email,
          action: "user.invite",
          targetId: created.inviteId,
          before: null,
          after: { email: parsed.data.email, roleIds: parsed.data.roleIds },
        },
        session,
      );
      return { ok: true, data: { refreshed: created.refreshed } };
    },
  );

  if (!result.ok) return result;

  revalidatePath(USERS_ROUTE, "page");

  // Deliberately OUTSIDE the transaction: the invite is already durably
  // committed above, so a delivery failure (Resend outage, etc.) must not
  // appear to roll back an otherwise-successful invite — but unlike before,
  // it's no longer swallowed either. `sendInviteEmail` returning `false` and
  // `sendInviteEmail` throwing are both treated as "not delivered": the
  // caller only needs to know whether to tell the admin to retry, not why.
  let emailSent: boolean;
  try {
    emailSent = await sendInviteEmail({
      to: parsed.data.email,
      inviteUrl: `${process.env.NEXT_PUBLIC_ADMIN_BASE_URL}/${locale}/login`,
      locale,
    });
  } catch (error) {
    console.error("[users:invite] failed to send invite email", error);
    emailSent = false;
  }

  return { ok: true, data: { emailSent, refreshed: result.data.refreshed } };
}

/**
 * Reassigns a user's roles. THE privilege-escalation guard: `requireActionPermission`
 * runs before any parsing or DB read, so a session lacking `users:manage`
 * calling this directly with a crafted admin `roleId` is refused as
 * `forbidden` without the payload ever being inspected.
 */
export async function updateUserRolesAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requireActionPermission("users:manage");
  if (!authz.ok) return authz;

  const parsed = userRolesUpdateSchema.safeParse({
    userId: formData.get("userId"),
    roleIds: formData.getAll("roleIds"),
  });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await withAdminTransaction(async (session): Promise<ActionResult> => {
    // See roles/actions.ts's updateRoleAction for the full rationale: bumped
    // first so a concurrent administrability-affecting mutation write-
    // conflicts here rather than both silently committing (write skew).
    await touchAdministrabilityGuard(session);

    // Sequential, not Promise.all — parallelizing reads on one ClientSession
    // inside a transaction is undefined behavior (mongodb.d.ts:2465-2466).
    const roles = await listRoles(session);
    const users = await listUsers(session);

    const target = users.find((u) => u._id.toHexString() === parsed.data.userId);
    if (!target) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    const roleIdSet = new Set(roles.map((r) => r._id.toHexString()));
    const allRolesExist = parsed.data.roleIds.every((id) => roleIdSet.has(id));
    if (!allRolesExist) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    // Proposed post-state: THIS user's roleIds change; every other user
    // (and every role) stays as-is.
    const postState = {
      users: users.map((u) =>
        u._id.toHexString() === parsed.data.userId
          ? { id: parsed.data.userId, status: u.status, roleIds: parsed.data.roleIds }
          : { id: u._id.toHexString(), status: u.status, roleIds: u.roleIds },
      ),
      roles: roles.map((r) => ({ id: r._id.toHexString(), permissions: r.permissions })),
    };
    if (!retainsAdministrability(postState)) {
      await session.abortTransaction();
      return { ok: false, reason: "last-admin" };
    }

    await updateUserRoles(parsed.data.userId, parsed.data.roleIds, session);
    await appendAuditEntry(
      {
        actorUserId: authz.user._id.toHexString(),
        actorEmail: authz.user.email,
        action: "user.roles.update",
        targetId: parsed.data.userId,
        before: { roleIds: target.roleIds },
        after: { roleIds: parsed.data.roleIds },
      },
      session,
    );
    return { ok: true, data: undefined };
  });

  if (result.ok) revalidatePath(USERS_ROUTE, "page");
  return result;
}

/** Enables or disables a user. Disabling the last administrable user is
 * refused by the same invariant every other mutation path shares. */
export async function updateUserStatusAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requireActionPermission("users:manage");
  if (!authz.ok) return authz;

  const parsed = userStatusUpdateSchema.safeParse({
    userId: formData.get("userId"),
    status: formData.get("status"),
  });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await withAdminTransaction(async (session): Promise<ActionResult> => {
    // See updateUserRolesAction's identical comment above.
    await touchAdministrabilityGuard(session);

    const roles = await listRoles(session);
    const users = await listUsers(session);

    const target = users.find((u) => u._id.toHexString() === parsed.data.userId);
    if (!target) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    // Proposed post-state: THIS user's status changes; everything else
    // stays as-is. Enabling can only ever ADD administrability — running the
    // invariant unconditionally keeps this identical to every other
    // mutation's skeleton (Global Constraints) rather than special-casing it.
    const postState = {
      users: users.map((u) =>
        u._id.toHexString() === parsed.data.userId
          ? { id: parsed.data.userId, status: parsed.data.status, roleIds: u.roleIds }
          : { id: u._id.toHexString(), status: u.status, roleIds: u.roleIds },
      ),
      roles: roles.map((r) => ({ id: r._id.toHexString(), permissions: r.permissions })),
    };
    if (!retainsAdministrability(postState)) {
      await session.abortTransaction();
      return { ok: false, reason: "last-admin" };
    }

    await updateUserStatus(parsed.data.userId, parsed.data.status, session);
    await appendAuditEntry(
      {
        actorUserId: authz.user._id.toHexString(),
        actorEmail: authz.user.email,
        action: parsed.data.status === "disabled" ? "user.disable" : "user.enable",
        targetId: parsed.data.userId,
        before: { status: target.status },
        after: { status: parsed.data.status },
      },
      session,
    );
    return { ok: true, data: undefined };
  });

  if (result.ok) revalidatePath(USERS_ROUTE, "page");
  return result;
}

/** Deletes a user. Deleting the last administrable user is refused by the
 * same invariant every other mutation path shares. */
export async function deleteUserAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requireActionPermission("users:manage");
  if (!authz.ok) return authz;

  const parsed = userDeleteSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await withAdminTransaction(async (session): Promise<ActionResult> => {
    // See updateUserRolesAction's identical comment above.
    await touchAdministrabilityGuard(session);

    const roles = await listRoles(session);
    const users = await listUsers(session);

    const target = users.find((u) => u._id.toHexString() === parsed.data.userId);
    if (!target) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    // Proposed post-state: the target user is GONE.
    const postState = {
      users: users
        .filter((u) => u._id.toHexString() !== parsed.data.userId)
        .map((u) => ({ id: u._id.toHexString(), status: u.status, roleIds: u.roleIds })),
      roles: roles.map((r) => ({ id: r._id.toHexString(), permissions: r.permissions })),
    };
    if (!retainsAdministrability(postState)) {
      await session.abortTransaction();
      return { ok: false, reason: "last-admin" };
    }

    await deleteUser(parsed.data.userId, session);
    await appendAuditEntry(
      {
        actorUserId: authz.user._id.toHexString(),
        actorEmail: authz.user.email,
        action: "user.delete",
        targetId: parsed.data.userId,
        before: { email: target.email, roleIds: target.roleIds },
        after: null,
      },
      session,
    );
    return { ok: true, data: undefined };
  });

  if (result.ok) revalidatePath(USERS_ROUTE, "page");
  return result;
}
