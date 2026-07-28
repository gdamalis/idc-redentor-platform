import { describe, it, expect } from "vitest";
import esAR from "../../messages/es-AR.json";
import enUS from "../../messages/en-US.json";
import { PERMISSION_KEYS } from "@src/lib/rbac/permissions";

/** Flattens {a:{b:"x"}} => ["a.b"], so a nested key can never drift between locales. */
function flattenKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("admin locale message files", () => {
  it("have identical key sets (no key may exist in one file only)", () => {
    const es = flattenKeys(esAR).sort();
    const en = flattenKeys(enUS).sort();

    expect(es.filter((k) => !en.includes(k))).toEqual([]); // missing from en-US
    expect(en.filter((k) => !es.includes(k))).toEqual([]); // missing from es-AR
  });
});

describe("common (ICR-128 P2 fix — dialog.tsx's required, localized closeLabel)", () => {
  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])("%s carries a non-empty common.close", (_locale, messages) => {
    expect(Object.keys(messages.common).sort()).toEqual(["close"]);
    expect(messages.common.close.length).toBeGreaterThan(0);
  });
});

describe("auth.resetPassword + auth.email.{invite,reset} (ICR-127)", () => {
  const resetPasswordKeys = [
    "title",
    "subtitle",
    "emailLabel",
    "submit",
    "successGeneric",
    "backToLogin",
  ].sort();
  const inviteEmailKeys = [
    "subject",
    "heading",
    "greeting",
    "body",
    "cta",
    "expiryNote",
    "footer",
  ].sort();
  const resetEmailKeys = [
    "subject",
    "heading",
    "body",
    "cta",
    "expiryNote",
    "ignoreNote",
    "footer",
  ].sort();

  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])("%s carries the auth.resetPassword subtree with every expected key", (_locale, messages) => {
    expect(Object.keys(messages.auth.resetPassword).sort()).toEqual(resetPasswordKeys);
  });

  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])("%s carries the auth.email.invite subtree with every expected key", (_locale, messages) => {
    expect(Object.keys(messages.auth.email.invite).sort()).toEqual(inviteEmailKeys);
  });

  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])("%s carries the auth.email.reset subtree with every expected key", (_locale, messages) => {
    expect(Object.keys(messages.auth.email.reset).sort()).toEqual(resetEmailKeys);
  });
});

