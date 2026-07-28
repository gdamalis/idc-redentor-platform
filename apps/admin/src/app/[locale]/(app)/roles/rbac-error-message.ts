import type { ActionFailureReason, ActionResult } from "@src/service/types";

export type RbacErrorMessageKey =
  | "lastAdmin"
  | "systemRole"
  | "forbidden"
  | "invalid"
  | "notFound"
  | "conflict";

/**
 * Maps an `ActionFailureReason` to its `rbac.errors.*` message key. Reasons
 * outside this table (`unauthenticated` / `no-account` / `disabled`) have no
 * dedicated copy here by design — spec §8 lists exactly six `rbac.errors.*`
 * keys. Those three session-level reasons are handled by the page-level
 * redirect (Task 4's `requirePermission` gate), not an inline message on
 * this screen — they should not be reachable through the gated UI at all.
 *
 * A pure, non-"use server" module (deliberately NOT in `actions.ts`, which
 * may only export async functions) so both `role-list.tsx` and
 * `permission-matrix.tsx` share one mapping instead of two copies.
 */
const RBAC_ERROR_MESSAGE_KEYS: Partial<
  Record<ActionFailureReason, RbacErrorMessageKey>
> = {
  "last-admin": "lastAdmin",
  "system-role": "systemRole",
  forbidden: "forbidden",
  invalid: "invalid",
  "not-found": "notFound",
  conflict: "conflict",
};

export function rbacErrorMessageKey(
  result: ActionResult | undefined,
): RbacErrorMessageKey | null {
  if (!result || result.ok) return null;
  return RBAC_ERROR_MESSAGE_KEYS[result.reason] ?? null;
}
