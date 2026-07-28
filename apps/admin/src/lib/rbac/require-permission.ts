import { cache } from "react";
import { getCurrentUser } from "@src/lib/auth/current-user";
import { findRolesByIds } from "@src/service/role.service";
import { resolvePermissions } from "./resolve";
import type { PermissionKey } from "./permissions";
import type { AdminUser } from "@src/service/types";

export type DeniedReason =
  | "unauthenticated" // no/expired/revoked cookie, or an unprovisionable session
  | "no-account" // valid session, no Mongo AdminUser
  | "disabled" // AdminUser.status === "disabled"
  | "forbidden"; // authenticated + provisioned, but lacks the key

export interface Authorized {
  readonly ok: true;
  readonly user: AdminUser;
  readonly permissions: ReadonlySet<PermissionKey>;
}
export interface Refused {
  readonly ok: false;
  readonly reason: DeniedReason;
}

/**
 * `cache()` scopes memoization to ONE React request, so the (app) layout, the
 * page, and any Server Action in that request share a single Mongo resolve —
 * which is what makes per-page permission checks cheap enough to put everywhere.
 *
 * Permissions are re-resolved on EVERY request and never cached in the session
 * cookie: that is precisely what makes mid-session revocation take effect on
 * the next request with no sign-out.
 */
export const getSessionPermissions = cache(
  async (): Promise<Authorized | Refused> => {
    const session = await getCurrentUser();

    if (!session.ok) {
      switch (session.reason) {
        case "no-user":
          return { ok: false, reason: "no-account" };
        case "disabled":
          return { ok: false, reason: "disabled" };
        case "no-session":
        case "expired":
        case "revoked":
        case "no-invite":
        case "email-unverified":
        case "provisioning-conflict":
          return { ok: false, reason: "unauthenticated" };
      }
    }

    const roles = await findRolesByIds(session.user.roleIds);
    return {
      ok: true,
      user: session.user,
      permissions: resolvePermissions(roles),
    };
  },
);

/** Never throws. Callers branch on the result.
 *
 * RSC pages/layouts call this directly and do their OWN redirect (each
 * already has a `locale` from its route `params` — see `roles/page.tsx`,
 * `(app)/layout.tsx`). A `"use server"` Server Action has no route params,
 * and — unlike a page render — a silent `{ ok: false }` on a session-level
 * refusal is a real bug, not just a missing redirect (spec edge case #14):
 * Server Actions should call `requireActionPermission`
 * (`require-action-permission.ts`) instead, which wraps this and redirects
 * on `unauthenticated`/`no-account`/`disabled` itself.
 */
export async function requirePermission(
  key: PermissionKey,
): Promise<Authorized | Refused> {
  const result = await getSessionPermissions();
  if (!result.ok) return result;
  if (!result.permissions.has(key)) return { ok: false, reason: "forbidden" };
  return result;
}
