import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time shared-secret check that FAILS CLOSED on missing configuration (ICR-136).
 *
 * The `!expected` guard is the fix: the previous `authHeader !== `Bearer ${process.env.CRON_SECRET}``
 * interpolated an unset variable into the literal string "Bearer undefined", which any caller could
 * then send to authenticate. An unset — or empty — secret must authenticate nobody.
 *
 * Requires the Node.js runtime (`node:crypto`). Every caller is a Node route handler; Next's App
 * Router defaults route handlers to the Node runtime and none of them opts into edge.
 */
export function isAuthorizedSecret(
  candidate: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  if (!candidate) return false;

  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  // `timingSafeEqual` throws on unequal lengths, so the length must be checked first. This leaks
  // the secret's LENGTH — the accepted tradeoff of every timing-safe comparison.
  if (candidateBytes.length !== expectedBytes.length) return false;

  return timingSafeEqual(candidateBytes, expectedBytes);
}

/**
 * Extracts `<token>` from an `Authorization: Bearer <token>` header, or null if absent/malformed.
 *
 * The `"Bearer "` prefix is matched exactly (capital B, single space), preserving the behaviour the
 * pre-ICR-136 template literal implied. RFC 7235 makes the scheme case-insensitive; loosening it is
 * deliberately out of scope.
 */
export function extractBearerToken(header: string | null): string | null {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return null;

  const token = header.slice(prefix.length);
  return token.length > 0 ? token : null;
}
