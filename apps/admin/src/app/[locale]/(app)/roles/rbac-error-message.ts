import { useTranslations } from "next-intl";
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
 * keys, one per reason a Server Action can still return inline. Those three
 * session-level reasons never reach this mapper: `requireActionPermission`
 * (`lib/rbac/require-action-permission.ts`) redirects on them BEFORE the
 * action does any work — `unauthenticated` to `/login`, `no-account`/`disabled` to
 * `/no-access` — mirroring the RSC page gate (`(app)/layout.tsx`,
 * `roles/page.tsx`). `rbacErrorMessageKey()` only ever has to translate a
 * refusal that already made it back to the client as `{ ok: false }`, which
 * is exactly the six reasons in this table (P2 fix — a prior revision of
 * this comment claimed the three session-level reasons "should not be
 * reachable through the gated UI at all," which was aspirational, not true:
 * nothing enforced it until `requireActionPermission` shipped).
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

// Generic over `T` (the action's success payload) — this only ever inspects
// the `ok: false` branch, which carries `reason`/`fieldErrors` regardless of
// what `T` is, so callers with a non-`undefined` success payload (e.g.
// `inviteUserAction`'s `ActionResult<InviteUserResult>`) don't need a cast.
export function rbacErrorMessageKey<T>(
  result: ActionResult<T> | undefined,
): RbacErrorMessageKey | null {
  if (!result || result.ok) return null;
  return RBAC_ERROR_MESSAGE_KEYS[result.reason] ?? null;
}

/**
 * `notFound`/`conflict` are the only two keys whose shared `rbac.errors.*`
 * copy is role-flavored — "We couldn't find that role. It may have already
 * been deleted." / "A role with that name already exists." — which reads as
 * flatly wrong on `/users`: a concurrently-deleted user (`not-found`) or a
 * duplicate pending invite (`conflict`). `lastAdmin`/`systemRole`/
 * `forbidden`/`invalid` are generic enough to read correctly on both
 * screens, so they stay shared — only these two ever need a context-specific
 * override.
 */
const USERS_CONTEXT_KEYS: ReadonlySet<RbacErrorMessageKey> = new Set([
  "notFound",
  "conflict",
]);

/**
 * The `/users` screens' variant of the shared `rbacErrorMessageKey()`
 * lookup (P2 fix): resolves `notFound`/`conflict` from `users.errors.*`
 * instead of `rbac.errors.*`, while every other reason still resolves from
 * the shared `rbac.errors.*` catalog — ONE key→reason mapping
 * (`RBAC_ERROR_MESSAGE_KEYS` above) stays authoritative; only the
 * *namespace* a caller reads from is parameterized. `role-list.tsx`/
 * `permission-matrix.tsx` (the `/roles` screens) don't need this — they
 * keep calling `rbacErrorMessageKey()` plus their own `rbac.errors`
 * translator directly, unchanged.
 */
export function useUsersRbacErrorMessage<T>(
  result: ActionResult<T> | undefined,
): string | null {
  const tErrors = useTranslations("rbac.errors");
  const tUsersErrors = useTranslations("users.errors");
  const key = rbacErrorMessageKey(result);
  if (!key) return null;
  return USERS_CONTEXT_KEYS.has(key) ? tUsersErrors(key) : tErrors(key);
}
