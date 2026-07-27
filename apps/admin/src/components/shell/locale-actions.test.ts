import { describe, it, expect, vi, beforeEach } from "vitest";

const getCurrentUser = vi.fn();
const updatePreferredLocale = vi.fn();

vi.mock("@src/lib/auth/current-user", () => ({
  getCurrentUser,
}));

vi.mock("@src/service/user.service", () => ({
  updatePreferredLocale,
}));

beforeEach(() => vi.clearAllMocks());

describe("setPreferredLocale", () => {
  it("persists the locale for the current session's user", async () => {
    const { setPreferredLocale } = await import("./locale-actions");
    getCurrentUser.mockResolvedValueOnce({
      ok: true,
      user: { firebaseUid: "uid1" },
    });
    updatePreferredLocale.mockResolvedValueOnce(true);

    expect(await setPreferredLocale("en-US")).toEqual({ ok: true });
    expect(updatePreferredLocale).toHaveBeenCalledWith("uid1", "en-US");
  });

  it("no-ops when there is no valid session", async () => {
    const { setPreferredLocale } = await import("./locale-actions");
    getCurrentUser.mockResolvedValueOnce({ ok: false, reason: "no-session" });

    expect(await setPreferredLocale("en-US")).toEqual({ ok: false });
    expect(updatePreferredLocale).not.toHaveBeenCalled();
  });

  it("rejects a locale outside the configured set", async () => {
    const { setPreferredLocale } = await import("./locale-actions");

    // @ts-expect-error — exercising an invalid locale value on purpose
    expect(await setPreferredLocale("fr")).toEqual({ ok: false });
    expect(getCurrentUser).not.toHaveBeenCalled();
    expect(updatePreferredLocale).not.toHaveBeenCalled();
  });
});
