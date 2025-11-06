import type { EmailAdapter, EmailContent } from "./mailing/types";
import { createSendGridAdapter } from "./mailing/sendgrid.adapter";
import { createResendAdapter } from "./mailing/resend.adapter";

export const FROM_EMAIL = "no-reply@notifications.idcredentor.com";

const DEFAULT_FROM_EMAIL = process.env.FROM_EMAIL ?? FROM_EMAIL;

function createEmailAdapter(): EmailAdapter {
  const provider = process.env.MAIL_PROVIDER;

  if (!provider) {
    throw new Error("MAIL_PROVIDER is not defined in environment variables");
  }

  switch (provider) {
    case "sendgrid":
      return createSendGridAdapter();
    case "resend":
      return createResendAdapter();
    default:
      throw new Error(
        `Invalid MAIL_PROVIDER: ${provider}. Must be 'sendgrid' or 'resend'`
      );
  }
}

// Initialize the adapter once
const emailAdapter = createEmailAdapter();

export async function sendEmail(emailContent: EmailContent): Promise<boolean> {
  const contentWithDefaults = {
    ...emailContent,
    from: emailContent.from ?? DEFAULT_FROM_EMAIL,
  };

  return emailAdapter.sendEmail(contentWithDefaults);
}
