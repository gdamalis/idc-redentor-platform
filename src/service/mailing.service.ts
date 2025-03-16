import sgMail from "@sendgrid/mail";

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
  console.error("SENDGRID_API_KEY is not defined in environment variables");
}

export const FROM_EMAIL = "info@idcredentor.com";

const DEFAULT_FROM_EMAIL = process.env.FROM_EMAIL ?? FROM_EMAIL;

interface EmailContent {
  to: string | string[];
  from?: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(emailContent: EmailContent): Promise<boolean> {
  try {
    const msg = {
      to: emailContent.to,
      from: emailContent.from ?? DEFAULT_FROM_EMAIL,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    };

    await sgMail.send(msg);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}
