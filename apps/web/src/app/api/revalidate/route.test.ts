import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lib/content/cache", () => ({ revalidateSiteContent: vi.fn() }));
vi.mock("@src/service/post-notification.service", () => ({
  notifyOnPublish: vi.fn(),
}));

import { revalidateSiteContent } from "@lib/content/cache";
import { notifyOnPublish } from "@src/service/post-notification.service";
import { POST } from "./route";

const SECRET = "s3cret";
const VALID_OBJECT_ID = "507f1f77bcf86cd799439011";

const req = (body: unknown, secret: string | null = SECRET) =>
  new Request("http://x/api/revalidate", {
    method: "POST",
    headers: secret === null ? {} : { "x-vercel-reval-key": secret },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("WEBSITE_REVALIDATE_SECRET", SECRET);
  vi.stubEnv("CONTENTFUL_REVALIDATE_SECRET", "");
  vi.stubEnv("CONTENT_PUBLISH_EMAILS", "false");
  vi.mocked(revalidateSiteContent).mockReset();
  vi.mocked(notifyOnPublish).mockReset();
  vi.mocked(notifyOnPublish).mockResolvedValue({
    type: "post",
    handled: true,
    perLocale: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/revalidate", () => {
  it("returns 401 on bad secret without revalidating or notifying", async () => {
    const res = await POST(req({}, "wrong"));
    expect(res.status).toBe(401);
    expect(vi.mocked(revalidateSiteContent)).not.toHaveBeenCalled();
    expect(vi.mocked(notifyOnPublish)).not.toHaveBeenCalled();
  });

  it("accepts CONTENTFUL_REVALIDATE_SECRET as transitional fallback during env rotation", async () => {
    vi.stubEnv("WEBSITE_REVALIDATE_SECRET", "");
    vi.stubEnv("CONTENTFUL_REVALIDATE_SECRET", "legacy-secret");

    const res = await POST(
      req({ type: "post", id: VALID_OBJECT_ID, notify: false }, "legacy-secret"),
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(revalidateSiteContent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyOnPublish)).not.toHaveBeenCalled();
  });

  it("401s when both WEBSITE_REVALIDATE_SECRET and CONTENTFUL_REVALIDATE_SECRET are unset", async () => {
    vi.stubEnv("WEBSITE_REVALIDATE_SECRET", "");
    vi.stubEnv("CONTENTFUL_REVALIDATE_SECRET", "");

    for (const secret of ["undefined", "", "anything", null]) {
      const res = await POST(req({}, secret));
      expect(res.status).toBe(401);
    }

    expect(vi.mocked(revalidateSiteContent)).not.toHaveBeenCalled();
    expect(vi.mocked(notifyOnPublish)).not.toHaveBeenCalled();
  });

  it("revalidates and notifies on post/sermon publish ONLY when CONTENT_PUBLISH_EMAILS=true and notify=true", async () => {
    vi.stubEnv("CONTENT_PUBLISH_EMAILS", "true");

    const resPost = await POST(
      req({ type: "post", id: VALID_OBJECT_ID, notify: true }),
    );
    expect(resPost.status).toBe(200);
    expect(vi.mocked(revalidateSiteContent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyOnPublish)).toHaveBeenCalledWith({
      type: "post",
      id: VALID_OBJECT_ID,
    });

    const resSermon = await POST(
      req({ type: "sermon", id: VALID_OBJECT_ID, notify: true }),
    );
    expect(resSermon.status).toBe(200);
    expect(vi.mocked(notifyOnPublish)).toHaveBeenCalledWith({
      type: "sermon",
      id: VALID_OBJECT_ID,
    });
  });

  it("revalidates but NEVER notifies when CONTENT_PUBLISH_EMAILS is unset or not 'true'", async () => {
    vi.stubEnv("CONTENT_PUBLISH_EMAILS", "false");

    const res = await POST(
      req({ type: "post", id: VALID_OBJECT_ID, notify: true }),
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(revalidateSiteContent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyOnPublish)).not.toHaveBeenCalled();
  });

  it("revalidates but NEVER notifies when notify is false or omitted (e.g. edits or pre-migration republish)", async () => {
    vi.stubEnv("CONTENT_PUBLISH_EMAILS", "true");

    await POST(req({ type: "post", id: VALID_OBJECT_ID, notify: false }));
    await POST(req({ type: "post", id: VALID_OBJECT_ID }));
    await POST(req({ type: "post", id: VALID_OBJECT_ID, notify: "true" }));

    expect(vi.mocked(revalidateSiteContent)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(notifyOnPublish)).not.toHaveBeenCalled();
  });

  it("revalidates but ignores non-notifiable types, invalid ObjectIds, and legacy Contentful payloads", async () => {
    vi.stubEnv("CONTENT_PUBLISH_EMAILS", "true");

    await POST(req({ type: "section", id: VALID_OBJECT_ID, notify: true }));
    await POST(req({ type: "post", id: "not-a-hex-id", notify: true }));
    await POST(
      req({ sys: { id: "cf-entry-1", contentType: { sys: { id: "blogPostPage" } } } }),
    );
    await POST(req({ hello: "world" }));

    expect(vi.mocked(revalidateSiteContent)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(notifyOnPublish)).not.toHaveBeenCalled();
  });

  it("still returns 200 and revalidates when notifyOnPublish throws", async () => {
    vi.stubEnv("CONTENT_PUBLISH_EMAILS", "true");
    vi.mocked(notifyOnPublish).mockRejectedValue(new Error("boom"));

    const res = await POST(
      req({ type: "post", id: VALID_OBJECT_ID, notify: true }),
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(revalidateSiteContent)).toHaveBeenCalledTimes(1);
  });
});
