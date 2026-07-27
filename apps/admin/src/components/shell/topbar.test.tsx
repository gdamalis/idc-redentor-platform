import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next-intl requires a locale/translation context; echo back `${namespace}.${key}`
// so assertions can target the exact message key without loading real copy
// (mirrors login-form.test.tsx's mocking style).
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const pushMock = vi.fn();
vi.mock("@src/i18n/routing", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// SignOutButton also ends the Firebase client session (Codex round-6 P1
// fixup) — mock its dependencies the same way login-form.test.tsx /
// sign-out-button.test.tsx do, so this real (unmocked) SignOutButton render
// doesn't hit the actual Firebase SDK.
const fakeAuth = { currentUser: { uid: "firebase-uid-1" } };
vi.mock("@src/lib/firebase/client", () => ({
  getFirebaseAuth: () => fakeAuth,
}));
const signOutMock = vi.fn();
vi.mock("firebase/auth", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

// LocaleSwitcher/ThemeToggle each carry their own next-intl/next-themes
// wiring and tests; stub them here so this file isolates the ONE behavior
// this checkpoint actually adds — a working sign-out control in the shell.
vi.mock("@src/components/shell/locale-switcher", () => ({
  LocaleSwitcher: () => <div data-testid="locale-switcher" />,
}));
vi.mock("@src/components/theme/theme-toggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

import { Topbar } from "./topbar";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Topbar (Codex round-5 P1 — a working sign-out, not a disabled placeholder)", () => {
  it("renders a sign-out control that clears the session cookie and routes to /login", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const user = userEvent.setup();

    render(<Topbar />);

    await user.click(screen.getByRole("button", { name: "auth.signOut.label" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", { method: "DELETE" });
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
  });

  it("still renders the locale switcher and theme toggle alongside sign-out", () => {
    render(<Topbar />);

    expect(screen.getByTestId("locale-switcher")).toBeDefined();
    expect(screen.getByTestId("theme-toggle")).toBeDefined();
  });
});
