import { beforeEach, describe, expect, it, vi } from "vitest";

const findOne = vi.fn();
const updateOne = vi.fn();
const collection = vi.fn(() => ({ findOne, updateOne }));
const db = vi.fn(() => ({ collection }));

vi.mock("./database.service", () => ({ connect: vi.fn() }));

import { connect } from "./database.service";
import { getLikes, toggleLike } from "./like.service";

const mockedConnect = vi.mocked(connect);

const doc = (over: Partial<{ count: number; visitors: string[] }> = {}) => ({
  slug: "post-1",
  count: 7,
  visitors: ["v1"],
  updatedAt: new Date(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedConnect.mockResolvedValue({ db } as unknown as Awaited<
    ReturnType<typeof connect>
  >);
  findOne.mockResolvedValue(null);
  updateOne.mockResolvedValue({ acknowledged: true });
});

describe("getLikes", () => {
  it("resolves to db-unavailable when connect() returns undefined", async () => {
    mockedConnect.mockResolvedValueOnce(undefined);
    await expect(getLikes("post-1", "v1")).resolves.toEqual({
      ok: false,
      reason: "db-unavailable",
    });
  });

  it("resolves to db-unavailable (never rejects) when the query throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    findOne.mockRejectedValueOnce(new Error("connection reset by peer"));
    await expect(getLikes("post-1", "v1")).resolves.toEqual({
      ok: false,
      reason: "db-unavailable",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("returns count and hasLiked for a visitor who liked the post", async () => {
    findOne.mockResolvedValueOnce(doc());
    await expect(getLikes("post-1", "v1")).resolves.toEqual({
      ok: true,
      count: 7,
      hasLiked: true,
    });
  });

  it("returns a legitimate zero when the post has no likes document", async () => {
    findOne.mockResolvedValueOnce(null);
    await expect(getLikes("post-1", "v1")).resolves.toEqual({
      ok: true,
      count: 0,
      hasLiked: false,
    });
  });

  it("reports hasLiked false when no visitorId is supplied", async () => {
    findOne.mockResolvedValueOnce(
      doc({ count: 3, visitors: ["someone-else"] }),
    );
    await expect(getLikes("post-1")).resolves.toEqual({
      ok: true,
      count: 3,
      hasLiked: false,
    });
  });
});

describe("toggleLike", () => {
  it("resolves to db-unavailable when connect() returns undefined", async () => {
    mockedConnect.mockResolvedValueOnce(undefined);
    await expect(toggleLike("post-1", "v1")).resolves.toEqual({
      ok: false,
      reason: "db-unavailable",
    });
  });

  it("resolves to db-unavailable (never rejects) when the write throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    updateOne.mockRejectedValueOnce(new Error("not primary"));
    await expect(toggleLike("post-1", "v1")).resolves.toEqual({
      ok: false,
      reason: "db-unavailable",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("adds a like and upserts on a first-time like", async () => {
    findOne.mockResolvedValueOnce(null);
    await expect(toggleLike("post-1", "v1")).resolves.toEqual({
      ok: true,
      count: 1,
      hasLiked: true,
    });
    expect(updateOne).toHaveBeenCalledWith(
      { slug: "post-1" },
      expect.objectContaining({
        $addToSet: { visitors: "v1" },
        $inc: { count: 1 },
      }),
      { upsert: true },
    );
  });

  it("removes a like when the visitor already liked the post", async () => {
    findOne.mockResolvedValueOnce(doc({ count: 5, visitors: ["v1"] }));
    await expect(toggleLike("post-1", "v1")).resolves.toEqual({
      ok: true,
      count: 4,
      hasLiked: false,
    });
    expect(updateOne).toHaveBeenCalledWith(
      { slug: "post-1" },
      expect.objectContaining({
        $pull: { visitors: "v1" },
        $inc: { count: -1 },
      }),
    );
  });
});
