import { resolvePermissions } from "./resolve";
import type { PermissionKey } from "./permissions";

/**
 * Holding EITHER of these is admin-equivalent in effect (anyone with one can
 * grant themselves the other), so administrability requires BOTH to survive
 * somewhere — otherwise the panel can reach a state nobody can repair.
 */
export const ADMIN_EQUIVALENT_KEYS = [
  "users:manage",
  "roles:manage",
] as const satisfies readonly PermissionKey[];

export interface AdminStateSnapshot {
  readonly users: readonly {
    readonly id: string;
    readonly status: "active" | "disabled";
    readonly roleIds: readonly string[];
  }[];
  readonly roles: readonly {
    readonly id: string;
    readonly permissions: readonly string[];
  }[];
}

/**
 * THE invariant. Pure, and evaluated against a PROPOSED POST-STATE — which is
 * why one predicate covers all five mutation paths (delete user · disable user ·
 * remove a role from a user · edit the Admin role's permissions · delete a role).
 * A naive "count the admins" check cannot see the matrix path at all.
 */
export function retainsAdministrability(state: AdminStateSnapshot): boolean {
  const rolesById = new Map(state.roles.map((role) => [role.id, role]));

  return state.users.some((user) => {
    if (user.status !== "active") return false;

    const roles = user.roleIds
      .map((id) => rolesById.get(id))
      .filter((role) => role !== undefined);

    const granted = resolvePermissions(roles);
    return ADMIN_EQUIVALENT_KEYS.every((key) => granted.has(key));
  });
}
