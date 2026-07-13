import { describe, expect, it } from "vitest";

import { extractBearerToken, isAuthorizedSecret } from "./secret";

const SECRET = "s3cret-cron-value";

describe("isAuthorizedSecret", () => {
  // --- The ICR-136 vulnerability: unset config must authenticate NOBODY. ---
  it("rejects the literal string 'undefined' when the expected secret is unset", () => {
    expect(isAuthorizedSecret("undefined", undefined)).toBe(false);
  });

  it("rejects every candidate when the expected secret is unset", () => {
    for (const candidate of ["undefined", "null", "", "anything", SECRET]) {
      expect(isAuthorizedSecret(candidate, undefined)).toBe(false);
    }
    expect(isAuthorizedSecret(null, undefined)).toBe(false);
    expect(isAuthorizedSecret(undefined, undefined)).toBe(false);
  });

  it("treats an empty-string expected secret as unset (misconfiguration, not a credential)", () => {
    expect(isAuthorizedSecret("", "")).toBe(false);
    expect(isAuthorizedSecret("anything", "")).toBe(false);
  });

  // --- Normal comparison, secret configured. ---
  it("accepts an exact match", () => {
    expect(isAuthorizedSecret(SECRET, SECRET)).toBe(true);
  });

  it("rejects a missing candidate", () => {
    expect(isAuthorizedSecret(null, SECRET)).toBe(false);
    expect(isAuthorizedSecret(undefined, SECRET)).toBe(false);
    expect(isAuthorizedSecret("", SECRET)).toBe(false);
  });

  it("rejects a same-length mismatch", () => {
    const sameLength = "S3CRET-CRON-VALUE";
    expect(sameLength).toHaveLength(SECRET.length);
    expect(isAuthorizedSecret(sameLength, SECRET)).toBe(false);
  });

  it("rejects a prefix of the secret without throwing (timingSafeEqual needs equal lengths)", () => {
    expect(() => isAuthorizedSecret("s3cret", SECRET)).not.toThrow();
    expect(isAuthorizedSecret("s3cret", SECRET)).toBe(false);
  });

  it("rejects a longer candidate that starts with the secret", () => {
    expect(isAuthorizedSecret(`${SECRET}-extra`, SECRET)).toBe(false);
  });

  it("compares multi-byte UTF-8 by bytes without throwing", () => {
    expect(isAuthorizedSecret("clavé-ñ", "clavé-ñ")).toBe(true);
    expect(isAuthorizedSecret("clave-n", "clavé-ñ")).toBe(false);
  });
});

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed header", () => {
    expect(extractBearerToken(`Bearer ${SECRET}`)).toBe(SECRET);
  });

  it("returns null for a missing header", () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it("returns null for a malformed header", () => {
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken(`Bearer${SECRET}`)).toBeNull();
    expect(extractBearerToken(SECRET)).toBeNull();
  });

  it("requires the exact 'Bearer ' scheme prefix (matches the pre-fix behaviour)", () => {
    expect(extractBearerToken(`bearer ${SECRET}`)).toBeNull();
    expect(extractBearerToken(`BEARER ${SECRET}`)).toBeNull();
  });

  // The end-to-end shape of the bug: an unset CRON_SECRET + this header used to authenticate.
  it("yields a token that does NOT authenticate against an unset secret", () => {
    const token = extractBearerToken("Bearer undefined");
    expect(token).toBe("undefined");
    expect(isAuthorizedSecret(token, undefined)).toBe(false);
  });
});
