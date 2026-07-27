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
 */
export async function getCurrentUser(): Promise<SessionResult> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return { ok: false, reason: "no-session" };

  const decoded = await verifySession(cookie, true);
  if (!decoded) return { ok: false, reason: "expired" };

  const user = await findUserByFirebaseUid(decoded.uid);
  if (!user) return { ok: false, reason: "no-user" };
  if (user.status === "disabled") return { ok: false, reason: "disabled" };

  return { ok: true, user };
}
