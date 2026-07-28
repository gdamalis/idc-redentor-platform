import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermission = vi.fn();
vi.mock("@src/lib/rbac/require-permission", () => ({ requirePermission }));

const abortTransaction = vi.fn();
const session = { abortTransaction };
const withAdminTransaction = vi.fn((fn: (s: typeof session) => Promise<unknown>) =>
  fn(session),
);
vi.mock("@src/service/database.service", () => ({ withAdminTransaction }));

const listRoles = vi.fn();
const createRole = vi.fn();
const updateRole = vi.fn();
const deleteRole = vi.fn();
vi.mock("@src/service/role.service", () => ({
  listRoles,
  createRole,
  updateRole,
  deleteRole,
}));

const listUsers = vi.fn();
vi.mock("@src/service/user.service", () => ({ listUsers }));

const appendAuditEntry = vi.fn();
vi.mock("@src/service/rbac-audit.service", () => ({ appendAuditEntry }));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

async function loadActions() {
  vi.resetModules();
  return import("./actions");
}

beforeEach(() => vi.clearAllMocks());

const ACTOR = { _id: { toHexString: () => "507f1f77bcf86cd799439001" }, email: "actor@idcr.org" };
const AUTHORIZED = { ok: true as const, user: ACTOR, permissions: new Set(["roles:manage"]) };
const FORBIDDEN = { ok: false as const, reason: "forbidden" as const };

// Real 24-hex-char ids — `roleUpdateSchema`/`roleDeleteSchema` reject
// anything else, so a readable placeholder like "r-admin" would fail Zod
// validation before ever reaching the mocked service layer.
const ADMIN_ROLE_ID = "507f1f77bcf86cd799439011";
const LEADER_ROLE_ID = "507f1f77bcf86cd799439012";
const CUSTOM_ROLE_ID = "507f1f77bcf86cd799439013";
const CUSTOM_ADMIN_ROLE_ID = "507f1f77bcf86cd799439014";
const GHOST_ROLE_ID = "507f1f77bcf86cd799439099";
const ADMIN_USER_ID = "507f1f77bcf86cd799439021";

const ADMIN_ROLE = {
  _id: { toHexString: () => ADMIN_ROLE_ID },
  key: "admin",
  name: "Admin",
  description: "Full access",
  permissions: ["users:manage", "roles:manage"],
  isSystem: true,
};
const LEADER_ROLE = {
  _id: { toHexString: () => LEADER_ROLE_ID },
  key: "leader",
  name: "Leader",
  description: "Manages people",
  permissions: ["people:read"],
  isSystem: true,
};
const CUSTOM_ROLE = {
  _id: { toHexString: () => CUSTOM_ROLE_ID },
  name: "Custom",
  description: "A custom role",
  permissions: ["people:read"],
  isSystem: false,
};
const CUSTOM_ADMIN_ROLE = {
  _id: { toHexString: () => CUSTOM_ADMIN_ROLE_ID },
  name: "Custom Admin",
  permissions: ["users:manage", "roles:manage"],
  isSystem: false,
};

const ADMIN_USER = {
  _id: { toHexString: () => ADMIN_USER_ID },
  status: "active",
  roleIds: [ADMIN_ROLE_ID],
};

function formDataOf(entries: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const v of value) fd.append(key, v);
    } else {
      fd.set(key, value);
    }
  }
  return fd;
}

