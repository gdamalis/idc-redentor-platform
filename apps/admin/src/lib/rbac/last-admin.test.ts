import { describe, expect, it } from "vitest";
import { retainsAdministrability } from "./last-admin";
import type { AdminStateSnapshot } from "./last-admin";

const ADMIN_ROLE = {
  id: "r-admin",
  permissions: ["users:manage", "roles:manage"],
};
const LEADER_ROLE = {
  id: "r-leader",
  permissions: ["people:read", "people:write"],
};

const base = (over: Partial<AdminStateSnapshot> = {}): AdminStateSnapshot => ({
  users: [{ id: "u1", status: "active", roleIds: ["r-admin"] }],
  roles: [ADMIN_ROLE, LEADER_ROLE],
  ...over,
});

describe("retainsAdministrability", () => {
  it("holds with one active admin", () => {
    expect(retainsAdministrability(base())).toBe(true);
  });

  // --- path 1: delete the last admin user
  it("fails when the last admin user is removed", () => {
    expect(retainsAdministrability(base({ users: [] }))).toBe(false);
  });

  // --- path 2: disable the last admin user
  it("fails when the last admin user is disabled", () => {
    expect(
      retainsAdministrability(
        base({
          users: [{ id: "u1", status: "disabled", roleIds: ["r-admin"] }],
        }),
      ),
    ).toBe(false);
  });

  // --- path 3: remove the Admin role from the last admin user
  it("fails when the last admin user loses the admin role", () => {
    expect(
      retainsAdministrability(
        base({
          users: [{ id: "u1", status: "active", roleIds: ["r-leader"] }],
        }),
      ),
    ).toBe(false);
  });

  // --- path 4: uncheck users:manage/roles:manage on the Admin ROLE (the matrix path)
  it("fails when the admin role loses roles:manage", () => {
    expect(
      retainsAdministrability(
        base({
          roles: [
            { id: "r-admin", permissions: ["users:manage"] },
            LEADER_ROLE,
          ],
        }),
      ),
    ).toBe(false);
  });

  // --- path 5: delete the Admin role entirely
  it("fails when the admin role is deleted", () => {
    expect(retainsAdministrability(base({ roles: [LEADER_ROLE] }))).toBe(false);
  });

  // --- boundaries
  it("requires BOTH keys, not either", () => {
    expect(
      retainsAdministrability(
        base({
          roles: [{ id: "r-admin", permissions: ["users:manage"] }],
        }),
      ),
    ).toBe(false);
  });

  it("holds when the two keys come from two DIFFERENT roles combined", () => {
    expect(
      retainsAdministrability({
        users: [{ id: "u1", status: "active", roleIds: ["r-a", "r-b"] }],
        roles: [
          { id: "r-a", permissions: ["users:manage"] },
          { id: "r-b", permissions: ["roles:manage"] },
        ],
      }),
    ).toBe(true);
  });

  it("holds when a second active admin remains", () => {
    expect(
      retainsAdministrability(
        base({
          users: [
            { id: "u1", status: "disabled", roleIds: ["r-admin"] },
            { id: "u2", status: "active", roleIds: ["r-admin"] },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("ignores dangling roleIds that reference a deleted role", () => {
    expect(
      retainsAdministrability(
        base({
          users: [
            { id: "u1", status: "active", roleIds: ["r-admin", "r-ghost"] },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("ignores unregistered stored keys when deciding administrability", () => {
    expect(
      retainsAdministrability({
        users: [{ id: "u1", status: "active", roleIds: ["r-x"] }],
        roles: [
          {
            id: "r-x",
            permissions: ["users:manage", "roles:manage", "bogus:key"],
          },
        ],
      }),
    ).toBe(true);
  });

  it("fails on an empty system", () => {
    expect(retainsAdministrability({ users: [], roles: [] })).toBe(false);
  });
});
