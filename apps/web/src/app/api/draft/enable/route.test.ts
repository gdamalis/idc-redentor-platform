import { describe, it, expect, vi, beforeEach } from "vitest";

const enable = vi.fn();

vi.mock("next/headers", () => ({
  draftMode: vi.fn(async () => ({ enable })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { GET } from "./route";

const mockDraftMode = vi.mocked(draftMode);
const mockRedirect = vi.mocked(redirect);

const SECRET = "test-preview-secret";

function makeRequest(params: Record<string, string>) {
  const url = new URL("https://example.com/api/draft/enable");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CONTENTFUL_PREVIEW_SECRET = SECRET;
});

describe("GET /api/draft/enable", () => {
  it("401s on a wrong secret and never enables draft mode", async () => {
    const res = await GET(makeRequest({ secret: "wrong", locale: "es-AR" }));

    expect(res.status).toBe(401);
    expect(enable).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("400s on an unknown/unsafe/missing locale without enabling or redirecting (open-redirect guard)", async () => {
    for (const locale of ["/evil.com", "//evil.com", "fr-FR", ""]) {
      const res = await GET(makeRequest({ secret: SECRET, locale }));
      expect(res.status).toBe(400);
    }

    // locale param omitted entirely
    const res = await GET(makeRequest({ secret: SECRET }));
    expect(res.status).toBe(400);

    expect(enable).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("enables draft mode and redirects to the locale home on valid input", async () => {
    await GET(makeRequest({ secret: SECRET, locale: "es-AR" }));

    expect(mockDraftMode).toHaveBeenCalled();
    expect(enable).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith("/es-AR");
  });
});
