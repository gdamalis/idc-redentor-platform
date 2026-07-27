import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EmailContent } from "./types";

const send = vi.fn();
// A real `function` expression (not an arrow function) so `new Resend(...)`
// works: arrow functions can't be used as constructors, and the adapter
// under test does `new Resend(apiKey)`.
const ResendMock = vi.fn(function Resend() {
  return { emails: { send } };
});

vi.mock("resend", () => ({ Resend: ResendMock }));

const testContent: EmailContent = {
  to: "user@bar.com",
  from: "no-reply@example.org",
  subject: "Subject",
  text: "text",
  html: "<p>html</p>",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_API_KEY", "test-api-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createResendAdapter", () => {
  it("returns true on a successful send (data present, error null)", async () => {
    const { createResendAdapter } = await import("./resend.adapter");
    send.mockResolvedValueOnce({ data: { id: "email-1" }, error: null });

    const result = await createResendAdapter().sendEmail(testContent);

    expect(result).toBe(true);
  });

  it("returns false and logs when Resend RESOLVES with an API-level error (it never rejects for these)", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { createResendAdapter } = await import("./resend.adapter");
    send.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Invalid from address",
        statusCode: 422,
        name: "invalid_from_address",
      },
    });

    const result = await createResendAdapter().sendEmail(testContent);

    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("returns false and logs when the send call itself throws (e.g. network failure)", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { createResendAdapter } = await import("./resend.adapter");
    send.mockRejectedValueOnce(new Error("network blip"));

    const result = await createResendAdapter().sendEmail(testContent);

    expect(result).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
