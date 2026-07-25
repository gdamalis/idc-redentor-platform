import { describe, it, expect, vi, beforeEach } from "vitest";

const buildInviteEmail = vi.fn();
const buildPasswordResetEmail = vi.fn();
const sendEmail = vi.fn();

vi.mock("@src/templates/invite.template", () => ({ buildInviteEmail }));
vi.mock("@src/templates/password-reset.template", () => ({ buildPasswordResetEmail }));
vi.mock("@src/service/mailing/mailing.service", () => ({ sendEmail }));

beforeEach(() => vi.clearAllMocks());

describe("sendInviteEmail", () => {
  it("builds the invite template and sends it via the mailing service", async () => {
    const { sendInviteEmail } = await import("./auth-email");
    buildInviteEmail.mockResolvedValueOnce({
      subject: "Subject",
      html: "<p>html</p>",
      text: "text",
    });
    sendEmail.mockResolvedValueOnce(true);

    const result = await sendInviteEmail({
      to: "invitee@bar.com",
      inviteUrl: "https://admin.example.org/en-US/login?inviteToken=abc",
      locale: "en-US",
    });

    expect(buildInviteEmail).toHaveBeenCalledWith({
      inviteUrl: "https://admin.example.org/en-US/login?inviteToken=abc",
      locale: "en-US",
    });
    expect(sendEmail).toHaveBeenCalledWith({
      to: "invitee@bar.com",
      subject: "Subject",
      html: "<p>html</p>",
      text: "text",
    });
    expect(result).toBe(true);
  });
});

describe("sendPasswordResetEmail", () => {
  it("builds the reset template and sends it via the mailing service", async () => {
    const { sendPasswordResetEmail } = await import("./auth-email");
    buildPasswordResetEmail.mockResolvedValueOnce({
      subject: "Reset subject",
      html: "<p>reset html</p>",
      text: "reset text",
    });
    sendEmail.mockResolvedValueOnce(true);

    const result = await sendPasswordResetEmail({
      to: "user@bar.com",
      resetUrl: "https://admin.example.org/es-AR/login?oobCode=xyz",
      locale: "es-AR",
    });

    expect(buildPasswordResetEmail).toHaveBeenCalledWith({
      resetUrl: "https://admin.example.org/es-AR/login?oobCode=xyz",
      locale: "es-AR",
    });
    expect(sendEmail).toHaveBeenCalledWith({
      to: "user@bar.com",
      subject: "Reset subject",
      html: "<p>reset html</p>",
      text: "reset text",
    });
    expect(result).toBe(true);
  });
});
