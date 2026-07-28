import { isPermissionKey } from "./permissions";
import type { PermissionKey } from "./permissions";

/** Only the field this function needs — keeps it usable with post-state snapshots. */
export interface PermissionSource {
  readonly permissions: readonly string[];
}

/**
 * Pure. Union of every role's permissions, FILTERED through the registry: a key
 * that is stored but no longer registered (renamed/removed feature) grants
 * nothing. Read-side twin of the write-side `z.enum(PERMISSION_KEYS)` guard —
 * reject at write, ignore at read.
 */
export function resolvePermissions(
  roles: readonly PermissionSource[],
): ReadonlySet<PermissionKey> {
  const granted = new Set<PermissionKey>();
  for (const role of roles) {
    for (const key of role.permissions) {
      if (isPermissionKey(key)) granted.add(key);
    }
  }
  return granted;
}

export function hasPermission(
  granted: ReadonlySet<PermissionKey>,
  key: PermissionKey,
): boolean {
  return granted.has(key);
}
