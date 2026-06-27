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
        await resend.emails.send({
          to: content.to,
          from: content.from!,
          subject: content.subject,
          text: content.text,
          html: content.html,
        });
        return true;
      } catch (error) {
        console.error("Error sending email via Resend:", error);
        return false;
      }
    },
  };
}

