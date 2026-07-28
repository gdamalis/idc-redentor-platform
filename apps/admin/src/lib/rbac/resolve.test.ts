import { describe, expect, it } from "vitest";
import { hasPermission, resolvePermissions } from "./resolve";

describe("resolvePermissions", () => {
  it("unions permissions across roles", () => {
    const granted = resolvePermissions([
      { permissions: ["people:read"] },
      { permissions: ["calendar:read"] },
    ]);
    expect([...granted].sort()).toEqual(["calendar:read", "people:read"]);
  });

  it("dedupes overlapping permissions", () => {
    const granted = resolvePermissions([
      { permissions: ["people:read"] },
      { permissions: ["people:read"] },
    ]);
    expect(granted.size).toBe(1);
  });

  it("IGNORES stored keys absent from the registry (fail-closed on drift)", () => {
    const granted = resolvePermissions([
      { permissions: ["people:read", "finances:write", "*", "toString"] },
    ]);
    expect([...granted]).toEqual(["people:read"]);
  });

  it("returns an empty set for no roles", () => {
    expect(resolvePermissions([]).size).toBe(0);
  });
});

describe("hasPermission", () => {
  it("is true only for a granted key", () => {
    const granted = resolvePermissions([{ permissions: ["people:read"] }]);
    expect(hasPermission(granted, "people:read")).toBe(true);
    expect(hasPermission(granted, "people:write")).toBe(false);
  });
});
