// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractBearerToken, isAuthorizedSecret } from "./secret";

describe("isAuthorizedSecret", () => {
  it("fails closed when expected secret is undefined or empty", () => {
    expect(isAuthorizedSecret("anything", undefined)).toBe(false);
    expect(isAuthorizedSecret("anything", "")).toBe(false);
    expect(isAuthorizedSecret("undefined", undefined)).toBe(false);
    expect(isAuthorizedSecret("", "")).toBe(false);
  });

  it("rejects missing, empty, mismatched, or different-length candidates", () => {
    expect(isAuthorizedSecret(null, "top-secret-123")).toBe(false);
    expect(isAuthorizedSecret(undefined, "top-secret-123")).toBe(false);
    expect(isAuthorizedSecret("", "top-secret-123")).toBe(false);
    expect(isAuthorizedSecret("top-secret-124", "top-secret-123")).toBe(false);
    expect(isAuthorizedSecret("short", "top-secret-123")).toBe(false);
  });

  it("returns true for an exact byte match", () => {
    expect(isAuthorizedSecret("top-secret-123", "top-secret-123")).toBe(true);
  });
});

describe("extractBearerToken", () => {
  it("extracts the token from a valid Bearer header", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("returns null on absent, empty, or malformed headers", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken("bearer abc123")).toBeNull();
    expect(extractBearerToken("Basic abc123")).toBeNull();
  });
});
