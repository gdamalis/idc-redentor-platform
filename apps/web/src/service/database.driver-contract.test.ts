// @vitest-environment node
import { MongoClient } from "mongodb";
import { describe, expect, it, vi } from "vitest";

import { getWebsiteDb, MONGODB_OPTIONS } from "./database.service";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

/**
 * Contract tests against the REAL driver (database.service.test.ts mocks it). They pin the driver
 * behaviour the fail-closed database check relies on, so a driver upgrade that changes it fails here
 * instead of silently writing into `test`. No network: `client.db()` only parses the URI, and no
 * test calls `connect()`. See docs/architecture/likes-and-mongodb.md.
 */
describe("mongodb driver contract (real driver, no network)", () => {
  it("resolves the 'test' database when the URI has no path, and getWebsiteDb refuses it", () => {
    const client = new MongoClient("mongodb://127.0.0.1:1", MONGODB_OPTIONS);

    expect(client.db().databaseName).toBe("test");
    expect(() => getWebsiteDb(client)).toThrow(
      /Refusing to use database "test"/,
    );
  });

  it("resolves the URI path database, and getWebsiteDb accepts an allowlisted one", () => {
    const client = new MongoClient(
      "mongodb://127.0.0.1:1/website-staging",
      MONGODB_OPTIONS,
    );

    expect(getWebsiteDb(client).databaseName).toBe("website-staging");
  });

  it("refuses a path database outside the allowlist", () => {
    const client = new MongoClient(
      "mongodb://127.0.0.1:1/admin",
      MONGODB_OPTIONS,
    );

    expect(() => getWebsiteDb(client)).toThrow(
      /Refusing to use database "admin"/,
    );
  });
});
