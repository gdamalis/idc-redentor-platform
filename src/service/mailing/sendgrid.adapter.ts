import sgMail from "@sendgrid/mail";
import type { EmailAdapter, EmailContent } from "./types";

export function createSendGridAdapter(): EmailAdapter {
  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY is not defined in environment variables");
  }

  sgMail.setApiKey(apiKey);

  return {
    async sendEmail(content: EmailContent): Promise<boolean> {
      try {
        const msg = {
          to: content.to,
          from: content.from!,
          subject: content.subject,
          text: content.text,
          html: content.html,
        };

        await sgMail.send(msg);
        return true;
      } catch (error) {
        console.error("Error sending email via SendGrid:", error);
        return false;
      }
    },
  };
}

