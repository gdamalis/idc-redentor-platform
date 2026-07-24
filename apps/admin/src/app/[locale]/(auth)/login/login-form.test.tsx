import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";

// next-intl requires a locale/translation context; echo back `${namespace}.${key}`
// so assertions can target the exact message key without loading real copy.
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const pushMock = vi.fn();
vi.mock("@src/i18n/routing", () => ({
  useRouter: () => ({ push: pushMock }),
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const fakeAuth = { currentUser: { uid: "firebase-uid-1" } };
vi.mock("@src/lib/firebase/client", () => ({
  getFirebaseAuth: () => fakeAuth,
}));

const signInWithEmailAndPasswordMock = vi.fn();
const signInWithPopupMock = vi.fn();
const signInWithRedirectMock = vi.fn();
const getRedirectResultMock = vi.fn();
const signOutMock = vi.fn();
const deleteUserMock = vi.fn();

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => signInWithEmailAndPasswordMock(...args),
  signInWithPopup: (...args: unknown[]) => signInWithPopupMock(...args),
  signInWithRedirect: (...args: unknown[]) => signInWithRedirectMock(...args),
  getRedirectResult: (...args: unknown[]) => getRedirectResultMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
  deleteUser: (...args: unknown[]) => deleteUserMock(...args),
  GoogleAuthProvider: vi.fn(),
}));

import { LoginForm } from "./login-form";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  getRedirectResultMock.mockResolvedValue(null);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillAndSubmit(email = "person@example.com", password = "secret123") {
  const user = userEvent.setup();
  render(<LoginForm callbackUrl="/es-AR" />);

  await user.type(screen.getByLabelText("auth.login.emailLabel"), email);
  await user.type(screen.getByLabelText("auth.login.passwordLabel"), password);
  await user.click(screen.getByRole("button", { name: "auth.login.submit" }));

  return user;
}

describe("LoginForm", () => {
  it("signs in with email/password then exchanges the ID token for a session", async () => {
    const getIdToken = vi.fn().mockResolvedValue("id-token-1");
    signInWithEmailAndPasswordMock.mockResolvedValue({ user: { getIdToken } });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, preferredLocale: "es-AR" }),
    });

    await fillAndSubmit("person@example.com", "secret123");

    await waitFor(() => {
      expect(signInWithEmailAndPasswordMock).toHaveBeenCalledWith(
        fakeAuth,
        "person@example.com",
        "secret123",
      );
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/session",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ idToken: "id-token-1" }),
        }),
      );
    });
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalled();
    });
  });

  it("on a 403 no-invite response, deletes the orphan account, signs out, and redirects to /no-access", async () => {
    const getIdToken = vi.fn().mockResolvedValue("id-token-2");
    signInWithEmailAndPasswordMock.mockResolvedValue({ user: { getIdToken } });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ ok: false, reason: "no-invite" }),
    });

    await fillAndSubmit();

    await waitFor(() => {
      expect(deleteUserMock).toHaveBeenCalledWith(fakeAuth.currentUser);
    });
    expect(signOutMock).toHaveBeenCalledWith(fakeAuth);
    expect(pushMock).toHaveBeenCalledWith("/no-access");
  });

  it("shows the localized wrong-password error when Firebase rejects with auth/wrong-password", async () => {
    signInWithEmailAndPasswordMock.mockRejectedValue({ code: "auth/wrong-password" });

    await fillAndSubmit();

    expect(await screen.findByText("auth.login.errors.wrongPassword")).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
