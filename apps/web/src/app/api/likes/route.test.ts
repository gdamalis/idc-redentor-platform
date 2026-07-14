import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getLikes = vi.hoisted(() => vi.fn());
const toggleLike = vi.hoisted(() => vi.fn());
const cookieGet = vi.hoisted(() => vi.fn());

vi.mock("@src/service/like.service", () => ({ getLikes, toggleLike }));
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: cookieGet }),
}));

import { GET, POST } from "./route";

const getReq = (qs: string) => new NextRequest(`http://x/api/likes${qs}`);
const postReq = (body: unknown) =>
  new NextRequest("http://x/api/likes", {
    method: "POST",
    body: JSON.stringify(body),
  });
const rawPostReq = (body: string) =>
  new NextRequest("http://x/api/likes", { method: "POST", body });

beforeEach(() => {
  vi.clearAllMocks();
  cookieGet.mockReturnValue({ value: "visitor-1" });
});

describe("GET /api/likes", () => {
  it("returns 503 — not 500 — and no fabricated count when the DB is unavailable", async () => {
    getLikes.mockResolvedValue({ ok: false, reason: "db-unavailable" });
    const res = await GET(getReq("?slug=post-1"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: "Service Unavailable" });
    expect(body).not.toHaveProperty("count");
  });

  it("returns exactly { count, hasLiked } — the ok discriminant never leaks", async () => {
    getLikes.mockResolvedValue({ ok: true, count: 7, hasLiked: true });
    const res = await GET(getReq("?slug=post-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 7, hasLiked: true });
  });

  it("returns 400 when slug is missing, without calling the service", async () => {
    const res = await GET(getReq(""));
    expect(res.status).toBe(400);
    expect(getLikes).not.toHaveBeenCalled();
  });
});

describe("POST /api/likes", () => {
  it("returns 503 and does not mint a visitor cookie when the DB is unavailable", async () => {
    cookieGet.mockReturnValue(undefined); // brand-new visitor
    toggleLike.mockResolvedValue({ ok: false, reason: "db-unavailable" });
    const res = await POST(postReq({ slug: "post-1" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Service Unavailable" });
    expect(res.cookies.get("_visitor_id")).toBeUndefined();
  });

  it("returns exactly { count, hasLiked } on success", async () => {
    toggleLike.mockResolvedValue({ ok: true, count: 2, hasLiked: true });
    const res = await POST(postReq({ slug: "post-1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 2, hasLiked: true });
  });

  it("still returns 500 for a malformed body — a real bug is not laundered into a 503", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const res = await POST(rawPostReq("{not json"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal Server Error" });
    expect(toggleLike).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