describe("createRoleAction", () => {
  it("refuses without roles:manage — forbidden shape, no write, no transaction", async () => {
    requirePermission.mockResolvedValueOnce(FORBIDDEN);
    const { createRoleAction } = await loadActions();

    const result = await createRoleAction(
      undefined,
      formDataOf({ name: "New role", permissions: ["people:read"] }),
    );

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(createRole).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
  });

  it("rejects an unregistered permission key — invalid, no write", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    const { createRoleAction } = await loadActions();

    const result = await createRoleAction(
      undefined,
      formDataOf({ name: "New role", permissions: ["finances:write"] }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.reason).toBe("invalid");
    expect(createRole).not.toHaveBeenCalled();
  });

  it("creates the role, audits it, and revalidates on success", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    createRole.mockResolvedValueOnce({ ok: true, roleId: "r-new" });
    const { createRoleAction } = await loadActions();

    const result = await createRoleAction(
      undefined,
      formDataOf({ name: "New role", description: "desc", permissions: ["people:read"] }),
    );

    expect(result).toEqual({ ok: true, data: undefined });
    expect(createRole).toHaveBeenCalledWith(
      expect.objectContaining({ name: "New role", permissions: ["people:read"] }),
      session,
    );
    expect(appendAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.create", targetId: "r-new", before: null }),
      session,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/roles", "page");
  });

  it("maps a duplicate-name conflict to reason: conflict, aborts, and does not audit", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    createRole.mockResolvedValueOnce({ ok: false, reason: "conflict" });
    const { createRoleAction } = await loadActions();

    const result = await createRoleAction(
      undefined,
      formDataOf({ name: "Leader", permissions: [] }),
    );

    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect(abortTransaction).toHaveBeenCalledTimes(1);
    expect(appendAuditEntry).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateRoleAction", () => {
  it("refuses without roles:manage — forbidden shape, no write, no transaction", async () => {
    requirePermission.mockResolvedValueOnce(FORBIDDEN);
    const { updateRoleAction } = await loadActions();

    const result = await updateRoleAction(
      undefined,
      formDataOf({ roleId: LEADER_ROLE_ID, name: "Leader", permissions: ["people:read"] }),
    );

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(updateRole).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
  });

  it("rejects an unregistered permission key — invalid, no write", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    const { updateRoleAction } = await loadActions();

    const result = await updateRoleAction(
      undefined,
      formDataOf({ roleId: LEADER_ROLE_ID, name: "Leader", permissions: ["*"] }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.reason).toBe("invalid");
    expect(updateRole).not.toHaveBeenCalled();
  });

  it("refuses removing users:manage/roles:manage from the Admin role — system-role, aborted, no write", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { updateRoleAction } = await loadActions();

    const result = await updateRoleAction(
      undefined,
      formDataOf({
        roleId: ADMIN_ROLE_ID,
        name: "Admin",
        permissions: ["roles:manage"], // drops users:manage
      }),
    );

    expect(result).toEqual({ ok: false, reason: "system-role" });
    expect(updateRole).not.toHaveBeenCalled();
    expect(abortTransaction).toHaveBeenCalledTimes(1);
  });

  it("refuses an edit that would violate administrability — last-admin, aborted, no write", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    // The last active admin's ONLY admin-equivalent grant comes from a
    // CUSTOM role (no `key`), so the system-role guard does not apply — this
    // isolates the last-admin invariant path from the system-role path.
    listRoles.mockResolvedValueOnce([CUSTOM_ADMIN_ROLE]);
    listUsers.mockResolvedValueOnce([
      { _id: { toHexString: () => ADMIN_USER_ID }, status: "active", roleIds: [CUSTOM_ADMIN_ROLE_ID] },
    ]);
    const { updateRoleAction } = await loadActions();

    const result = await updateRoleAction(
      undefined,
      formDataOf({ roleId: CUSTOM_ADMIN_ROLE_ID, name: "Custom Admin", permissions: [] }),
    );

    expect(result).toEqual({ ok: false, reason: "last-admin" });
    expect(updateRole).not.toHaveBeenCalled();
    expect(abortTransaction).toHaveBeenCalledTimes(1);
  });

  it("applies a valid edit, audits it with the same session, and revalidates", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { updateRoleAction } = await loadActions();

    const result = await updateRoleAction(
      undefined,
      formDataOf({
        roleId: LEADER_ROLE_ID,
        name: "Leader",
        permissions: ["people:read", "people:write"],
      }),
    );

    expect(result).toEqual({ ok: true, data: undefined });
    expect(updateRole).toHaveBeenCalledWith(
      expect.objectContaining({ roleId: LEADER_ROLE_ID, permissions: ["people:read", "people:write"] }),
      session,
    );
    expect(appendAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.update", targetId: LEADER_ROLE_ID }),
      session,
    );
    expect(abortTransaction).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/roles", "page");
  });

  it("returns not-found for a roleId that no longer exists, without writing", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { updateRoleAction } = await loadActions();

    const result = await updateRoleAction(
      undefined,
      formDataOf({ roleId: GHOST_ROLE_ID, name: "Ghost", permissions: [] }),
    );

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(updateRole).not.toHaveBeenCalled();
  });
});

describe("deleteRoleAction", () => {
  it("refuses without roles:manage — forbidden shape, no write, no transaction", async () => {
    requirePermission.mockResolvedValueOnce(FORBIDDEN);
    const { deleteRoleAction } = await loadActions();

    const result = await deleteRoleAction(undefined, formDataOf({ roleId: CUSTOM_ROLE_ID }));

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(deleteRole).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
  });

  it("refuses deleting an isSystem role — system-role, aborted, no write", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { deleteRoleAction } = await loadActions();

    const result = await deleteRoleAction(undefined, formDataOf({ roleId: LEADER_ROLE_ID }));

    expect(result).toEqual({ ok: false, reason: "system-role" });
    expect(deleteRole).not.toHaveBeenCalled();
    expect(abortTransaction).toHaveBeenCalledTimes(1);
  });

  it("refuses deleting the last remaining source of admin permissions — last-admin, aborted, no write", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([CUSTOM_ADMIN_ROLE]);
    listUsers.mockResolvedValueOnce([
      { _id: { toHexString: () => ADMIN_USER_ID }, status: "active", roleIds: [CUSTOM_ADMIN_ROLE_ID] },
    ]);
    const { deleteRoleAction } = await loadActions();

    const result = await deleteRoleAction(undefined, formDataOf({ roleId: CUSTOM_ADMIN_ROLE_ID }));

    expect(result).toEqual({ ok: false, reason: "last-admin" });
    expect(deleteRole).not.toHaveBeenCalled();
    expect(abortTransaction).toHaveBeenCalledTimes(1);
  });

  it("deletes a safe custom role, audits it with the same session, and revalidates", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, CUSTOM_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { deleteRoleAction } = await loadActions();

    const result = await deleteRoleAction(undefined, formDataOf({ roleId: CUSTOM_ROLE_ID }));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(deleteRole).toHaveBeenCalledWith(CUSTOM_ROLE_ID, session);
    expect(appendAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.delete", targetId: CUSTOM_ROLE_ID, after: null }),
      session,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/roles", "page");
  });

  it("returns not-found for a roleId that no longer exists, without writing", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { deleteRoleAction } = await loadActions();

    const result = await deleteRoleAction(
      undefined,
      formDataOf({ roleId: GHOST_ROLE_ID }),
    );

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(deleteRole).not.toHaveBeenCalled();
  });
});
