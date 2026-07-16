import { afterEach, describe, expect, it, vi } from "vitest";

const { dbFn, MongoClientMock } = vi.hoisted(() => {
  const dbFn = vi.fn();
  const MongoClientMock = vi.fn(function MongoClient() {
    return { connect: vi.fn(), db: dbFn };
  });
  return { dbFn, MongoClientMock };
});

vi.mock("mongodb", () => ({
  MongoClient: MongoClientMock,
  ServerApiVersion: { v1: "1" },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

/** Re-imports the module with fresh module-level state (the cached `client`). */
async function loadService() {
  vi.resetModules();
  return import("./database.service");
}

describe("assertAdminDbName", () => {
  it("throws for an empty string", async () => {
    const { assertAdminDbName } = await loadService();
    expect(() => assertAdminDbName("")).toThrow();
  });

  it("throws for a whitespace-only string", async () => {
    const { assertAdminDbName } = await loadService();
    expect(() => assertAdminDbName("   ")).toThrow();
  });

  it("throws for undefined", async () => {
    const { assertAdminDbName } = await loadService();
    expect(() => assertAdminDbName(undefined)).toThrow();
  });

  it("throws for null", async () => {
    const { assertAdminDbName } = await loadService();
    expect(() => assertAdminDbName(null)).toThrow();
  });

  const deniedNames = ["test", "admin", "local", "config", "website", "website-staging"];

  it.each(deniedNames)("throws naming the offending database for %s", async (name) => {
    const { assertAdminDbName } = await loadService();
    expect(() => assertAdminDbName(name)).toThrow(name);
  });

  it("does not throw for ministry-admin", async () => {
    const { assertAdminDbName } = await loadService();
    expect(() => assertAdminDbName("ministry-admin")).not.toThrow();
  });
});

describe("getAdminDb", () => {
  it("returns the Db when the URI path resolves to ministry-admin", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/ministry-admin");
    dbFn.mockReturnValue({ databaseName: "ministry-admin" });
    const { getAdminDb } = await loadService();

    const db = getAdminDb();

    expect(db.databaseName).toBe("ministry-admin");
  });

  it("fails closed naming test when the URI carries no path database (mongodb driver default)", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017");
    dbFn.mockReturnValue({ databaseName: "test" });
    const { getAdminDb } = await loadService();

    expect(() => getAdminDb()).toThrow("test");
  });
});
