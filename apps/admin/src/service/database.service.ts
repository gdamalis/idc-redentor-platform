import { MongoClient, ServerApiVersion } from "mongodb";
import type { Db } from "mongodb";

const MONGODB_OPTIONS = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10,
};

let client: MongoClient | null = null;

function getClient(): MongoClient {
  if (client) return client;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined");
  }

  // In development, cache on globalThis to survive HMR
  if (process.env.NODE_ENV === "development") {
    const globalWithMongo = globalThis as typeof globalThis & {
      _adminMongoClient?: MongoClient;
    };
    if (!globalWithMongo._adminMongoClient) {
      globalWithMongo._adminMongoClient = new MongoClient(uri, MONGODB_OPTIONS);
    }
    client = globalWithMongo._adminMongoClient;
  } else {
    client = new MongoClient(uri, MONGODB_OPTIONS);
  }

  return client;
}

const DENIED_EXACT_DB_NAMES = new Set(["test", "admin", "local", "config"]);
const DENIED_DB_NAME_PATTERN = /^website/;

/**
 * Functional-first exception (documented, not a precedent to reuse casually):
 * a misconfigured database name here is a **deployment defect**, not a
 * branchable outcome, so this throws a plain `Error` naming the offending
 * database instead of returning a discriminated result a caller could `??`
 * past. A returnable refusal would silently reintroduce exactly the
 * mis-wired-DB failure mode this denylist — and the deliberate absence of a
 * separate DB-name env var — exists to prevent.
 * Precedent: `apps/web/src/service/database.service.ts`'s
 * `throw new Error("MONGODB_URI is not defined")` for the same class of
 * problem. No `Error` subclass is introduced.
 *
 * Runs on every call (O(1) set lookup + one regex) with no memoization, so a
 * dev-mode HMR client swap can never bypass it. Has no Next.js runtime
 * dependency — ICR-155's plain Node/tsx seed script can import it directly.
 */
export function assertAdminDbName(name: string | null | undefined): void {
  const trimmed = (name ?? "").trim();

  if (!trimmed) {
    throw new Error(
      "Refusing to use the Ministry Admin Mongo client: MONGODB_URI resolved no database name " +
        '(empty or whitespace). Carry the DB name in the URI path, e.g. ".../ministry-admin?authSource=admin".',
    );
  }

  if (DENIED_EXACT_DB_NAMES.has(trimmed) || DENIED_DB_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `Refusing to use the Ministry Admin Mongo client against database "${trimmed}" — this name is ` +
        'reserved (Mongo system DB) or belongs to the public-site tier ("website"/"website-staging" are ' +
        'apps/web\'s). Set MONGODB_URI\'s path to "ministry-admin" or "ministry-admin-staging".',
    );
  }
}

/**
 * The ONE sanctioned bare, zero-arg `client.db` call in `apps/admin` — every
 * other read must go through this accessor or an explicit
 * `client.db("website")` (enforced by the `no-restricted-syntax` ESLint rule
 * in `eslint.config.mjs`). Synchronous: `client.db` (no args) reads the
 * URI-resolved DB name without needing a live connection, so this can
 * assert-and-return without awaiting `connect()`.
 */
export function getAdminDb(): Db {
  const db = getClient().db();
  assertAdminDbName(db.databaseName);
  return db;
}

// The driver de-dupes concurrent connect() calls internally (connectionLock) and
// no-ops on a warm topology, so repeat calls are free — no memoization needed here.
export async function connect(): Promise<MongoClient | undefined> {
  try {
    const mongoClient = getClient();
    await mongoClient.connect();
    return mongoClient;
  } catch (error) {
    console.error("[db] Failed to connect to MongoDB", error);
  }
}
