import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ObjectId } from "mongodb";
import type { PermissionKey } from "@src/lib/rbac/permissions";

const { mockRequirePermission, mockRedirect } = vi.hoisted(() => ({
  mockRequirePermission: vi.fn(),
  mockRedirect: vi.fn(),
}));

vi.mock("@src/components/rbac/permission-denied", () => ({
  PermissionDenied: () => <div data-testid="permission-denied">Denied</div>,
}));

vi.mock("@src/lib/rbac/require-permission", () => ({
  requirePermission: mockRequirePermission,
}));

vi.mock("@src/i18n/routing", () => ({
  redirect: mockRedirect,
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => (key: string) => `${ns}.${key}`,
}));

import ContentLayout from "./layout";

describe("ContentLayout (AC1 & AC9)", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CONTENT_TRIAL_MODE;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("renders PermissionDenied when user lacks content:read", async () => {
    mockRequirePermission.mockResolvedValue({ ok: false, reason: "forbidden" });

    render(
      await ContentLayout({
        params: Promise.resolve({ locale: "es-AR" }),
        children: <div>Secret content</div>,
      }),
    );

    expect(screen.queryByText("Secret content")).toBeNull();
    expect(screen.getByTestId("permission-denied")).toBeDefined();
  });

  it("renders TrialModeBanner on every Contenido page when CONTENT_TRIAL_MODE is not 'false' and hides it when 'false'", async () => {
    mockRequirePermission.mockResolvedValue({
      ok: true,
      user: { _id: new ObjectId("65f1234567890abcdef12345") },
      permissions: new Set<PermissionKey>(["content:read"]),
    });

    const first = render(
      await ContentLayout({
        params: Promise.resolve({ locale: "es-AR" }),
        children: <div>Hub body</div>,
      }),
    );
    expect(screen.getByTestId("trial-mode-banner")).toBeDefined();
    expect(screen.getByText("Hub body")).toBeDefined();
    first.unmount();

    process.env.CONTENT_TRIAL_MODE = "false";
    render(
      await ContentLayout({
        params: Promise.resolve({ locale: "es-AR" }),
        children: <div>Live body</div>,
      }),
    );
    expect(screen.queryByTestId("trial-mode-banner")).toBeNull();
    expect(screen.getByText("Live body")).toBeDefined();
  });
});
