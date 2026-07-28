import { beforeEach, describe, expect, it, vi } from "vitest";

// `actions.ts` calls the REAL `requireActionPermission` — only its own
// dependencies are mocked here — so these tests exercise the actual
// redirect-selection wiring (P2 fix), not just a black-box stand-in. See
// `require-action-permission.test.ts` for that wrapper's own unit tests.
const requirePermission = vi.fn();
vi.mock("@src/lib/rbac/require-permission", () => ({ requirePermission }));

const getLocale = vi.fn();
vi.mock("next-intl/server", () => ({ getLocale }));

// Mirrors `require-action-permission.test.ts`'s reasoning: real `redirect()`
// throws a Next-internal `NEXT_REDIRECT` digest error to halt rendering, so
// this mock does the same rather than silently returning `undefined` (which
// would make `requireActionPermission` return `undefined` instead of never
// resolving, and crash the action's `authz.ok` check for the wrong reason).
const redirect = vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
});
vi.mock("@src/i18n/routing", () => ({ redirect }));

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

const touchAdministrabilityGuard = vi.fn();
vi.mock("@src/service/rbac-guard.service", () => ({ touchAdministrabilityGuard }));

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

// P2 fix: a session-level refusal redirects instead of returning a silent
// `{ ok: false }` the client would render nothing for (spec edge case #14).
// One representative action (`createRoleAction`) covers the wiring; every
// other action shares the same `requireActionPermission` call, unit-tested
// on its own in `require-action-permission.test.ts`.
describe("createRoleAction — session-level refusal redirects (P2 fix)", () => {
  it("redirects to /login on an unauthenticated refusal, with no write and no transaction", async () => {
    requirePermission.mockResolvedValueOnce({ ok: false, reason: "unauthenticated" });
    getLocale.mockResolvedValueOnce("es-AR");
    const { createRoleAction } = await loadActions();

    await expect(
      createRoleAction(undefined, formDataOf({ name: "New role", permissions: [] })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith({ href: "/login", locale: "es-AR" });
    expect(createRole).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
  });

  it("redirects to /no-access on a disabled refusal, with no write and no transaction", async () => {
    requirePermission.mockResolvedValueOnce({ ok: false, reason: "disabled" });
    getLocale.mockResolvedValueOnce("es-AR");
    const { createRoleAction } = await loadActions();

    await expect(
      createRoleAction(undefined, formDataOf({ name: "New role", permissions: [] })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith({ href: "/no-access", locale: "es-AR" });
    expect(createRole).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
  });
});

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
    // Creating a role can only ever ADD a grantee, never reduce
    // administrability — it doesn't run `retainsAdministrability`, so it has
    // no reason to touch the guard document either (scope boundary).
    expect(touchAdministrabilityGuard).not.toHaveBeenCalled();
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

  // These two tests are a PAIR and must be read together — they pin the fix
  // for the P1 "Admin role is uneditable" finding without weakening AC7.
  //
  // The bug: a disabled `<input type="checkbox">` is never submitted in
  // FormData, so the Admin role's two protected keys arrived ABSENT on every
  // legitimate save and this guard refused the whole edit — permanently
  // bricking the Admin role.
  //
  // The fix is CLIENT-side: permission-matrix.tsx mirrors each protected key
  // with a hidden input, so an honest save always carries both. The SERVER
  // therefore keeps rejecting strictly (AC7: "the server rejects the write if
  // attempted directly") rather than silently correcting the payload — an
  // `{ ok: true }` that quietly rewrote what the caller asked for would be a
  // dishonest response and would make the AC7 refusal path unreachable.
  it("refuses a direct payload that omits a protected key from the Admin role — system-role, aborted, no write", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { updateRoleAction } = await loadActions();

    const result = await updateRoleAction(
      undefined,
      formDataOf({
        roleId: ADMIN_ROLE_ID,
        name: "Admin",
        permissions: ["roles:manage"], // omits users:manage
      }),
    );

    expect(result).toEqual({ ok: false, reason: "system-role" });
    expect(abortTransaction).toHaveBeenCalled();
    expect(updateRole).not.toHaveBeenCalled();
    expect(appendAuditEntry).not.toHaveBeenCalled();
  });

  // The legitimate path, as the browser actually submits it once the hidden
  // inputs are present: a real non-protected edit alongside both protected
  // keys. This is the test that would have caught the original bug.
  it("saves a non-protected permission change to the Admin role when the hidden inputs carry both protected keys", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { updateRoleAction } = await loadActions();

    const result = await updateRoleAction(
      undefined,
      formDataOf({
        roleId: ADMIN_ROLE_ID,
        name: "Admin",
        // exactly what the matrix submits: the edited key + the hidden mirrors
        permissions: ["people:read", "users:manage", "roles:manage"],
      }),
    );

    expect(result).toEqual({ ok: true, data: undefined });
    expect(abortTransaction).not.toHaveBeenCalled();
    const [input] = updateRole.mock.calls[0] ?? [];
    expect(new Set(input.permissions)).toEqual(
      new Set(["people:read", "users:manage", "roles:manage"]),
    );
    expect(appendAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "role.update",
        after: expect.objectContaining({
          permissions: expect.arrayContaining([
            "people:read",
            "users:manage",
            "roles:manage",
          ]),
        }),
      }),
      session,
    );
  });

  it("does not apply the system-role guard to a non-admin role — a Leader role can still lose users:manage", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    // CUSTOM_ADMIN_ROLE has no `key`, so it is NOT `target.key === "admin"" —
    // this isolates the system-role guard from the (separate) last-admin invariant.
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, CUSTOM_ADMIN_ROLE]);
    listUsers.mockResolvedValueOnce([
      ADMIN_USER,
      {
        _id: { toHexString: () => "507f1f77bcf86cd799439022" },
        status: "active",
        roleIds: [CUSTOM_ADMIN_ROLE_ID],
      },
    ]);
    const { updateRoleAction } = await loadActions();

    const result = await updateRoleAction(
      undefined,
      formDataOf({
        roleId: CUSTOM_ADMIN_ROLE_ID,
        name: "Custom Admin",
        permissions: ["roles:manage"], // drops users:manage — this is a real, non-admin role
      }),
    );

    expect(result).toEqual({ ok: true, data: undefined });
    expect(updateRole).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["roles:manage"] }),
      session,
    );
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
    // The guard is touched BEFORE the invariant read, so it still runs even
    // on a refusal — that's what forces the write conflict this early.
    expect(touchAdministrabilityGuard).toHaveBeenCalledWith(session);
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
    // P1-3: this mutation runs `retainsAdministrability`, so it must bump
    // the shared guard document inside the SAME transaction/session — that's
    // what forces a write conflict (and a retry) against any concurrent
    // administrability-affecting mutation (write-skew closure).
    expect(touchAdministrabilityGuard).toHaveBeenCalledWith(session);
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
    expect(touchAdministrabilityGuard).toHaveBeenCalledWith(session);
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
    expect(touchAdministrabilityGuard).toHaveBeenCalledWith(session);
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
    expect(touchAdministrabilityGuard).toHaveBeenCalledWith(session);
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
