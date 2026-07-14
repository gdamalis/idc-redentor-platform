import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above the module body, so the shared mock fns
// must be created via vi.hoisted to be defined when the factories run.
const {
  notFound,
  setRequestLocale,
  shouldUseDraftMode,
  getLatestBlogPostPages,
  getContentCollection,
  getCtaComponent,
  getHeroBannerComponent,
  mapContentCollection,
  buildPageMetadata,
} = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    // Mirrors Next.js' real notFound(): it throws to halt rendering.
    throw new Error("NEXT_NOT_FOUND");
  }),
  setRequestLocale: vi.fn(),
  shouldUseDraftMode: vi.fn().mockResolvedValue(false),
  getLatestBlogPostPages: vi.fn().mockResolvedValue([]),
  getContentCollection: vi.fn().mockResolvedValue({}),
  getCtaComponent: vi.fn().mockResolvedValue({}),
  getHeroBannerComponent: vi.fn().mockResolvedValue({}),
  mapContentCollection: vi.fn().mockReturnValue({}),
  buildPageMetadata: vi.fn().mockResolvedValue({ title: "Home" }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next-intl/server", () => ({ setRequestLocale }));
// `@src/i18n/routing` calls next-intl's `createNavigation()`, which pulls in
// `next-intl/navigation` and (transitively) fails to resolve under Vitest's
// pnpm module graph — unrelated to this change (reproduces even in isolation).
// Mock it with the same locale list so the guard under test still exercises
// real values without loading that chain.
vi.mock("@src/i18n/routing", () => ({
  routing: { locales: ["es-AR", "en-US"] },
}));
vi.mock("@lib/contentful/draftMode", () => ({ shouldUseDraftMode }));
vi.mock("@lib/contentful/getBlogPostPages", () => ({ getLatestBlogPostPages }));
vi.mock("@lib/contentful/getContentCollection", () => ({ getContentCollection }));
vi.mock("@lib/contentful/getCtaComponent", () => ({ getCtaComponent }));
vi.mock("@lib/contentful/getHeroBannerComponent", () => ({
  getHeroBannerComponent,
}));
vi.mock("@lib/contentful/mapContentCollection", () => ({ mapContentCollection }));
vi.mock("@lib/metadata", () => ({ buildPageMetadata }));

import Home, { generateMetadata } from "./page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Home (app/[locale]/page.tsx) — invalid-locale guard", () => {
  it("rejects an invalid locale via notFound() before fetching any content", async () => {
    await expect(
      Home({ params: Promise.resolve({ locale: "monitoring" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledTimes(1);
    expect(setRequestLocale).not.toHaveBeenCalled();
    expect(shouldUseDraftMode).not.toHaveBeenCalled();
    expect(getHeroBannerComponent).not.toHaveBeenCalled();
    expect(getContentCollection).not.toHaveBeenCalled();
    expect(getCtaComponent).not.toHaveBeenCalled();
    expect(getLatestBlogPostPages).not.toHaveBeenCalled();
  });

  it("renders normally for a supported locale (es-AR)", async () => {
    await expect(
      Home({ params: Promise.resolve({ locale: "es-AR" }) }),
    ).resolves.toBeTruthy();

    expect(notFound).not.toHaveBeenCalled();
    expect(setRequestLocale).toHaveBeenCalledWith("es-AR");
    expect(getLatestBlogPostPages).toHaveBeenCalledWith(
      "es-AR",
      expect.objectContaining({ isDraftMode: false }),
    );
  });

  it("renders normally for a supported locale (en-US)", async () => {
    await expect(
      Home({ params: Promise.resolve({ locale: "en-US" }) }),
    ).resolves.toBeTruthy();

    expect(notFound).not.toHaveBeenCalled();
    expect(setRequestLocale).toHaveBeenCalledWith("en-US");
  });
});

describe("generateMetadata (app/[locale]/page.tsx) — invalid-locale guard", () => {
  it("rejects an invalid locale via notFound() before building metadata", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ locale: "monitoring" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalledTimes(1);
    expect(buildPageMetadata).not.toHaveBeenCalled();
  });

  it("builds metadata normally for a supported locale", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "es-AR" }),
    });

    expect(notFound).not.toHaveBeenCalled();
    expect(buildPageMetadata).toHaveBeenCalledWith({
      machineName: "seo-home",
      locale: "es-AR",
      path: "",
    });
    expect(metadata).toEqual({ title: "Home" });
  });
});
