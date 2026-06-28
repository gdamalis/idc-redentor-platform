import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./broadcast/broadcastLog", () => ({
  claimBroadcast: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
}));
vi.mock("./broadcast/mailchimpCampaign", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./broadcast/mailchimpCampaign")>();
  return { ...actual, sendCampaign: vi.fn(), isMailchimpConfigured: vi.fn() };
});

import { sendBroadcast } from "./broadcast.service";
import { claimBroadcast, markFailed, markSent } from "./broadcast/broadcastLog";
import { isMailchimpConfigured, sendCampaign } from "./broadcast/mailchimpCampaign";

const input = {
  broadcastId: "blog:hola:es-AR",
  subject: "Nuevo post",
  html: "<p>cuerpo</p>",
  text: "cuerpo",
  locale: "es-AR" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = "https://www.idcredentor.org";
  process.env.MAILCHIMP_API_KEY = "SECRET_KEY_123";
  vi.mocked(isMailchimpConfigured).mockReturnValue(true);
  vi.mocked(claimBroadcast).mockResolvedValue("claimed");
  vi.mocked(sendCampaign).mockResolvedValue("camp_1");
});

describe("sendBroadcast", () => {
  it("sends and marks sent on the happy path", async () => {
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "sent", campaignId: "camp_1" });
    expect(sendCampaign).toHaveBeenCalledOnce();
    expect(markSent).toHaveBeenCalledWith("blog:hola:es-AR", "camp_1");
  });

  it("skips without sending when already sent", async () => {
    vi.mocked(claimBroadcast).mockResolvedValue("already-sent");
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "skipped", reason: "already-sent" });
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("fails safe (no send) when the dedupe store is unavailable", async () => {
    vi.mocked(claimBroadcast).mockResolvedValue("error");
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "failed", reason: "dedupe-unavailable" });
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("marks failed and returns failed when the transport throws", async () => {
    vi.mocked(sendCampaign).mockRejectedValueOnce(new Error("api down"));
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "failed", reason: "send-failed" });
    expect(markFailed).toHaveBeenCalledWith("blog:hola:es-AR", "send-failed");
  });

  it("rejects invalid input without claiming or sending", async () => {
    const result = await sendBroadcast({ ...input, subject: "" });
    expect(result).toEqual({ status: "failed", reason: "invalid-input" });
    expect(claimBroadcast).not.toHaveBeenCalled();
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("returns mailchimp-not-configured without claiming", async () => {
    vi.mocked(isMailchimpConfigured).mockReturnValue(false);
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "failed", reason: "mailchimp-not-configured" });
    expect(claimBroadcast).not.toHaveBeenCalled();
  });

  it("never leaks the API key to the console", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(sendCampaign).mockRejectedValueOnce(new Error("api down"));
    await sendBroadcast(input);
    const all = [...errorSpy.mock.calls, ...logSpy.mock.calls].flat().map(String).join(" ");
    expect(all).not.toContain("SECRET_KEY_123");
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
