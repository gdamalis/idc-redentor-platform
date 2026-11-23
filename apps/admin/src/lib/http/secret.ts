import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time shared-secret check that FAILS CLOSED on missing/empty
 * configuration (mirrors `apps/web/src/utils/auth/secret.ts`, ICR-136).
 */
export function isAuthorizedSecret(
  candidate: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  if (!candidate) return false;

  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  if (candidateBytes.length !== expectedBytes.length) return false;

  return timingSafeEqual(candidateBytes, expectedBytes);
}

/**
 * Extracts `<token>` from an `Authorization: Bearer <token>` header, or null if
 * absent or malformed. Matches the exact `"Bearer "` prefix.
 */
export function extractBearerToken(header: string | null): string | null {
  const prefix = "Bearer ";
  if (!header?.startsWith(prefix)) return null;

  const token = header.slice(prefix.length);
  return token.length > 0 ? token : null;
}
