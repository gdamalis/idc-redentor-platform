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
vi.mock("@src/service/role.service", () => ({ listRoles }));

const listUsers = vi.fn();
const updateUserRoles = vi.fn();
const updateUserStatus = vi.fn();
const deleteUser = vi.fn();
vi.mock("@src/service/user.service", () => ({
  listUsers,
  updateUserRoles,
  updateUserStatus,
  deleteUser,
}));

const createInvite = vi.fn();
vi.mock("@src/service/invite.service", () => ({ createInvite }));

const sendInviteEmail = vi.fn();
vi.mock("@src/service/auth-email", () => ({ sendInviteEmail }));

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

beforeEach(() => {
  vi.clearAllMocks();
  sendInviteEmail.mockResolvedValue(true);
});

const ACTOR = {
  _id: { toHexString: () => "507f1f77bcf86cd799439001" },
  email: "actor@idcr.org",
  preferredLocale: "es-AR" as const,
};
const AUTHORIZED = { ok: true as const, user: ACTOR, permissions: new Set(["users:manage"]) };
const FORBIDDEN = { ok: false as const, reason: "forbidden" as const };

// Real 24-hex-char ids — the schemas reject anything else, so a readable
// placeholder like "r-admin" would fail Zod validation before ever reaching
// the mocked service layer.
const ADMIN_ROLE_ID = "507f1f77bcf86cd799439011";
const LEADER_ROLE_ID = "507f1f77bcf86cd799439012";
const CUSTOM_ADMIN_ROLE_ID = "507f1f77bcf86cd799439014";
const GHOST_ROLE_ID = "507f1f77bcf86cd799439099";

const ADMIN_USER_ID = "507f1f77bcf86cd799439021";
const TARGET_USER_ID = "507f1f77bcf86cd799439022";
const DISABLED_USER_ID = "507f1f77bcf86cd799439023";
const GHOST_USER_ID = "507f1f77bcf86cd799439098";

const ADMIN_ROLE = {
  _id: { toHexString: () => ADMIN_ROLE_ID },
  key: "admin",
  name: "Admin",
  permissions: ["users:manage", "roles:manage"],
  isSystem: true,
};
const LEADER_ROLE = {
  _id: { toHexString: () => LEADER_ROLE_ID },
  key: "leader",
  name: "Leader",
  permissions: ["people:read"],
  isSystem: true,
};
const CUSTOM_ADMIN_ROLE = {
  _id: { toHexString: () => CUSTOM_ADMIN_ROLE_ID },
  name: "Custom Admin",
  permissions: ["users:manage", "roles:manage"],
  isSystem: false,
};

