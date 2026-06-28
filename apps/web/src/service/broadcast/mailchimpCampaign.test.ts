import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { create, setContent, send, setConfig } = vi.hoisted(() => ({
  create: vi.fn(),
  setContent: vi.fn(),
  send: vi.fn(),
  setConfig: vi.fn(),
}));

vi.mock("@mailchimp/mailchimp_marketing", () => ({
  default: { setConfig, campaigns: { create, setContent, send } },
}));

import {
  BROADCAST_REPLY_TO,
  MailchimpConfigError,
  isMailchimpConfigured,
  sendCampaign,
} from "./mailchimpCampaign";

const ENV = {
  MAILCHIMP_API_KEY: "SECRET_KEY_123",
  MAILCHIMP_API_SERVER: "us21",
  MAILCHIMP_AUDIENCE_ID: "aud_1",
  MAILCHIMP_FROM_NAME: "Iglesia de Cristo Redentor",
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(process.env, ENV);
  create.mockResolvedValue({ id: "camp_1" });
  setContent.mockResolvedValue({});
  send.mockResolvedValue({});
});
afterEach(() => {
  for (const k of Object.keys(ENV))
    delete (process.env as Record<string, string | undefined>)[k];
});

describe("isMailchimpConfigured", () => {
  it("is true when all vars are set", () => expect(isMailchimpConfigured()).toBe(true));
  it("is false when MAILCHIMP_FROM_NAME is missing", () => {
    delete (process.env as Record<string, string | undefined>).MAILCHIMP_FROM_NAME;
    expect(isMailchimpConfigured()).toBe(false);
  });
});

describe("sendCampaign", () => {
  it("creates, sets content, sends, returns the campaignId", async () => {
    const id = await sendCampaign({ subjectLine: "S", title: "broadcast b1", html: "<p>x</p>", text: "x" });
    expect(id).toBe("camp_1");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "regular",
        recipients: { list_id: "aud_1" },
        settings: expect.objectContaining({
          subject_line: "S",
          title: "broadcast b1",
          from_name: "Iglesia de Cristo Redentor",
          reply_to: BROADCAST_REPLY_TO,
        }),
      }),
    );
    expect(setContent).toHaveBeenCalledWith("camp_1", { html: "<p>x</p>", plain_text: "x" });
    expect(send).toHaveBeenCalledWith("camp_1");
  });

  it("throws MailchimpConfigError and does not call the API when unconfigured", async () => {
    delete (process.env as Record<string, string | undefined>).MAILCHIMP_FROM_NAME;
    await expect(
      sendCampaign({ subjectLine: "S", title: "t", html: "h", text: "t" }),
    ).rejects.toBeInstanceOf(MailchimpConfigError);
    expect(create).not.toHaveBeenCalled();
  });

  it("propagates a transport error", async () => {
    create.mockRejectedValueOnce(new Error("api down"));
    await expect(
      sendCampaign({ subjectLine: "S", title: "t", html: "h", text: "t" }),
    ).rejects.toThrow("api down");
  });
});