describe("permissions.*, roles.*, users.*, rbac.* (ICR-128)", () => {
  const permissionGroupKeys = [
    "people",
    "families",
    "activities",
    "calendar",
    "users",
    "roles",
  ].sort();

  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])(
    "%s carries the permissions subtree with exactly the registry keys plus groups",
    (_locale, messages) => {
      expect(Object.keys(messages.permissions).sort()).toEqual(
        [...PERMISSION_KEYS, "groups"].sort(),
      );
      expect(Object.keys(messages.permissions.groups).sort()).toEqual(
        permissionGroupKeys,
      );
    },
  );

  // The gate this ticket's registry-extensibility AC depends on: a new
  // PERMISSION_KEYS entry with no matching translation fails CI here, in
  // BOTH catalogs, rather than surfacing later as a next-intl runtime error
  // or a silently-blank matrix cell.
  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])(
    "%s carries a non-empty .label and .description for EVERY PERMISSION_KEYS entry",
    (_locale, messages) => {
      for (const key of PERMISSION_KEYS) {
        const entry = (messages.permissions as Record<string, { label?: string; description?: string }>)[key];
        expect(entry, `missing permissions.${key}`).toBeDefined();
        expect(entry.label?.length ?? 0, `missing permissions.${key}.label`).toBeGreaterThan(0);
        expect(
          entry.description?.length ?? 0,
          `missing permissions.${key}.description`,
        ).toBeGreaterThan(0);
      }
    },
  );

  const rolesTopLevelKeys = [
    "title",
    "subtitle",
    "edit",
    "new",
    "delete",
    "table",
    "matrix",
    "form",
    "system",
  ].sort();
  const rolesTableKeys = ["name", "description", "members", "actions", "systemBadge"].sort();
  const rolesMatrixKeys = ["permissionColumn", "save", "saved"].sort();
  const rolesFormKeys = ["nameLabel", "descriptionLabel", "deleteConfirm"].sort();
  const systemRoleKeys = ["name", "description"].sort();

  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])("%s carries the roles subtree with every expected key", (_locale, messages) => {
    expect(Object.keys(messages.roles).sort()).toEqual(rolesTopLevelKeys);
    expect(Object.keys(messages.roles.table).sort()).toEqual(rolesTableKeys);
    expect(Object.keys(messages.roles.matrix).sort()).toEqual(rolesMatrixKeys);
    expect(Object.keys(messages.roles.form).sort()).toEqual(rolesFormKeys);
    // The three seeded SystemRoleKeys (role.service.ts's SYSTEM_ROLE_SEEDS) —
    // each rendered via roles.system.<key>.{name,description}, never the raw
    // (English-only) DB Role.name/description.
    expect(Object.keys(messages.roles.system).sort()).toEqual(
      ["admin", "leader", "member"].sort(),
    );
    for (const key of ["admin", "leader", "member"] as const) {
      expect(Object.keys(messages.roles.system[key]).sort()).toEqual(systemRoleKeys);
    }
  });

  const usersTopLevelKeys = ["title", "subtitle", "table", "status", "invite", "errors"].sort();
  const usersTableKeys = [
    "email",
    "displayName",
    "roles",
    "status",
    "actions",
    "saveRoles",
    "rolesSaved",
    "enable",
    "disable",
    "delete",
    "deleteConfirm",
  ].sort();
  const usersStatusKeys = ["active", "disabled"].sort();
  const usersInviteKeys = [
    "trigger",
    "title",
    "description",
    "emailLabel",
    "rolesLabel",
    "cancel",
    "submit",
    "sentSuccess",
    "resentSuccess",
    "deliveryFailed",
  ].sort();
  // The `/users`-context override for the two `rbac.errors.*` keys whose
  // shared copy is role-flavored (P2 fix) — `useUsersRbacErrorMessage`
  // (`rbac-error-message.ts`) reads these instead of `rbac.errors.notFound`/
  // `.conflict` on the users screens. Every other reason stays shared.
  const usersErrorsKeys = ["notFound", "conflict"].sort();

  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])("%s carries the users subtree with every expected key", (_locale, messages) => {
    expect(Object.keys(messages.users).sort()).toEqual(usersTopLevelKeys);
    expect(Object.keys(messages.users.table).sort()).toEqual(usersTableKeys);
    expect(Object.keys(messages.users.status).sort()).toEqual(usersStatusKeys);
    expect(Object.keys(messages.users.invite).sort()).toEqual(usersInviteKeys);
    expect(Object.keys(messages.users.errors).sort()).toEqual(usersErrorsKeys);
  });

  const rbacDeniedKeys = ["title", "body", "backToDashboard"].sort();
  // One key per `ActionFailureReason` that a Server Action can actually
  // surface to the UI (service/types.ts) — "unauthenticated"/"no-account"/
  // "disabled" never reach here, since those redirect instead of rendering
  // an inline error (`requireActionPermission`, `lib/rbac/require-permission.ts`).
  const rbacErrorKeys = [
    "lastAdmin",
    "systemRole",
    "forbidden",
    "invalid",
    "notFound",
    "conflict",
  ].sort();

  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])("%s carries the rbac subtree with every expected key", (_locale, messages) => {
    expect(Object.keys(messages.rbac).sort()).toEqual(["denied", "errors"].sort());
    expect(Object.keys(messages.rbac.denied).sort()).toEqual(rbacDeniedKeys);
    expect(Object.keys(messages.rbac.errors).sort()).toEqual(rbacErrorKeys);
  });
});
