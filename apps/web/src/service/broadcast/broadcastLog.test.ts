import { beforeEach, describe, expect, it, vi } from "vitest";

const updateOne = vi.fn();
const createIndex = vi.fn();
const collection = vi.fn(() => ({ updateOne, createIndex }));
const db = vi.fn(() => ({ collection }));

vi.mock("../database.service", () => ({ connect: vi.fn() }));

import { connect } from "../database.service";
import { claimBroadcast, markFailed, markSent } from "./broadcastLog";

const mockedConnect = vi.mocked(connect);

beforeEach(() => {
  vi.clearAllMocks();
  mockedConnect.mockResolvedValue({ db } as unknown as Awaited<ReturnType<typeof connect>>);
  updateOne.mockResolvedValue({ acknowledged: true });
  createIndex.mockResolvedValue("broadcastId_1");
});

describe("claimBroadcast", () => {
  it("returns 'claimed' for a fresh broadcastId", async () => {
    expect(await claimBroadcast("b1")).toBe("claimed");
    expect(updateOne).toHaveBeenCalledOnce();
  });
  it("returns 'already-sent' on duplicate-key (E11000)", async () => {
    updateOne.mockRejectedValueOnce({ code: 11000 });
    expect(await claimBroadcast("b1")).toBe("already-sent");
  });
  it("returns 'error' when the DB is unavailable", async () => {
    mockedConnect.mockResolvedValueOnce(undefined);
    expect(await claimBroadcast("b1")).toBe("error");
  });
  it("returns 'error' on a non-duplicate DB error", async () => {
    updateOne.mockRejectedValueOnce(new Error("boom"));
    expect(await claimBroadcast("b1")).toBe("error");
  });
});

describe("markSent / markFailed", () => {
  it("markSent sets status sent + campaignId", async () => {
    await markSent("b1", "camp_1");
    expect(updateOne).toHaveBeenCalledWith(
      { broadcastId: "b1" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "sent", campaignId: "camp_1" }) }),
    );
  });
  it("markFailed sets status failed + reason", async () => {
    await markFailed("b1", "send-failed");
    expect(updateOne).toHaveBeenCalledWith(
      { broadcastId: "b1" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "failed", reason: "send-failed" }) }),
    );
  });
});
