import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connectFn, dbFn, commandFn, MongoClientMock, captureException } = vi.hoisted(() => {
  const connectFn = vi.fn();
  const commandFn = vi.fn();
  const dbFn = vi.fn();
  const MongoClientMock = vi.fn(function MongoClient() {
    return { connect: connectFn, db: dbFn };
  });
  const captureException = vi.fn();
  return { connectFn, dbFn, commandFn, MongoClientMock, captureException };
});

vi.mock("mongodb", () => ({
  MongoClient: MongoClientMock,
  ServerApiVersion: { v1: "1" },
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));

const ORIGINAL_URI = process.env.MONGODB_URI;

/** Re-imports the module with fresh module-level state (the cached `client`). */
async function loadService() {
  vi.resetModules();
  return import("./database.service");
}

/**
 * `MONGODB_URI` is declared as a required `string` in `src/types/environment.d.ts`
 * (correct for production), so `delete process.env.MONGODB_URI` fails type-check
 * directly. Cast to a locally-optional shape just for the delete.
 */
function deleteMongoUri() {
  delete (process.env as { MONGODB_URI?: string }).MONGODB_URI;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MONGODB_URI = "mongodb://localhost:27017/website";
  connectFn.mockResolvedValue(undefined);
  // Fake enough of `db("admin").command(...)` for today's (pre-change) source to
  // resolve cleanly; the post-change source never calls db() at all, so this is
  // inert once the ping is removed — it only keeps test 1 accurate against
  // *current* code at Step 2.
  commandFn.mockResolvedValue({ ok: 1 });
  dbFn.mockReturnValue({ command: commandFn });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_URI === undefined) deleteMongoUri();
  else process.env.MONGODB_URI = ORIGINAL_URI;
});

describe("connect", () => {
  it("resolves to the MongoClient on success", async () => {
    const { connect } = await loadService();

    const client = await connect();

    expect(client).toBeDefined();
    expect(connectFn).toHaveBeenCalledTimes(1);
  });

  it("never issues an admin ping (no db() call at all)", async () => {
    const { connect } = await loadService();

    await connect();

    expect(dbFn).not.toHaveBeenCalled();
  });

  it("logs nothing at info level on a successful connect", async () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
    const { connect } = await loadService();

    await connect();

    expect(consoleLog).not.toHaveBeenCalled();
  });

  it("resolves to undefined when the driver fails to connect", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    connectFn.mockRejectedValueOnce(new Error("server selection timed out"));
    const { connect } = await loadService();

    await expect(connect()).resolves.toBeUndefined();
  });

  it("resolves to undefined when MONGODB_URI is not set", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    deleteMongoUri();
    const { connect } = await loadService();

    await expect(connect()).resolves.toBeUndefined();
  });

  it("logs the failure with a [db] prefix and reports it to Sentry", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("bad auth");
    connectFn.mockRejectedValueOnce(failure);
    const { connect } = await loadService();

    await connect();

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("[db]"),
      failure,
    );
    expect(captureException).toHaveBeenCalledWith(failure);
  });

  it("constructs the MongoClient once across repeated calls", async () => {
    const { connect } = await loadService();

    await connect();
    await connect();

    expect(MongoClientMock).toHaveBeenCalledTimes(1);
  });
});

describe("module surface", () => {
  it("no longer exports disconnect", async () => {
    const service = await loadService();

    expect(service).not.toHaveProperty("disconnect");
  });
});
