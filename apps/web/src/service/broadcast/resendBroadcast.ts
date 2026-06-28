import { Resend } from "resend";
import { FROM_EMAIL } from "../mailing.service";

export const BROADCAST_REPLY_TO = "info@idcredentor.org";
export const BROADCAST_FROM_NAME = "Iglesia de Cristo Redentor";

export class ResendConfigError extends Error {
  constructor() {
    super("resend-not-configured");
    this.name = "ResendConfigError";
  }
}

export interface BroadcastParams {
  subject: string;
  /** Internal broadcast name (not shown to subscribers; carries no PII). */
  name: string;
  html: string;
  text: string;
}

export function isResendBroadcastConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID);
}

export async function createAndSendBroadcast(params: BroadcastParams): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) {
    throw new ResendConfigError();
  }

  const from = `${BROADCAST_FROM_NAME} <${process.env.FROM_EMAIL ?? FROM_EMAIL}>`;
  const resend = new Resend(apiKey);

  const { data: created, error: createError } = await resend.broadcasts.create({
    audienceId, // if no-deprecated lint flags this, use: segmentId: audienceId
    from,
    replyTo: BROADCAST_REPLY_TO,
    subject: params.subject,
    html: params.html,
    text: params.text,
    name: params.name,
  });
  if (createError ?? !created) {
    throw new Error(`broadcast create failed: ${createError?.message ?? "no data returned"}`);
  }

  const { error: sendError } = await resend.broadcasts.send(created.id);
  if (sendError) {
    throw new Error(`broadcast send failed: ${sendError.message}`);
  }

  return created.id;
}
