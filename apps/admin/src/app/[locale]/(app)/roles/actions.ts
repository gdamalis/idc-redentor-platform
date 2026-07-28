"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@src/lib/rbac/require-permission";
import { withAdminTransaction } from "@src/service/database.service";
import {
  createRole,
  deleteRole,
  listRoles,
  updateRole,
} from "@src/service/role.service";
import { listUsers } from "@src/service/user.service";
import { appendAuditEntry } from "@src/service/rbac-audit.service";
import { touchAdministrabilityGuard } from "@src/service/rbac-guard.service";
import {
  ADMIN_EQUIVALENT_KEYS,
  retainsAdministrability,
} from "@src/lib/rbac/last-admin";
import {
  roleCreateSchema,
  roleDeleteSchema,
  roleUpdateSchema,
} from "@src/lib/rbac/schemas";
import type { ActionResult } from "@src/service/types";

/**
 * The route as registered in the App Router (`(app)/roles/page.tsx`), not a
 * literal URL — `"page"` revalidates it for every locale segment in one call.
 */
const ROLES_ROUTE = "/[locale]/roles";

// NOTE: a "use server" module may only export async functions, so the
// `rbacErrorMessageKey()` mapping the two client components share lives in
// `rbac-error-message.ts` alongside this file instead of here.

function toFieldErrors(error: { flatten: () => { fieldErrors: unknown } }) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

/**
 * Adding a role can never REDUCE administrability (it only adds a new
 * permission grantee), so — unlike update/delete — this needs no invariant
 * check. Mirrors the plan's note for `inviteUserAction` (Task 6).
 */
export async function createRoleAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requirePermission("roles:manage");
  if (!authz.ok) return { ok: false, reason: authz.reason };

  const parsed = roleCreateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    permissions: formData.getAll("permissions"),
  });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await withAdminTransaction(async (session): Promise<ActionResult> => {
    const created = await createRole(parsed.data, session);
    if (!created.ok) {
      // Nothing was written (the insert itself failed) — abort is a documented
      // no-op here, kept for consistency with every other refusal branch.
      await session.abortTransaction();
      return { ok: false, reason: created.reason };
    }

    await appendAuditEntry(
      {
        actorUserId: authz.user._id.toHexString(),
        actorEmail: authz.user.email,
        action: "role.create",
        targetId: created.roleId,
        before: null,
        after: { name: parsed.data.name, permissions: parsed.data.permissions },
      },
      session,
    );
    return { ok: true, data: undefined };
  });

  if (result.ok) revalidatePath(ROLES_ROUTE, "page");
  return result;
}

