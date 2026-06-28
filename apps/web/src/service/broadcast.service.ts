import { renderTemplate } from "@src/templates/template-engine";
import { BROADCAST_CHROME } from "@src/templates/broadcast.template";
import {
  broadcastInputSchema,
  type BroadcastInput,
  type BroadcastResult,
} from "./broadcast/types";
import { claimBroadcast, markFailed, markSent } from "./broadcast/broadcastLog";
import {
  MailchimpConfigError,
  isMailchimpConfigured,
  sendCampaign,
} from "./broadcast/mailchimpCampaign";

/**
 * Send ONE email to all current newsletter subscribers via a Mailchimp campaign.
 * Idempotent on `broadcastId`. Never throws — returns a typed result.
 */
export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastResult> {
  const parsed = broadcastInputSchema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    console.error(`[broadcast] invalid-input: ${fields}`);
    return { status: "failed", reason: "invalid-input" };
  }
  const { broadcastId, subject, html, text, locale } = parsed.data;

  if (!isMailchimpConfigured()) {
    console.error(`[broadcast] mailchimp-not-configured for ${broadcastId}`);
    return { status: "failed", reason: "mailchimp-not-configured" };
  }

  const claim = await claimBroadcast(broadcastId);
  if (claim === "already-sent") return { status: "skipped", reason: "already-sent" };
  if (claim === "error") return { status: "failed", reason: "dedupe-unavailable" };

  try {
    const chrome = BROADCAST_CHROME[locale];
    const wrappedHtml = renderTemplate("broadcast", {
      lang: locale,
      body: html,
      logoAlt: chrome.logoAlt,
      footer: chrome.footer,
    });

    const campaignId = await sendCampaign({
      subjectLine: subject,
      title: `broadcast ${broadcastId}`,
      html: wrappedHtml,
      text,
    });

    await markSent(broadcastId, campaignId);
    console.log(`[broadcast] sent ${broadcastId} (${locale}) campaign=${campaignId}`);
    return { status: "sent", campaignId };
  } catch (error) {
    const reason = error instanceof MailchimpConfigError ? "mailchimp-not-configured" : "send-failed";
    console.error(
      `[broadcast] ${reason} for ${broadcastId}:`,
      error instanceof Error ? error.message : String(error),
    );
    await markFailed(broadcastId, reason);
    return { status: "failed", reason };
  }
}
