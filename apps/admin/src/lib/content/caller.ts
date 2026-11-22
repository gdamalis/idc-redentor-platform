import type { PermissionKey } from "@src/lib/rbac/permissions";
import type { Authorized } from "@src/lib/rbac/require-permission";

export interface UserContentCaller {
  readonly kind: "user";
  readonly userId: string;
  readonly email: string;
  readonly displayName?: string;
  readonly permissions: ReadonlySet<PermissionKey>;
}

/**
 * Service-identity caller for non-interactive writers (e.g. `ICR-204` predica
 * ingest endpoint or `ICR-200` PDF worker). Carries an explicitly scoped
 * permission set so a draft-only service can never publish.
 */
export interface ServiceContentCaller {
  readonly kind: "service";
  readonly serviceId: string;
  readonly label: string;
  readonly permissions: ReadonlySet<PermissionKey>;
}

export type ContentCaller = UserContentCaller | ServiceContentCaller;

export interface ContentActor {
  readonly id: string;
  readonly label: string;
  readonly kind: "user" | "service";
}

export function callerFromAuthorized(authz: Authorized): UserContentCaller {
  return {
    kind: "user",
    userId: authz.user._id.toHexString(),
    email: authz.user.email,
    ...(authz.user.displayName !== undefined && {
      displayName: authz.user.displayName,
    }),
    permissions: authz.permissions,
  };
}

export function getCallerActor(caller: ContentCaller): ContentActor {
  if (caller.kind === "user") {
    return {
      id: caller.userId,
      label: caller.displayName?.trim() || caller.email,
      kind: "user",
    };
  }
  return {
    id: caller.serviceId,
    label: caller.label,
    kind: "service",
  };
}

export function hasPermission(
  caller: ContentCaller,
  key: PermissionKey,
): boolean {
  return caller.permissions.has(key);
}

export function hasAnyPermission(
  caller: ContentCaller,
  keys: readonly PermissionKey[],
): boolean {
  return keys.some((key) => caller.permissions.has(key));
}
