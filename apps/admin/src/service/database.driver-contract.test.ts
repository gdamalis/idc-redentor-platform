// @vitest-environment node
import { MongoClient, ObjectId } from "mongodb";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Contract tests against the REAL driver (database.service.test.ts mocks it). They pin the driver
 * behaviour this app's fail-closed database checks and ObjectId handling rely on, so a driver
 * upgrade that changes it fails here. No network: `client.db()` only parses the URI, and no test
 * connects. See docs/architecture/admin-database.md.
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Fresh module state: the accessors cache their client in a closure. */
async function loadService() {
  vi.resetModules();
  return import("./database.service");
}

describe("default database (real driver)", () => {
  it("resolves 'test' when the URI has no path", () => {
    // Test-only bare client.db(): this pins the very driver default the ban exists to guard against.
    // eslint-disable-next-line no-restricted-syntax
    expect(new MongoClient("mongodb://127.0.0.1:1").db().databaseName).toBe(
      "test",
    );
    const withAuthSource = new MongoClient(
      "mongodb://127.0.0.1:1/?authSource=admin",
    );
    // eslint-disable-next-line no-restricted-syntax
    expect(withAuthSource.db().databaseName).toBe("test");
  });

  it("getAdminDb refuses a URI with no path database", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:1/?authSource=admin");
    const { getAdminDb } = await loadService();

    expect(() => getAdminDb()).toThrow(/"test"/);
  });

  it("getContentDb refuses a URI with no path database", async () => {
    vi.stubEnv(
      "WEBSITE_MONGODB_URI",
      "mongodb://127.0.0.1:1/?authSource=admin",
    );
    const { getContentDb } = await loadService();

    expect(() => getContentDb()).toThrow(/"test"/);
  });

  it("both accessors resolve their own allowlisted path database", async () => {
    vi.stubEnv(
      "MONGODB_URI",
      "mongodb://127.0.0.1:1/ministry-admin-staging?authSource=admin",
    );
    vi.stubEnv(
      "WEBSITE_MONGODB_URI",
      "mongodb://127.0.0.1:1/website-staging?authSource=admin",
    );
    const { getAdminDb, getContentDb } = await loadService();

    expect(getAdminDb().databaseName).toBe("ministry-admin-staging");
    expect(getContentDb().databaseName).toBe("website-staging");
  });
});

describe("ObjectId (real bson)", () => {
  const hex = "65a1b2c3d4e5f60718293a4b";

  it("round-trips a hex string", () => {
    const id = new ObjectId(hex);

    expect(id.toHexString()).toBe(hex);
    expect(id.equals(new ObjectId(hex))).toBe(true);
  });

  it("serialises to its hex string in JSON", () => {
    expect(JSON.stringify({ id: new ObjectId(hex) })).toBe(`{"id":"${hex}"}`);
  });

  it("rejects a malformed id string", () => {
    expect(ObjectId.isValid("not-an-id")).toBe(false);
    expect(() => new ObjectId("not-an-id")).toThrow();
  });
});
