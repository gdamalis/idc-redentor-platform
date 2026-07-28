import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// next-intl requires a locale/translation context; echo back
// `${namespace}.${key}` so assertions can target the exact message key
// (mirrors topbar.test.tsx's mocking style).
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

// Not exercised (canManage is false below, so no <form> renders at all) —
// mocked only so importing the component doesn't pull in the real Server
// Action's Mongo/auth dependency chain into this render test.
vi.mock("./actions", () => ({ updateRoleAction: vi.fn() }));

/**
 * The AC this proves: "adding a permission key requires touching only
 * `lib/rbac/permissions.ts`." Rather than editing the real registry, this
 * mocks it with ONE extra key appended — a fixture standing in for a future
 * feature key — and asserts the matrix renders a row (and a new group) for
 * it with zero changes to `permission-matrix.tsx` itself. If the component
 * ever grows a hardcoded row/group list, this test is what would catch it.
 */
vi.mock("@src/lib/rbac/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@src/lib/rbac/permissions")>();
  return {
    ...actual,
    PERMISSIONS: { ...actual.PERMISSIONS, "widgets:read": "View widgets" },
    PERMISSION_KEYS: [...actual.PERMISSION_KEYS, "widgets:read"],
    isPermissionKey: (value: unknown) =>
      actual.isPermissionKey(value) || value === "widgets:read",
  };
});

describe("PermissionMatrix — registry extensibility", () => {
  it("derives every row (including a fixture key added only to the registry) from PERMISSION_KEYS", async () => {
    const { PermissionMatrix } = await import("./permission-matrix");
    const { PERMISSION_KEYS } = await import("@src/lib/rbac/permissions");

    render(
      <PermissionMatrix
        roles={[{ id: "r1", name: "Leader", permissions: [] }]}
        canManage={false}
      />,
    );

    // Every REAL registry key still renders... (`PERMISSION_KEYS`'s static
    // type is the real 15-key union — the mock only changes the runtime
    // value — so the fixture key is compared as a plain string here.)
    for (const key of PERMISSION_KEYS) {
      if ((key as string) === "widgets:read") continue;
      expect(screen.getByText(`permissions.${key}.label`)).toBeInTheDocument();
    }
    // ...and so does the fixture key that exists ONLY in the mocked
    // registry — the component required no change to pick it up.
    expect(screen.getByText("permissions.widgets:read.label")).toBeInTheDocument();
    // Its group heading is derived from the "widgets" prefix the same way.
    expect(screen.getByText("permissions.groups.widgets")).toBeInTheDocument();

    // One real `<input type="checkbox">` per role per registry key (16 keys
    // x 1 role) — no JS-only pseudo-checkboxes — and disabled because
    // `canManage` is false.
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(PERMISSION_KEYS.length);
    for (const checkbox of checkboxes) {
      expect(checkbox).toBeDisabled();
    }
  });
});

/**
 * Regression for the P1 finding: a disabled `<input type="checkbox">` is
 * NEVER included in `FormData` on submit — so the Admin role's protected
 * `users:manage`/`roles:manage` checkboxes (rendered `disabled`) previously
 * vanished from the submitted `permissions` list entirely, and the server's
 * system-role guard then refused EVERY edit to the Admin role, bricking it.
 * The fix mirrors each protected, disabled checkbox with a real
 * `<input type="hidden">` carrying the same name/value/form association, so
 * submitted `FormData` reflects what the checked-and-disabled box visually
 * shows regardless of the browser's disabled-element submission rule.
 */
