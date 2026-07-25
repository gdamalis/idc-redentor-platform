import { Resend } from "resend";
import type { EmailAdapter, EmailContent } from "./types";

export function createResendAdapter(): EmailAdapter {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not defined in environment variables");
  }

  const resend = new Resend(apiKey);

  return {
    async sendEmail(content: EmailContent): Promise<boolean> {
      try {
        // `resend.emails.send()` does NOT reject on an API-level failure —
        // it always resolves with `{ data, error }` (installed `resend`
        // `.d.ts`: `CreateEmailResponse = { data; error: null } | { data:
        // null; error: ErrorResponse }`). The `error` field must be
        // inspected explicitly, or a failed send silently reports success.
        const { error } = await resend.emails.send({
          to: content.to,
          from: content.from!,
          subject: content.subject,
          text: content.text,
          html: content.html,
        });

        if (error) {
          console.error("Error sending email via Resend:", error);
          return false;
        }

        return true;
      } catch (error) {
        console.error("Error sending email via Resend:", error);
        return false;
      }
    },
  };
}
