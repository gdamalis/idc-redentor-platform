import { createResendAdapter } from "./resend.adapter";
import type { EmailAdapter, EmailContent } from "./types";

export const DEFAULT_FROM_EMAIL =
  process.env.FROM_EMAIL ?? "no-reply@notifications.idcredentor.org";

let adapter: EmailAdapter | null = null;

export async function sendEmail(content: EmailContent): Promise<boolean> {
  adapter ??= createResendAdapter();

  return adapter.sendEmail({
    ...content,
    from: content.from ?? DEFAULT_FROM_EMAIL,
  });
}

export type { EmailContent } from "./types";