const ADMIN_USER = {
  _id: { toHexString: () => ADMIN_USER_ID },
  email: "admin@idcr.org",
  status: "active",
  roleIds: [ADMIN_ROLE_ID],
};
const TARGET_USER = {
  _id: { toHexString: () => TARGET_USER_ID },
  email: "target@idcr.org",
  status: "active",
  roleIds: [LEADER_ROLE_ID],
};
const DISABLED_USER = {
  _id: { toHexString: () => DISABLED_USER_ID },
  email: "disabled@idcr.org",
  status: "disabled",
  roleIds: [LEADER_ROLE_ID],
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

describe("inviteUserAction", () => {
  it("refuses without users:manage — forbidden shape, no write, no transaction", async () => {
    requirePermission.mockResolvedValueOnce(FORBIDDEN);
    const { inviteUserAction } = await loadActions();

    const result = await inviteUserAction(
      undefined,
      formDataOf({ email: "new@idcr.org", roleIds: [LEADER_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(createInvite).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("rejects a roleId that doesn't exist — not-found, no write, no email", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([LEADER_ROLE]);
    const { inviteUserAction } = await loadActions();

    const result = await inviteUserAction(
      undefined,
      formDataOf({ email: "new@idcr.org", roleIds: [GHOST_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(createInvite).not.toHaveBeenCalled();
    expect(abortTransaction).toHaveBeenCalledTimes(1);
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });

  it("creates the invite, audits it, revalidates, and sends the invitee email in the inviting admin's locale", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([LEADER_ROLE]);
    createInvite.mockResolvedValueOnce({ ok: true, inviteId: "inv1", refreshed: false });
    const { inviteUserAction } = await loadActions();

    const result = await inviteUserAction(
      undefined,
      formDataOf({ email: "New@IDCR.org", roleIds: [LEADER_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: true, data: { emailSent: true, refreshed: false } });
    expect(createInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@idcr.org",
        roleIds: [LEADER_ROLE_ID],
        locale: "es-AR",
        invitedByUserId: ACTOR._id.toHexString(),
      }),
      session,
    );
    expect(appendAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.invite", targetId: "inv1", before: null }),
      session,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/users", "page");
    expect(sendInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new@idcr.org",
        locale: "es-AR",
        inviteUrl: expect.stringContaining("/es-AR/login"),
      }),
    );
    // Inviting can only ever ADD a prospective grantee, never reduce
    // administrability — it doesn't run `retainsAdministrability`, so it has
    // no reason to touch the guard document either (scope boundary, mirrors
    // createRoleAction's identical test in roles/actions.test.ts).
    expect(touchAdministrabilityGuard).not.toHaveBeenCalled();
  });

  // ICR-128 P1 regression: createInvite() refreshes an expired-but-still-
  // pending invite instead of conflicting (see invite.service.test.ts for
  // the service-level coverage of that). At the action level, this proves
  // `refreshed: true` flows through end to end into the returned data, so
  // invite-dialog.tsx can show "re-sent" instead of "sent".
  it("reports refreshed: true when createInvite refreshed an existing (live or expired) pending invite", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([LEADER_ROLE]);
    createInvite.mockResolvedValueOnce({ ok: true, inviteId: "inv1", refreshed: true });
    const { inviteUserAction } = await loadActions();

    const result = await inviteUserAction(
      undefined,
      formDataOf({ email: "new@idcr.org", roleIds: [LEADER_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: true, data: { emailSent: true, refreshed: true } });
  });

  // ICR-128 P1 fix: the previous version awaited sendInviteEmail() and
  // ignored its boolean return, so a transient Resend failure reported
  // success while nobody was invited. The action must still succeed (the
  // Invite row is the source of truth and can be provisioned out of band),
  // but must say so — the invite row is NOT rolled back on a failed send.
  it("still reports ok:true when sendInviteEmail resolves false, but surfaces data.emailSent === false", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([LEADER_ROLE]);
    createInvite.mockResolvedValueOnce({ ok: true, inviteId: "inv1", refreshed: false });
    sendInviteEmail.mockResolvedValueOnce(false);
    const { inviteUserAction } = await loadActions();

    const result = await inviteUserAction(
      undefined,
      formDataOf({ email: "new@idcr.org", roleIds: [LEADER_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: true, data: { emailSent: false, refreshed: false } });
    // The invite was still created and audited — delivery failure never
    // rolls back the already-committed transaction.
    expect(createInvite).toHaveBeenCalledTimes(1);
    expect(appendAuditEntry).toHaveBeenCalledTimes(1);
  });

  it("still reports success (with emailSent: false) when the email send itself throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([LEADER_ROLE]);
    createInvite.mockResolvedValueOnce({ ok: true, inviteId: "inv1", refreshed: false });
    sendInviteEmail.mockRejectedValueOnce(new Error("Resend outage"));
    const { inviteUserAction } = await loadActions();

    const result = await inviteUserAction(
      undefined,
      formDataOf({ email: "new@idcr.org", roleIds: [LEADER_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: true, data: { emailSent: false, refreshed: false } });
    consoleError.mockRestore();
  });
});

describe("updateUserRolesAction", () => {
  it("refuses without users:manage — forbidden shape, no write, no transaction", async () => {
    requirePermission.mockResolvedValueOnce(FORBIDDEN);
    const { updateUserRolesAction } = await loadActions();

    const result = await updateUserRolesAction(
      undefined,
      formDataOf({ userId: TARGET_USER_ID, roleIds: [LEADER_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(updateUserRoles).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
  });

  it("refuses a Leader session's direct call with a crafted admin roleId — forbidden, no write (privilege-escalation AC)", async () => {
    requirePermission.mockResolvedValueOnce(FORBIDDEN);
    const { updateUserRolesAction } = await loadActions();

    // A Leader (or anyone lacking users:manage) invoking this Server Action
    // directly — bypassing the UI entirely — with a payload that grants
    // themselves (or anyone) the Admin role. `requirePermission` must gate
    // BEFORE the payload is ever parsed or the DB is ever read.
    const result = await updateUserRolesAction(
      undefined,
      formDataOf({ userId: TARGET_USER_ID, roleIds: [ADMIN_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(updateUserRoles).not.toHaveBeenCalled();
    expect(listRoles).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
  });

  it("returns not-found when the target user no longer exists", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { updateUserRolesAction } = await loadActions();

    const result = await updateUserRolesAction(
      undefined,
      formDataOf({ userId: GHOST_USER_ID, roleIds: [LEADER_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(updateUserRoles).not.toHaveBeenCalled();
  });

  it("returns not-found when a submitted roleId doesn't exist", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER, TARGET_USER]);
    const { updateUserRolesAction } = await loadActions();

    const result = await updateUserRolesAction(
      undefined,
      formDataOf({ userId: TARGET_USER_ID, roleIds: [GHOST_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(updateUserRoles).not.toHaveBeenCalled();
    expect(abortTransaction).toHaveBeenCalledTimes(1);
  });

  it("refuses stripping the last admin's own admin-granting role — last-admin, aborted, no write", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    // The last active admin's ONLY admin-equivalent grant comes from a
    // CUSTOM role, isolating this from the system-role guard entirely (that
    // guard lives on the ROLE mutation path, not the user-roles path).
    listRoles.mockResolvedValueOnce([CUSTOM_ADMIN_ROLE, LEADER_ROLE]);
    const lastAdmin = {
      _id: { toHexString: () => ADMIN_USER_ID },
      email: "admin@idcr.org",
      status: "active",
      roleIds: [CUSTOM_ADMIN_ROLE_ID],
    };
    listUsers.mockResolvedValueOnce([lastAdmin]);
    const { updateUserRolesAction } = await loadActions();

    const result = await updateUserRolesAction(
      undefined,
      formDataOf({ userId: ADMIN_USER_ID, roleIds: [LEADER_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: false, reason: "last-admin" });
    expect(updateUserRoles).not.toHaveBeenCalled();
    expect(abortTransaction).toHaveBeenCalledTimes(1);
    expect(touchAdministrabilityGuard).toHaveBeenCalledWith(session);
  });

  it("applies a valid role change, audits it with the same session, and revalidates", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER, TARGET_USER]);
    const { updateUserRolesAction } = await loadActions();

    const result = await updateUserRolesAction(
      undefined,
      formDataOf({ userId: TARGET_USER_ID, roleIds: [ADMIN_ROLE_ID, LEADER_ROLE_ID] }),
    );

    expect(result).toEqual({ ok: true, data: undefined });
    expect(updateUserRoles).toHaveBeenCalledWith(
      TARGET_USER_ID,
      [ADMIN_ROLE_ID, LEADER_ROLE_ID],
      session,
    );
    expect(appendAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.roles.update", targetId: TARGET_USER_ID }),
      session,
    );
    expect(abortTransaction).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/users", "page");
    expect(touchAdministrabilityGuard).toHaveBeenCalledWith(session);
  });
});

// P2 fix: a session-level refusal redirects instead of returning a silent
// `{ ok: false }` the client would render nothing for (spec edge case #14).
// One representative user action covers the wiring here; `roles/actions.test.ts`
// covers the same wiring for a role action. Every other action shares the
// same `requireActionPermission` call, unit-tested on its own in
// `require-action-permission.test.ts`.
describe("updateUserStatusAction — session-level refusal redirects (P2 fix)", () => {
  it("redirects to /login on an unauthenticated refusal, with no write and no transaction", async () => {
    requirePermission.mockResolvedValueOnce({ ok: false, reason: "unauthenticated" });
    getLocale.mockResolvedValueOnce("es-AR");
    const { updateUserStatusAction } = await loadActions();

    await expect(
      updateUserStatusAction(
        undefined,
        formDataOf({ userId: TARGET_USER_ID, status: "disabled" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith({ href: "/login", locale: "es-AR" });
    expect(updateUserStatus).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
  });

  it("redirects to /no-access on a disabled refusal, with no write and no transaction", async () => {
    requirePermission.mockResolvedValueOnce({ ok: false, reason: "disabled" });
    getLocale.mockResolvedValueOnce("es-AR");
    const { updateUserStatusAction } = await loadActions();

    await expect(
      updateUserStatusAction(
        undefined,
        formDataOf({ userId: TARGET_USER_ID, status: "disabled" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith({ href: "/no-access", locale: "es-AR" });
    expect(updateUserStatus).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
  });
});

describe("updateUserStatusAction", () => {
  it("refuses without users:manage — forbidden shape, no write, no transaction", async () => {
    requirePermission.mockResolvedValueOnce(FORBIDDEN);
    const { updateUserStatusAction } = await loadActions();

    const result = await updateUserStatusAction(
      undefined,
      formDataOf({ userId: TARGET_USER_ID, status: "disabled" }),
    );

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(updateUserStatus).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
  });

  it("returns not-found when the target user no longer exists", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { updateUserStatusAction } = await loadActions();

    const result = await updateUserStatusAction(
      undefined,
      formDataOf({ userId: GHOST_USER_ID, status: "disabled" }),
    );

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(updateUserStatus).not.toHaveBeenCalled();
  });

  it("refuses disabling the last active admin — last-admin, aborted, no write", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { updateUserStatusAction } = await loadActions();

    const result = await updateUserStatusAction(
      undefined,
      formDataOf({ userId: ADMIN_USER_ID, status: "disabled" }),
    );

    expect(result).toEqual({ ok: false, reason: "last-admin" });
    expect(updateUserStatus).not.toHaveBeenCalled();
    expect(abortTransaction).toHaveBeenCalledTimes(1);
    expect(touchAdministrabilityGuard).toHaveBeenCalledWith(session);
  });

  it("disables a non-last user, audits it as user.disable, and revalidates", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER, TARGET_USER]);
    const { updateUserStatusAction } = await loadActions();

    const result = await updateUserStatusAction(
      undefined,
      formDataOf({ userId: TARGET_USER_ID, status: "disabled" }),
    );

    expect(result).toEqual({ ok: true, data: undefined });
    expect(updateUserStatus).toHaveBeenCalledWith(TARGET_USER_ID, "disabled", session);
    expect(appendAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.disable", targetId: TARGET_USER_ID }),
      session,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/users", "page");
    expect(touchAdministrabilityGuard).toHaveBeenCalledWith(session);
  });

  it("re-enables a disabled user and audits it as user.enable", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER, DISABLED_USER]);
    const { updateUserStatusAction } = await loadActions();

    const result = await updateUserStatusAction(
      undefined,
      formDataOf({ userId: DISABLED_USER_ID, status: "active" }),
    );

    expect(result).toEqual({ ok: true, data: undefined });
    expect(updateUserStatus).toHaveBeenCalledWith(DISABLED_USER_ID, "active", session);
    expect(appendAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.enable", targetId: DISABLED_USER_ID }),
      session,
    );
  });
});

describe("deleteUserAction", () => {
  it("refuses without users:manage — forbidden shape, no write, no transaction", async () => {
    requirePermission.mockResolvedValueOnce(FORBIDDEN);
    const { deleteUserAction } = await loadActions();

    const result = await deleteUserAction(undefined, formDataOf({ userId: TARGET_USER_ID }));

    expect(result).toEqual({ ok: false, reason: "forbidden" });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(withAdminTransaction).not.toHaveBeenCalled();
  });

  it("returns not-found when the target user no longer exists", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { deleteUserAction } = await loadActions();

    const result = await deleteUserAction(undefined, formDataOf({ userId: GHOST_USER_ID }));

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("refuses deleting the last active admin — last-admin, aborted, no write", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER]);
    const { deleteUserAction } = await loadActions();

    const result = await deleteUserAction(undefined, formDataOf({ userId: ADMIN_USER_ID }));

    expect(result).toEqual({ ok: false, reason: "last-admin" });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(abortTransaction).toHaveBeenCalledTimes(1);
    expect(touchAdministrabilityGuard).toHaveBeenCalledWith(session);
  });

  it("deletes a safe non-last user, audits it with after: null, and revalidates", async () => {
    requirePermission.mockResolvedValueOnce(AUTHORIZED);
    listRoles.mockResolvedValueOnce([ADMIN_ROLE, LEADER_ROLE]);
    listUsers.mockResolvedValueOnce([ADMIN_USER, TARGET_USER]);
    const { deleteUserAction } = await loadActions();

    const result = await deleteUserAction(undefined, formDataOf({ userId: TARGET_USER_ID }));

    expect(result).toEqual({ ok: true, data: undefined });
    expect(deleteUser).toHaveBeenCalledWith(TARGET_USER_ID, session);
    expect(appendAuditEntry).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.delete", targetId: TARGET_USER_ID, after: null }),
      session,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/users", "page");
    expect(touchAdministrabilityGuard).toHaveBeenCalledWith(session);
  });
});
