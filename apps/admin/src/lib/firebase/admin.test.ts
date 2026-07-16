import { afterEach, describe, expect, it, vi } from "vitest";

// `server-only`'s real `index.js` throws unconditionally outside a bundler that
// sets the "react-server" export condition (that's how it enforces the
// Server-Component-only boundary in Next.js's webpack build). Vitest/Vite run
// this file under plain Node module resolution with no such condition, so the
// unmocked import throws regardless of the Firebase env under test — a false
// positive unrelated to AC8. Stub it to a no-op here so the test isolates the
// behavior this checkpoint actually verifies: lazy, env-driven Firebase init.
vi.mock("server-only", () => ({}));

const ADMIN_ENV_KEYS = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"] as const;

function unsetAdminEnv() {
  for (const key of ADMIN_ENV_KEYS) {
    vi.stubEnv(key, undefined);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("firebase/admin (AC8 — lazy, build-safe)", () => {
  it("imports with no Firebase Admin env set without throwing", async () => {
    unsetAdminEnv();

    const adminModule = await import("./admin");

    expect(typeof adminModule.getFirebaseAdminApp).toBe("function");
  });

  it("fails closed: getFirebaseAdminApp() throws when called with no env set", async () => {
    unsetAdminEnv();
    const { getFirebaseAdminApp } = await import("./admin");

    expect(() => getFirebaseAdminApp()).toThrow();
  });
});