describe("PermissionMatrix — Admin role's protected keys survive submission", () => {
  const ADMIN_ROLE = {
    id: "r-admin",
    key: "admin",
    name: "Admin",
    description: "Full access",
    permissions: ["users:manage", "roles:manage", "people:read"],
  };
  const LEADER_ROLE = {
    id: "r-leader",
    key: "leader",
    name: "Leader",
    permissions: ["users:manage"], // same key, but NOT the admin role — must stay a plain checkbox
  };

  it("mirrors each protected, disabled checkbox on the Admin role with a hidden input of the same name/value/form", async () => {
    const { PermissionMatrix } = await import("./permission-matrix");

    const { container } = render(
      <PermissionMatrix roles={[ADMIN_ROLE, LEADER_ROLE]} canManage />,
    );

    for (const key of ["users:manage", "roles:manage"]) {
      const checkbox = container.querySelector<HTMLInputElement>(
        `input[type="checkbox"][name="permissions"][value="${key}"][form="role-form-r-admin"]`,
      );
      expect(checkbox).toBeDisabled();

      const hidden = container.querySelector<HTMLInputElement>(
        `input[type="hidden"][name="permissions"][value="${key}"][form="role-form-r-admin"]`,
      );
      expect(hidden).not.toBeNull();
    }

    // An unrelated, non-admin role holding the SAME key stays a plain,
    // enabled checkbox with no hidden mirror — the guard is scoped to
    // `role.key === "admin"`, not to the key itself.
    const leaderCheckbox = container.querySelector<HTMLInputElement>(
      `input[type="checkbox"][name="permissions"][value="users:manage"][form="role-form-r-leader"]`,
    );
    expect(leaderCheckbox).not.toBeDisabled();
    const leaderHidden = container.querySelector(
      `input[type="hidden"][name="permissions"][value="users:manage"][form="role-form-r-leader"]`,
    );
    expect(leaderHidden).toBeNull();

    // A non-protected key on the Admin role (people:read) is a plain,
    // enabled checkbox — no hidden mirror, since it isn't pinned.
    const peopleReadCheckbox = container.querySelector<HTMLInputElement>(
      `input[type="checkbox"][name="permissions"][value="people:read"][form="role-form-r-admin"]`,
    );
    expect(peopleReadCheckbox).not.toBeDisabled();
    const peopleReadHidden = container.querySelector(
      `input[type="hidden"][name="permissions"][value="people:read"][form="role-form-r-admin"]`,
    );
    expect(peopleReadHidden).toBeNull();
  });

  /**
   * Sanity check requested in review: the checkbox and its hidden twin share
   * the same `name`/`value`/`form`, which could in principle double-submit a
   * protected key — and `updateRoleAction` now strictly REJECTS the Admin
   * role's write when a key is missing (AC7), so it must not also choke on a
   * doubled one reaching `roleUpdateSchema`/`updateRole`. Uses a REAL
   * `<form>` + native `FormData(form)` construction (not a manual DOM query)
   * so this exercises the actual browser "form-associated element" algorithm
   * the `form={...}` attribute relies on, not just an assumption about it.
   */
  it("submits each Admin-role protected key exactly once via real FormData — the disabled checkbox contributes nothing, only its hidden twin does", async () => {
    const { PermissionMatrix } = await import("./permission-matrix");

    const { container } = render(
      <PermissionMatrix roles={[ADMIN_ROLE, LEADER_ROLE]} canManage />,
    );

    const form = container.querySelector<HTMLFormElement>("#role-form-r-admin");
    expect(form).not.toBeNull();
    const formData = new FormData(form as HTMLFormElement);

    const submittedPermissions = formData.getAll("permissions");
    expect(submittedPermissions.filter((v) => v === "users:manage")).toHaveLength(1);
    expect(submittedPermissions.filter((v) => v === "roles:manage")).toHaveLength(1);
    // people:read is a real, enabled, defaultChecked box on the Admin role —
    // confirms the form picked up ordinary (non-mirrored) checkboxes too.
    expect(submittedPermissions.filter((v) => v === "people:read")).toHaveLength(1);
  });

  it("does not render the protected-key hidden mirrors at all when canManage is false", async () => {
    const { PermissionMatrix } = await import("./permission-matrix");

    // canManage=false renders no <form> at all (see role-form guard below the
    // table) — the hidden mirrors are pointless without a form to submit.
    const { container } = render(
      <PermissionMatrix roles={[ADMIN_ROLE]} canManage={false} />,
    );

    expect(
      container.querySelector('input[type="hidden"][name="permissions"]'),
    ).toBeNull();
  });

  /**
   * Regression for the sibling P1 finding: the matrix form previously
   * carried a hidden `name` field but no `description` field, so a
   * permissions-only save always submitted `description` as absent —
   * which (pre-fix) corrupted the role document via mongodb's
   * undefined-serializes-to-null behavior. The form must round-trip the
   * role's CURRENT description exactly like it already does for `name`.
   */
  it("round-trips the role's current description through a hidden input, exactly like name", async () => {
    const { PermissionMatrix } = await import("./permission-matrix");

    const { container } = render(
      <PermissionMatrix roles={[ADMIN_ROLE, LEADER_ROLE]} canManage />,
    );

    const adminName = container.querySelector<HTMLInputElement>(
      'form#role-form-r-admin input[type="hidden"][name="name"]',
    );
    expect(adminName?.value).toBe("Admin");
    const adminDescription = container.querySelector<HTMLInputElement>(
      'form#role-form-r-admin input[type="hidden"][name="description"]',
    );
    expect(adminDescription?.value).toBe("Full access");

    // A role with no description (LEADER_ROLE has none) still gets the
    // hidden field, just with an empty value — never `undefined` — so the
    // submitted FormData always carries an explicit (possibly empty) string
    // rather than omitting the key.
    const leaderDescription = container.querySelector<HTMLInputElement>(
      'form#role-form-r-leader input[type="hidden"][name="description"]',
    );
    expect(leaderDescription).not.toBeNull();
    expect(leaderDescription?.value).toBe("");
  });
});
