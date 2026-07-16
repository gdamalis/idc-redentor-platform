import { afterEach, describe, expect, it, vi } from "vitest";

const CLIENT_ENV_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

function unsetClientEnv() {
  for (const key of CLIENT_ENV_KEYS) {
    vi.stubEnv(key, undefined);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("firebase/client (AC8 — lazy, build-safe)", () => {
  it("imports with no NEXT_PUBLIC_FIREBASE_* env set without throwing", async () => {
    unsetClientEnv();

    const clientModule = await import("./client");

    expect(typeof clientModule.getFirebaseClientApp).toBe("function");
    expect(typeof clientModule.getFirebaseAuth).toBe("function");
  });

  it("fails closed: getFirebaseClientApp() throws when called with no env set", async () => {
    unsetClientEnv();
    const { getFirebaseClientApp } = await import("./client");

    expect(() => getFirebaseClientApp()).toThrow();
  });
});
