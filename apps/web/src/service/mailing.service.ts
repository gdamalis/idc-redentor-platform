import type { EmailAdapter, EmailContent } from "./mailing/types";
import { createSendGridAdapter } from "./mailing/sendgrid.adapter";
import { createResendAdapter } from "./mailing/resend.adapter";

export const FROM_EMAIL = "no-reply@notifications.idcredentor.org";

const DEFAULT_FROM_EMAIL = process.env.FROM_EMAIL ?? FROM_EMAIL;

let emailAdapter: EmailAdapter | null = null;

function getEmailAdapter(): EmailAdapter {
  if (emailAdapter) return emailAdapter;

  const provider = process.env.MAIL_PROVIDER;

  if (!provider) {
    throw new Error("MAIL_PROVIDER is not defined in environment variables");
  }

  switch (provider) {
    case "sendgrid":
      emailAdapter = createSendGridAdapter();
      break;
    case "resend":
      emailAdapter = createResendAdapter();
      break;
    default:
      throw new Error(
        `Invalid MAIL_PROVIDER: ${provider}. Must be 'sendgrid' or 'resend'`
      );
  }

  return emailAdapter;
}

export async function sendEmail(emailContent: EmailContent): Promise<boolean> {
  const contentWithDefaults = {
    ...emailContent,
    from: emailContent.from ?? DEFAULT_FROM_EMAIL,
  };

  return getEmailAdapter().sendEmail(contentWithDefaults);
}
