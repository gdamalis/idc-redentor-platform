import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// next-intl requires a locale/translation context; echo back
// `${namespace}.${key}` so assertions can target the exact message key
// (mirrors permission-matrix.test.tsx's / login-form.test.tsx's mocking style).
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const inviteUserAction = vi.fn();
vi.mock("./actions", () => ({
  inviteUserAction: (...args: unknown[]) => inviteUserAction(...args),
}));

import { InviteDialog } from "./invite-dialog";

const ROLES = [{ id: "r1", name: "Leader" }];

beforeEach(() => {
  vi.clearAllMocks();
});

async function openAndSubmit() {
  const user = userEvent.setup();
  render(<InviteDialog roles={ROLES} />);

  await user.click(screen.getByRole("button", { name: "users.invite.trigger" }));
  await user.type(screen.getByLabelText("users.invite.emailLabel"), "new@idcr.org");
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "users.invite.submit" }));

  return user;
}

/**
 * ICR-128 P1 fix regression coverage: `InviteDialog` used to close itself
 * unconditionally on `state.ok`, which is exactly how a swallowed
 * email-delivery failure became a silent success in the UI — the dialog
 * closed and the admin had no way to know the invite was never delivered.
 * These tests exercise the three outcomes `inviteUserAction` can now report
 * (`data.emailSent` / `data.refreshed`) and assert the dialog no longer
 * auto-closes on any of them, so the message is actually visible.
 */
describe("InviteDialog — ICR-128 P1 outcome messaging", () => {
  it("shows the 'sent' success message on a fresh created+delivered invite, and does not auto-close", async () => {
    inviteUserAction.mockResolvedValueOnce({
      ok: true,
      data: { emailSent: true, refreshed: false },
    });

    await openAndSubmit();

    const message = await screen.findByText("users.invite.sentSuccess");
    expect(message).toHaveAttribute("role", "status");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the 're-sent' success message when createInvite refreshed an existing invite", async () => {
    inviteUserAction.mockResolvedValueOnce({
      ok: true,
      data: { emailSent: true, refreshed: true },
    });

    await openAndSubmit();

    expect(await screen.findByText("users.invite.resentSuccess")).toBeInTheDocument();
  });

  it("shows an assertive warning — not a silent success — when the invite was saved but not delivered, and keeps the dialog open for a retry", async () => {
    inviteUserAction.mockResolvedValueOnce({
      ok: true,
      data: { emailSent: false, refreshed: false },
    });

    await openAndSubmit();

    const warning = await screen.findByText("users.invite.deliveryFailed");
    expect(warning).toHaveAttribute("role", "alert");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

/**
 * ICR-128 P2 fix regression coverage: `useActionState`'s result survives
 * closing the dialog, so reopening it used to immediately show the
 * *previous* attempt's outcome. The delivery-failure warning is the
 * dangerous case — an admin opening the dialog to invite someone new would
 * see a warning that actually refers to a different person.
 */
describe("InviteDialog — ICR-128 P2 fix: no stale outcome on reopen", () => {
  it("shows no success text and no warning when the dialog is closed and reopened", async () => {
    inviteUserAction.mockResolvedValueOnce({
      ok: true,
      data: { emailSent: false, refreshed: false },
    });

    const user = await openAndSubmit();
    await screen.findByText("users.invite.deliveryFailed");

    await user.click(screen.getByRole("button", { name: "users.invite.cancel" }));
    await user.click(screen.getByRole("button", { name: "users.invite.trigger" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("users.invite.deliveryFailed")).not.toBeInTheDocument();
    expect(screen.queryByText("users.invite.sentSuccess")).not.toBeInTheDocument();
    expect(screen.queryByText("users.invite.resentSuccess")).not.toBeInTheDocument();
  });
});
