import { describe, it, expect, vi, beforeEach } from "vitest";

const generatePasswordResetLink = vi.fn();
const sendPasswordResetEmail = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

vi.mock("@src/lib/firebase/admin", () => ({
  getAdminAuth: () => ({ generatePasswordResetLink }),
}));

vi.mock("@src/service/auth-email", () => ({ sendPasswordResetEmail }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestPasswordReset", () => {
  it("generates the reset link + sends the email, and returns ok:true", async () => {
    const { requestPasswordReset } = await import("./actions");
    generatePasswordResetLink.mockResolvedValueOnce(
      "https://admin.example.org/es-AR/login?oobCode=abc",
    );
    sendPasswordResetEmail.mockResolvedValueOnce(true);

    const result = await requestPasswordReset("user@bar.com", "es-AR");

    expect(generatePasswordResetLink).toHaveBeenCalledWith(
      "user@bar.com",
      expect.objectContaining({ url: expect.stringContaining("/es-AR/login") }),
    );
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({
      to: "user@bar.com",
      resetUrl: "https://admin.example.org/es-AR/login?oobCode=abc",
      locale: "es-AR",
    });
    expect(result).toEqual({ ok: true });
  });

  it("stays enumeration-safe: auth/user-not-found still returns ok:true and never sends an email", async () => {
    const { requestPasswordReset } = await import("./actions");
    const notFoundError = Object.assign(new Error("no user"), {
      code: "auth/user-not-found",
    });
    generatePasswordResetLink.mockRejectedValueOnce(notFoundError);

    const result = await requestPasswordReset("nobody@bar.com", "en-US");

    expect(result).toEqual({ ok: true });
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("does not call Firebase or send an email for a malformed address, and still returns ok:true", async () => {
    const { requestPasswordReset } = await import("./actions");

    const result = await requestPasswordReset("not-an-email", "es-AR");

    expect(result).toEqual({ ok: true });
    expect(generatePasswordResetLink).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
