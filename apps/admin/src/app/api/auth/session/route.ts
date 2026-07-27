import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "@src/lib/firebase/admin";
import {
  SESSION_COOKIE_NAME,
  buildSessionCookieOptions,
  createSession,
  verifySession,
} from "@src/lib/auth/session";
import { resolveOrProvision } from "@src/lib/auth/provision";

// Reject an ID token whose sign-in event (`auth_time`) is older than this —
// the exchange only accepts a *fresh* sign-in, not a stale cached token.
const STALE_TOKEN_MAX_AGE_SECONDS = 300;

const bodySchema = z.object({ idToken: z.string().min(1) });

/**
 * Exchanges a fresh Firebase ID token for a native httpOnly session cookie
 * (spec §2 R2). Every outcome is a typed JSON response — never thrown
 * control flow:
 *
 * - `400` — malformed body.
 * - `401 invalid-token` — the ID token itself doesn't verify.
 * - `401 stale-token` — verifies, but the sign-in event is > 5 min old.
 * - `409 { reason: "provisioning-conflict" }` — verified + recent, but
 *   `resolveOrProvision` could not prove `no-invite` (a concurrent claim
 *   still mid-provision, or a create failure). Transient — retry — never a
 *   reason to destroy the client's Firebase credential. No cookie is set.
 * - `403 { reason }` — verified + recent, but `resolveOrProvision` refused
 *   for a PROVABLE reason (`no-invite` or `disabled` or `email-unverified`).
 *   No cookie is set either way.
 * - `200 { ok: true, preferredLocale }` + `Set-Cookie` — success.
 */
export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: "invalid-body" }, { status: 400 });
  }

  const { idToken } = parsed.data;

  let decoded: DecodedIdToken;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid-token" }, { status: 401 });
  }

  const tokenAgeSeconds = Date.now() / 1000 - decoded.auth_time;
  if (tokenAgeSeconds > STALE_TOKEN_MAX_AGE_SECONDS) {
    return NextResponse.json({ ok: false, reason: "stale-token" }, { status: 401 });
  }

  const result = await resolveOrProvision(decoded);
  if (!result.ok) {
    // `provisioning-conflict` is a transient/ambiguous outcome — semantically
    // a 409 Conflict, not a 403 Forbidden — so the client never treats it
    // like a provable refusal (see `resolveOrProvision`'s doc comment).
    const status = result.reason === "provisioning-conflict" ? 409 : 403;
    return NextResponse.json({ ok: false, reason: result.reason }, { status });
  }

  const sessionCookie = await createSession(idToken);
  const response = NextResponse.json({
    ok: true,
    preferredLocale: result.user.preferredLocale,
  });
  response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, buildSessionCookieOptions());
  return response;
}

/**
 * Signs out (spec §2 R3): best-effort `revokeRefreshTokens` on a valid
 * cookie, then **always** clears the cookie (`maxAge: 0`, same name/path).
 * Idempotent — returns `200 { ok: true }` even with no/invalid cookie.
 */
export async function DELETE(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (cookie) {
    const decoded = await verifySession(cookie, false);
    if (decoded) {
      try {
        await getAdminAuth().revokeRefreshTokens(decoded.uid);
      } catch {
        // Best-effort: sign-out must still succeed if the revoke call fails.
      }
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...buildSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
