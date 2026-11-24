import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlogPostView, SermonView } from "@lib/content/types";

vi.mock("@lib/content/getBlogPostPages", () => ({
  getBlogPostPageById: vi.fn(),
}));
vi.mock("@lib/content/getSermons", () => ({ getSermonById: vi.fn() }));
vi.mock("@src/service/broadcast.service", () => ({ sendBroadcast: vi.fn() }));
vi.mock("@src/service/broadcast/resendBroadcast", () => ({
  isResendBroadcastConfigured: vi.fn(),
}));

import { getBlogPostPageById } from "@lib/content/getBlogPostPages";
import { getSermonById } from "@lib/content/getSermons";
import { sendBroadcast } from "@src/service/broadcast.service";
import { isResendBroadcastConfigured } from "@src/service/broadcast/resendBroadcast";
import { notifyOnPublish } from "./post-notification.service";

afterEach(() => vi.clearAllMocks());

const ENTRY_ID = "507f1f77bcf86cd799439011";

/** Minimal blog post fixture — only fields the orchestrator reads */
const blog = (overrides: Partial<BlogPostView> = {}): BlogPostView =>
  ({
    title: "Hola",
    slug: "hola",
    subtitle: "s",
    ...overrides,
  }) as unknown as BlogPostView;

/** Minimal sermon fixture — only fields the orchestrator reads */
const sermon = (overrides: Partial<SermonView> = {}): SermonView =>
  ({ title: "S", slug: "s", excerpt: "e", ...overrides }) as unknown as SermonView;

describe("notifyOnPublish", () => {
  it("ignores unsupported content types including legacy Contentful type ids (no send)", async () => {
    for (const type of ["page", "section", "blogPostPage"]) {
      const out = await notifyOnPublish({ type, id: ENTRY_ID });
      expect(out.handled).toBe(false);
    }
    expect(sendBroadcast).not.toHaveBeenCalled();
  });

  it("sends one broadcast per configured locale with content, using kind:id:locale", async () => {
    vi.mocked(isResendBroadcastConfigured).mockReturnValue(true);
    vi.mocked(getBlogPostPageById).mockImplementation(async (_id, locale) =>
      blog({ title: locale === "es-AR" ? "Hola" : "Hello" }),
    );
    vi.mocked(sendBroadcast).mockResolvedValue({ status: "sent" });
    const out = await notifyOnPublish({ type: "post", id: ENTRY_ID });
    expect(sendBroadcast).toHaveBeenCalledTimes(2);
    expect(sendBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcastId: `blog:${ENTRY_ID}:es-AR`,
        locale: "es-AR",
      }),
    );
    expect(sendBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        broadcastId: `blog:${ENTRY_ID}:en-US`,
        locale: "en-US",
      }),
    );
    expect(out.handled).toBe(true);
  });

  it("preserves already-sent idempotency status from broadcast_log", async () => {
    vi.mocked(isResendBroadcastConfigured).mockReturnValue(true);
    vi.mocked(getBlogPostPageById).mockResolvedValue(blog());
    vi.mocked(sendBroadcast).mockResolvedValue({
      status: "skipped",
      reason: "already-sent",
    });

    const out = await notifyOnPublish({ type: "post", id: ENTRY_ID });
    expect(out.handled).toBe(true);
    expect(out.perLocale.every((p) => p.status === "skipped")).toBe(true);
  });

  it("skips a locale with no content", async () => {
    vi.mocked(isResendBroadcastConfigured).mockReturnValue(true);
    vi.mocked(getBlogPostPageById).mockImplementation(async (_id, locale) =>
      locale === "es-AR" ? blog() : undefined,
    );
    vi.mocked(sendBroadcast).mockResolvedValue({ status: "sent" });
    const out = await notifyOnPublish({ type: "post", id: ENTRY_ID });
    expect(sendBroadcast).toHaveBeenCalledTimes(1);
    expect(out.perLocale.find((p) => p.locale === "en-US")?.status).toBe(
      "no-content",
    );
  });

  it("skips a locale whose audience is not configured", async () => {
    vi.mocked(isResendBroadcastConfigured).mockImplementation(
      (l: string) => l === "es-AR",
    );
    vi.mocked(getBlogPostPageById).mockResolvedValue(blog());
    vi.mocked(sendBroadcast).mockResolvedValue({ status: "sent" });
    await notifyOnPublish({ type: "post", id: ENTRY_ID });
    expect(sendBroadcast).toHaveBeenCalledTimes(1);
  });

  it("isolates a getter failure to that locale (never throws)", async () => {
    vi.mocked(isResendBroadcastConfigured).mockReturnValue(true);
    vi.mocked(getBlogPostPageById)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue(blog({ title: "Hello" }));
    vi.mocked(sendBroadcast).mockResolvedValue({ status: "sent" });
    const out = await notifyOnPublish({ type: "post", id: ENTRY_ID });
    expect(out.perLocale.some((p) => p.status === "failed")).toBe(true);
  });

  it("uses the sermon getter + sermon:id:locale id", async () => {
    vi.mocked(isResendBroadcastConfigured).mockReturnValue(true);
    vi.mocked(getSermonById).mockResolvedValue(sermon());
    vi.mocked(sendBroadcast).mockResolvedValue({ status: "sent" });
    await notifyOnPublish({ type: "sermon", id: ENTRY_ID });
    expect(sendBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ broadcastId: `sermon:${ENTRY_ID}:es-AR` }),
    );
  });
});
