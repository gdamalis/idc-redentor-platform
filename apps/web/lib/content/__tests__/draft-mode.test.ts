import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { draftMode } = vi.hoisted(() => ({
  draftMode: vi.fn(),
}));

vi.mock("next/headers", () => ({ draftMode }));

import { shouldUseDraftMode } from "../draft-mode";

describe("shouldUseDraftMode", () => {
  beforeEach(() => {
    draftMode.mockResolvedValue({ isEnabled: false });
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_TARGET_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("returns true when Next.js draftMode() cookie is enabled even in production", async () => {
    draftMode.mockResolvedValue({ isEnabled: true });
    await expect(shouldUseDraftMode()).resolves.toBe(true);
  });

  it("returns false in production when draftMode() is disabled", async () => {
    await expect(shouldUseDraftMode()).resolves.toBe(false);
  });

  it("returns true on staging and preview deployments via isAlwaysDraftEnvironment", async () => {
    vi.stubEnv("VERCEL_TARGET_ENV", "staging");
    await expect(shouldUseDraftMode()).resolves.toBe(true);

    vi.stubEnv("VERCEL_TARGET_ENV", "preview");
    await expect(shouldUseDraftMode()).resolves.toBe(true);
  });

  it("returns true in local development", async () => {
    vi.stubEnv("VERCEL_TARGET_ENV", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    await expect(shouldUseDraftMode()).resolves.toBe(true);
  });
});
