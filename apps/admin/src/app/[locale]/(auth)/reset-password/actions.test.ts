import { describe, it, expect, vi, beforeEach } from "vitest";

const generatePasswordResetLink = vi.fn();
const sendPasswordResetEmail = vi.fn();
const tryAcquireResetThrottle = vi.fn();
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

vi.mock("@src/lib/firebase/admin", () => ({
  getAdminAuth: () => ({ generatePasswordResetLink }),
}));

vi.mock("@src/service/auth-email", () => ({ sendPasswordResetEmail }));
vi.mock("@src/service/reset-throttle.service", () => ({ tryAcquireResetThrottle }));

beforeEach(() => {
  vi.clearAllMocks();
  tryAcquireResetThrottle.mockResolvedValue(true);
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
    expect(tryAcquireResetThrottle).not.toHaveBeenCalled();
  });

  it("throttles an immediate repeat request for the same email — first call allowed (sends), second call throttled (no send), both ok:true", async () => {
    const { requestPasswordReset } = await import("./actions");
    generatePasswordResetLink.mockResolvedValue(
      "https://admin.example.org/es-AR/login?oobCode=abc",
    );
    sendPasswordResetEmail.mockResolvedValue(true);

    tryAcquireResetThrottle.mockResolvedValueOnce(true);
    const first = await requestPasswordReset("user@bar.com", "es-AR");

    expect(first).toEqual({ ok: true });
    expect(generatePasswordResetLink).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);

    tryAcquireResetThrottle.mockResolvedValueOnce(false);
    const second = await requestPasswordReset("user@bar.com", "es-AR");

    expect(second).toEqual({ ok: true });
    // Still just the one call from the first (allowed) request — the
    // throttled second request never reaches Firebase or Resend.
    expect(generatePasswordResetLink).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });
});
