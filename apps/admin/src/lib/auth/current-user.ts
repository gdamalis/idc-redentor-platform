import { cache } from "react";
import { cookies } from "next/headers";
import { findUserByFirebaseUid } from "@src/service/user.service";
import type { SessionResult } from "@src/service/types";
import { SESSION_COOKIE_NAME, verifySession } from "./session";

/**
 * The authoritative server-side session resolver (spec §2 R6). Reads the
 * `__session` cookie and verifies it with `checkRevoked: true` — this is the
 * path that pays the extra network hop, unlike the proxy's fast local check
 * (`verifySession(cookie, false)` there) — because this is the RSC gate of
 * record, not a convenience redirect.
 *
 * `roleIds`/`preferredLocale` are resolved from the matching Mongo `User`
 * only — this function never reads any role/claims data off the decoded
 * token itself. There is no token-based authorization read path in this app.
 *
 * `cache()`-memoized (P2 fix, same reasoning as `require-permission.ts`'s
 * `getSessionPermissions`, which calls this): `(app)/layout.tsx` calls this
 * directly AND `getSessionPermissions()` calls it again for the same
 * request, and before this fix those two calls did not share work — each
 * paid its own `verifySession(cookie, true)` Firebase Admin network
 * round-trip (`checkRevoked: true`) plus its own Mongo
 * `findUserByFirebaseUid`, doubling both on every authenticated page render.
 * `cache()` scopes memoization to ONE React request, so this stays safe: no
 * cross-request staleness, and permissions are still re-resolved from Mongo
 * on every new request (the mid-session revocation guarantee — see
 * `docs/architecture/admin-rbac.md` — is unaffected, since it was never
 * about *this* function returning stale data across requests, only about not
 * caching the result *in* the session cookie).
 */
export const getCurrentUser = cache(async (): Promise<SessionResult> => {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return { ok: false, reason: "no-session" };

  const decoded = await verifySession(cookie, true);
  if (!decoded) return { ok: false, reason: "expired" };

  const user = await findUserByFirebaseUid(decoded.uid);
  if (!user) return { ok: false, reason: "no-user" };
  if (user.status === "disabled") return { ok: false, reason: "disabled" };

  return { ok: true, user };
});
