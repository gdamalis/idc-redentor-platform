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