export async function updateRoleAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requirePermission("roles:manage");
  if (!authz.ok) return { ok: false, reason: authz.reason };

  const parsed = roleUpdateSchema.safeParse({
    roleId: formData.get("roleId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    permissions: formData.getAll("permissions"),
  });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await withAdminTransaction(async (session): Promise<ActionResult> => {
    // Bumps a shared guard document FIRST, before any read below — this is
    // what forces a write conflict (and a driver retry, re-reading committed
    // state) between two concurrent administrability-affecting mutations.
    // MongoDB transactions are snapshot-isolated, not serializable: without
    // this, two concurrent edits touching DIFFERENT role/user documents
    // could both read "administrability survives" and both commit, leaving
    // zero administrable users (write skew) — see admin-rbac.md.
    await touchAdministrabilityGuard(session);

    // EVERY read/write below passes { session } — without it the operation
    // runs OUTSIDE the transaction and the invariant check below would read
    // stale data (Global Constraints, transaction rules). Sequential, not
    // Promise.all: parallelizing reads on one ClientSession inside a
    // transaction is undefined behavior (mongodb.d.ts:2465-2466).
    const roles = await listRoles(session);
    const users = await listUsers(session);

    const target = roles.find((r) => r._id.toHexString() === parsed.data.roleId);
    if (!target) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }

    // The Admin role's admin-equivalent keys are PINNED: force-union them
    // into whatever was submitted BEFORE the guard below runs. A disabled
    // `<input type="checkbox">` is never submitted in FormData — the client
    // mirrors these two keys with a hidden input (permission-matrix.tsx) so
    // a legitimate save never actually omits them, but the SERVER must not
    // depend on that: any submission that omits one (or both) — whether a
    // browser quirk or a crafted payload — is corrected here, not refused.
    const permissions =
      target.key === "admin"
        ? Array.from(new Set([...parsed.data.permissions, ...ADMIN_EQUIVALENT_KEYS]))
        : parsed.data.permissions;

    // Defense-in-depth, not the primary gate anymore: after the union above
    // this can never actually be false for `target.key === "admin"` — kept
    // as a guard against the union logic itself regressing, and because
    // `ADMIN_EQUIVALENT_KEYS.every` here is exactly what's exercised by
    // mutation testing (admin-rbac.md).
    if (target.key === "admin") {
      const keeps = ADMIN_EQUIVALENT_KEYS.every((key) => permissions.includes(key));
      if (!keeps) {
        await session.abortTransaction();
        return { ok: false, reason: "system-role" };
      }
    }

    // Build the PROPOSED POST-STATE and assert the invariant against it
    // BEFORE writing anything.
    const postState = {
      users: users.map((u) => ({
        id: u._id.toHexString(),
        status: u.status,
        roleIds: u.roleIds,
      })),
      roles: roles.map((r) =>
        r._id.toHexString() === parsed.data.roleId
          ? { id: parsed.data.roleId, permissions }
          : { id: r._id.toHexString(), permissions: r.permissions },
      ),
    };
    if (!retainsAdministrability(postState)) {
      // Manual abort does NOT throw (mongodb.d.ts:2475) — this is the
      // sanctioned functional-first refusal path.
      await session.abortTransaction();
      return { ok: false, reason: "last-admin" };
    }

    await updateRole({ ...parsed.data, permissions }, session);
    await appendAuditEntry(
      {
        actorUserId: authz.user._id.toHexString(),
        actorEmail: authz.user.email,
        action: "role.update",
        targetId: parsed.data.roleId,
        before: { name: target.name, permissions: target.permissions },
        after: { name: parsed.data.name, permissions },
      },
      session,
    );
    return { ok: true, data: undefined };
  });

  if (result.ok) revalidatePath(ROLES_ROUTE, "page");
  return result;
}

export async function deleteRoleAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requirePermission("roles:manage");
  if (!authz.ok) return { ok: false, reason: authz.reason };

  const parsed = roleDeleteSchema.safeParse({ roleId: formData.get("roleId") });
  if (!parsed.success) {
    return { ok: false, reason: "invalid", fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await withAdminTransaction(async (session): Promise<ActionResult> => {
    // See updateRoleAction's identical comment: touched first, so a
    // concurrent administrability-affecting mutation write-conflicts here.
    await touchAdministrabilityGuard(session);

    // Sequential, not Promise.all — see updateRoleAction.
    const roles = await listRoles(session);
    const users = await listUsers(session);

    const target = roles.find((r) => r._id.toHexString() === parsed.data.roleId);
    if (!target) {
      await session.abortTransaction();
      return { ok: false, reason: "not-found" };
    }
    if (target.isSystem) {
      await session.abortTransaction();
      return { ok: false, reason: "system-role" };
    }

    // Proposed post-state: the target role is GONE. Covers edge case 8 — a
    // custom role that happens to be the last source of admin-equivalent
    // permissions cannot be deleted either.
    const postState = {
      users: users.map((u) => ({
        id: u._id.toHexString(),
        status: u.status,
        roleIds: u.roleIds,
      })),
      roles: roles
        .filter((r) => r._id.toHexString() !== parsed.data.roleId)
        .map((r) => ({ id: r._id.toHexString(), permissions: r.permissions })),
    };
    if (!retainsAdministrability(postState)) {
      await session.abortTransaction();
      return { ok: false, reason: "last-admin" };
    }

    await deleteRole(parsed.data.roleId, session);
    await appendAuditEntry(
      {
        actorUserId: authz.user._id.toHexString(),
        actorEmail: authz.user.email,
        action: "role.delete",
        targetId: parsed.data.roleId,
        before: { name: target.name, permissions: target.permissions },
        after: null,
      },
      session,
    );
    return { ok: true, data: undefined };
  });

  if (result.ok) revalidatePath(ROLES_ROUTE, "page");
  return result;
}
