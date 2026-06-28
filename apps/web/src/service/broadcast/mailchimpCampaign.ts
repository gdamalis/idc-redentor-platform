import mailchimp from "@mailchimp/mailchimp_marketing";

export const BROADCAST_REPLY_TO = "info@idcredentor.org";

export class MailchimpConfigError extends Error {
  constructor() {
    super("mailchimp-not-configured");
    this.name = "MailchimpConfigError";
  }
}

export interface CampaignParams {
  subjectLine: string;
  /** Internal campaign name (not shown to subscribers; carries no PII). */
  title: string;
  html: string;
  text: string;
}

export function isMailchimpConfigured(): boolean {
  return Boolean(
    process.env.MAILCHIMP_API_KEY &&
      process.env.MAILCHIMP_API_SERVER &&
      process.env.MAILCHIMP_AUDIENCE_ID &&
      process.env.MAILCHIMP_FROM_NAME,
  );
}

export async function sendCampaign(params: CampaignParams): Promise<string> {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const server = process.env.MAILCHIMP_API_SERVER;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const fromName = process.env.MAILCHIMP_FROM_NAME;
  if (!apiKey || !server || !audienceId || !fromName) {
    throw new MailchimpConfigError();
  }

  mailchimp.setConfig({ apiKey, server });

  const created = await mailchimp.campaigns.create({
    type: "regular",
    recipients: { list_id: audienceId },
    settings: {
      subject_line: params.subjectLine,
      title: params.title,
      from_name: fromName,
      reply_to: BROADCAST_REPLY_TO,
    },
  } as Parameters<typeof mailchimp.campaigns.create>[0]);

  const campaignId = (created as { id: string }).id;

  await mailchimp.campaigns.setContent(campaignId, {
    html: params.html,
    plain_text: params.text,
  } as Parameters<typeof mailchimp.campaigns.setContent>[1]);

  await mailchimp.campaigns.send(campaignId);

  return campaignId;
}
