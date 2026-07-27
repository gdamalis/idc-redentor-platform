import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next-intl requires a locale/translation context; echo back `${namespace}.${key}`
// so assertions can target the exact message key (mirrors login-form.test.tsx's
// next-intl mocking style).
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const pushMock = vi.fn();
vi.mock("@src/i18n/routing", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const fakeAuth = { currentUser: { uid: "firebase-uid-1" } };
vi.mock("@src/lib/firebase/client", () => ({
  getFirebaseAuth: () => fakeAuth,
}));

const signOutMock = vi.fn();
vi.mock("firebase/auth", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

import { SignOutButton } from "./sign-out-button";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SignOutButton (Codex round-6 P1 — navigate away only once sign-out is confirmed)", () => {
  it("on a 200 response: clears the server session, ends the Firebase client session, then navigates — no error shown", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    signOutMock.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<SignOutButton />);
    await user.click(screen.getByRole("button", { name: "auth.signOut.label" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", { method: "DELETE" });
    });
    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith(fakeAuth);
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("on a non-2xx response: stays on the page, shows a retryable error, and re-enables the button", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const user = userEvent.setup();

    render(<SignOutButton />);
    const button = screen.getByRole("button", { name: "auth.signOut.label" });
    await user.click(button);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", { method: "DELETE" });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("auth.signOut.error");
    expect(pushMock).not.toHaveBeenCalled();
    // The Firebase client session must never be torn down when the server
    // session was NOT confirmed cleared — that would strand the user on a
    // page they believe failed, having also lost their client-side state.
    expect(signOutMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it("when the DELETE fetch itself rejects (network error): stays on the page, shows a retryable error, re-enables the button", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();

    render(<SignOutButton />);
    const button = screen.getByRole("button", { name: "auth.signOut.label" });
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("auth.signOut.error");
    expect(pushMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it("when Firebase signOut rejects but the server DELETE returned 200: still navigates to /login", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    signOutMock.mockRejectedValue(new Error("firebase signOut failed"));
    const user = userEvent.setup();
    // The Firebase client-session teardown failure is expected to be logged
    // (see the component's console.error); silence it so this test's output
    // stays clean without masking a genuine assertion failure.
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<SignOutButton />);
    await user.click(screen.getByRole("button", { name: "auth.signOut.label" }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith(fakeAuth);
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
    expect(screen.queryByRole("alert")).toBeNull();

    consoleErrorSpy.mockRestore();
  });
});
