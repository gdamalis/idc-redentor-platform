import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleContactFormSubmission } from "@src/components/features/contact-form/contactFormAction";
import { POST } from "./route";

const addSubscriberMock = vi.fn();
const sendContactFormMock = vi.fn();
const sendContactFormEmailMock = vi.fn();

vi.mock("@src/service/subscribe.service", () => ({
  addSubscriber: (...args: unknown[]) => addSubscriberMock(...args),
}));

vi.mock("@src/service/contact.service", () => ({
  sendContactForm: (...args: unknown[]) => sendContactFormMock(...args),
}));

vi.mock("@src/service/contact-form-email.service", () => ({
  sendContactFormEmail: (...args: unknown[]) =>
    sendContactFormEmailMock(...args),
}));

// Zod 4 email regression net (ICR-194): exercises the live `/api/subscribe` POST route and
// `handleContactFormSubmission` directly so changes to production validation cannot drift.
const VALID_EMAILS = [
  "ana@example.com",
  "ana.maria@example.com",
  "ana+news@example.com",
  "ana_maria-1@example.com",
  "user123@mail.example.com.ar",
  "pastor@iglesia-redentor.org",
  "someone@example.museum",
  "someone@example.photography",
  "UPPER@EXAMPLE.COM",
];

const INVALID_EMAILS = [
  "plainaddress",
  "@example.com",
  "ana@",
  "ana@@example.com",
  "ana example@x.com",
];

describe("subscribe route & contact form email validation under zod 4", () => {
  beforeEach(() => {
    addSubscriberMock.mockReset().mockResolvedValue({ ok: true });
    sendContactFormMock.mockReset().mockResolvedValue({ success: true });
    sendContactFormEmailMock.mockReset().mockResolvedValue(true);
  });

  it.each([...VALID_EMAILS, "  padded@example.com  "])(
    "POST /api/subscribe accepts %s",
    async (email) => {
      const res = await POST(
        new Request("http://localhost/api/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        }),
      );
      expect(res.status).toBe(200);
      expect(addSubscriberMock).toHaveBeenCalledWith(email.trim(), "es-AR");
    },
  );

  it.each(["", ...INVALID_EMAILS])(
    "POST /api/subscribe rejects %j",
    async (email) => {
      const res = await POST(
        new Request("http://localhost/api/subscribe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        }),
      );
      expect(res.status).toBe(400);
      expect(addSubscriberMock).not.toHaveBeenCalled();
    },
  );

  it.each(VALID_EMAILS)(
    "handleContactFormSubmission accepts %s",
    async (email) => {
      const fd = new FormData();
      fd.append("name", "Ana");
      fd.append("email", email);
      fd.append("subject", "Consulta");
      fd.append("message", "Hola");
      const result = await handleContactFormSubmission(null, fd, [
        "name",
        "email",
        "subject",
        "message",
      ]);
      expect(result.success).toBe(true);
      expect(sendContactFormMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each(INVALID_EMAILS)(
    "handleContactFormSubmission rejects %j",
    async (email) => {
      const fd = new FormData();
      fd.append("name", "Ana");
      fd.append("email", email);
      fd.append("subject", "Consulta");
      fd.append("message", "Hola");
      const result = await handleContactFormSubmission(null, fd, [
        "name",
        "email",
        "subject",
        "message",
      ]);
      expect(result.success).toBe(false);
      expect(sendContactFormMock).not.toHaveBeenCalled();
    },
  );
});
