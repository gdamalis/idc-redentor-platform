import {
  BROADCAST_LOCALES,
  type BroadcastLocale,
} from "@src/service/broadcast/types";
import { isResendBroadcastConfigured } from "@src/service/broadcast/resendBroadcast";
import { sendBroadcast } from "@src/service/broadcast.service";
import {
  buildPostNotificationEmail,
  type PostNotificationContent,
} from "@src/service/post-notification.email";
import { getBlogPostPageById } from "@lib/content/getBlogPostPages";
import { getSermonById } from "@lib/content/getSermons";
import type { BlogPostView, SermonView } from "@lib/content/types";

export interface PublishEvent {
  readonly type: string;
  readonly id: string;
}

type LocaleStatus =
  | "sent"
  | "skipped"
  | "failed"
  | "no-content"
  | "not-configured";

export interface PostNotificationSummary {
  readonly type: string;
  readonly handled: boolean;
  readonly perLocale: Array<{
    locale: BroadcastLocale;
    status: LocaleStatus;
    reason?: string;
  }>;
}

interface ContentHandler {
  readonly kind: "blog" | "sermon";
  readonly getById: (
    id: string,
    locale: string,
  ) => Promise<BlogPostView | SermonView | undefined>;
  readonly toContent: (
    entry: BlogPostView | SermonView | undefined,
  ) => PostNotificationContent | null;
}

const blogContent = (
  entry: BlogPostView | SermonView | undefined,
): PostNotificationContent | null => {
  const post = entry as BlogPostView | undefined;
  return post?.title
    ? {
        title: post.title,
        slug: post.slug,
        excerpt: post.subtitle ?? post.seoDescription ?? "",
        imageUrl: post.featuredImage?.url,
      }
    : null;
};

const sermonContent = (
  entry: BlogPostView | SermonView | undefined,
): PostNotificationContent | null => {
  const sermon = entry as SermonView | undefined;
  return sermon?.title
    ? {
        title: sermon.title,
        slug: sermon.slug,
        excerpt: sermon.excerpt ?? "",
        imageUrl: sermon.featuredImage?.url,
      }
    : null;
};

const HANDLERS: Readonly<Record<string, ContentHandler>> = {
  post: { kind: "blog", getById: getBlogPostPageById, toContent: blogContent },
  sermon: { kind: "sermon", getById: getSermonById, toContent: sermonContent },
};

async function notifyLocale(
  handler: ContentHandler,
  entryId: string,
  locale: BroadcastLocale,
): Promise<{ locale: BroadcastLocale; status: LocaleStatus; reason?: string }> {
  try {
    if (!isResendBroadcastConfigured(locale)) {
      return { locale, status: "not-configured" };
    }

    const entry = await handler.getById(entryId, locale);
    const content = handler.toContent(entry);
    if (!content) return { locale, status: "no-content" };

    const { subject, html, text } = buildPostNotificationEmail({
      kind: handler.kind,
      content,
      locale,
    });
    const broadcastId = `${handler.kind}:${entryId}:${locale}`;
    const result = await sendBroadcast({
      broadcastId,
      subject,
      html,
      text,
      locale,
    });
    return { locale, status: result.status, reason: result.reason };
  } catch (e) {
    console.error(
      `[post-notification] ${handler.kind} ${entryId} ${locale}:`,
      e instanceof Error ? e.message : String(e),
    );
    return { locale, status: "failed", reason: "exception" };
  }
}

export async function notifyOnPublish(
  event: PublishEvent,
): Promise<PostNotificationSummary> {
  const handler = HANDLERS[event.type];
  if (!handler) {
    return { type: event.type, handled: false, perLocale: [] };
  }

  const perLocale: Array<{
    locale: BroadcastLocale;
    status: LocaleStatus;
    reason?: string;
  }> = [];
  for (const locale of BROADCAST_LOCALES) {
    perLocale.push(await notifyLocale(handler, event.id, locale));
  }

  return { type: event.type, handled: true, perLocale };
}
