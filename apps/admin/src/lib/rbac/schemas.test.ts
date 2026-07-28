import { describe, expect, it } from "vitest";
import {
  inviteCreateSchema,
  roleUpdateSchema,
  userDeleteSchema,
  userStatusUpdateSchema,
} from "./schemas";

const OID = "507f1f77bcf86cd799439011";

describe("roleUpdateSchema", () => {
  it("accepts registry keys", () => {
    const parsed = roleUpdateSchema.safeParse({
      roleId: OID,
      name: "Leader",
      permissions: ["people:read"],
    });
    expect(parsed.success).toBe(true);
  });

  it("REJECTS a permission key absent from the registry", () => {
    for (const bad of ["finances:write", "*", "people:read "]) {
      expect(
        roleUpdateSchema.safeParse({
          roleId: OID,
          name: "X",
          permissions: [bad],
        }).success,
      ).toBe(false);
    }
  });

  it("rejects a malformed roleId", () => {
    expect(
      roleUpdateSchema.safeParse({ roleId: "nope", name: "X", permissions: [] })
        .success,
    ).toBe(false);
  });

  it("silently drops key and isSystem (not updatable)", () => {
    const parsed = roleUpdateSchema.parse({
      roleId: OID,
      name: "X",
      permissions: [],
      key: "admin",
      isSystem: false,
    });
    expect(parsed).not.toHaveProperty("key");
    expect(parsed).not.toHaveProperty("isSystem");
  });

  it("rejects an empty name", () => {
    expect(
      roleUpdateSchema.safeParse({ roleId: OID, name: "   ", permissions: [] })
        .success,
    ).toBe(false);
  });
});

describe("inviteCreateSchema", () => {
  it("normalizes the email to trimmed lowercase", () => {
    expect(
      inviteCreateSchema.parse({ email: "  Ana@IDCR.org ", roleIds: [OID] })
        .email,
    ).toBe("ana@idcr.org");
  });

  it("requires at least one role", () => {
    expect(
      inviteCreateSchema.safeParse({ email: "a@b.co", roleIds: [] }).success,
    ).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(
      inviteCreateSchema.safeParse({ email: "nope", roleIds: [OID] }).success,
    ).toBe(false);
  });
});

describe("userStatusUpdateSchema", () => {
  it("accepts only active/disabled", () => {
    expect(
      userStatusUpdateSchema.safeParse({ userId: OID, status: "active" })
        .success,
    ).toBe(true);
    expect(
      userStatusUpdateSchema.safeParse({ userId: OID, status: "deleted" })
        .success,
    ).toBe(false);
  });
});

describe("userDeleteSchema", () => {
  it("accepts a well-formed ObjectId", () => {
    expect(userDeleteSchema.safeParse({ userId: OID }).success).toBe(true);
  });

  it("rejects a malformed userId", () => {
    expect(userDeleteSchema.safeParse({ userId: "nope" }).success).toBe(false);
  });
});
