import { describe, expect, it } from "vitest";
import { PERMISSIONS, PERMISSION_KEYS, isPermissionKey } from "./permissions";

describe("PERMISSIONS registry", () => {
  it("contains exactly the 15 M1b keys", () => {
    expect(PERMISSION_KEYS).toHaveLength(15);
    expect([...PERMISSION_KEYS].sort()).toEqual(
      [
        "activities:delete",
        "activities:read",
        "activities:write",
        "calendar:print",
        "calendar:read",
        "families:read",
        "families:write",
        "people:delete",
        "people:pii",
        "people:read",
        "people:write",
        "roles:manage",
        "roles:read",
        "users:manage",
        "users:read",
      ].sort(),
    );
  });

  it("every key is resource:action shaped", () => {
    for (const key of PERMISSION_KEYS) expect(key).toMatch(/^[a-z]+:[a-z]+$/);
  });

  it("isPermissionKey accepts registry keys and rejects everything else", () => {
    expect(isPermissionKey("people:read")).toBe(true);
    expect(isPermissionKey("finances:write")).toBe(false);
    expect(isPermissionKey("*")).toBe(false);
    expect(isPermissionKey("toString")).toBe(false); // prototype-pollution guard
    expect(isPermissionKey(null)).toBe(false);
    expect(isPermissionKey(42)).toBe(false);
  });

  it("PERMISSIONS values are non-empty dev-facing fallbacks", () => {
    for (const key of PERMISSION_KEYS)
      expect(PERMISSIONS[key].length).toBeGreaterThan(0);
  });
});
