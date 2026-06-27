export interface EmailContent {
  to: string | string[];
  from?: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailAdapter {
  sendEmail(content: EmailContent): Promise<boolean>;
}

