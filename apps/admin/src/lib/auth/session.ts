import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdminAuth } from "@src/lib/firebase/admin";

/**
 * Name of the native Firebase session cookie. `__session` is the
 * Firebase-Hosting-safe convention (the only cookie name Firebase Hosting's
 * CDN forwards to the origin uncached), and we keep it even off Firebase
 * Hosting for consistency with the Admin SDK docs/examples.
 */
export const SESSION_COOKIE_NAME = "__session";

/**
 * 5 days, in milliseconds — inside the Admin SDK's allowed session-cookie
 * range (min 5 minutes, max 2 weeks; `SessionCookieOptions.expiresIn`).
 */
export const SESSION_EXPIRES_IN_MS = 5 * 24 * 60 * 60 * 1000;

interface SessionCookieAttributes {
  httpOnly: true;
  secure: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

/**
 * Single source of truth for the cookie attribute object — used to both SET
 * (`POST`) and CLEAR (`DELETE`, with `maxAge: 0`) the session cookie, and
 * unit-assertable in isolation.
 */
export function buildSessionCookieOptions(): SessionCookieAttributes {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_EXPIRES_IN_MS / 1000,
  } satisfies SessionCookieAttributes;
}

/** Exchanges a verified Firebase ID token for a session cookie value. */
export async function createSession(idToken: string): Promise<string> {
  return getAdminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_EXPIRES_IN_MS,
  });
}

/**
 * Verifies a session cookie, returning `null` (never throwing) on failure —
 * every auth outcome in this app is a return value, not thrown control flow.
 */
export async function verifySession(
  cookie: string,
  checkRevoked: boolean,
): Promise<DecodedIdToken | null> {
  try {
    return await getAdminAuth().verifySessionCookie(cookie, checkRevoked);
  } catch {
    return null;
  }
}
