import * as Sentry from "@sentry/nextjs";
import { type Db, MongoClient, ServerApiVersion } from "mongodb";

const MONGODB_OPTIONS = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
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
      _mongoClient?: MongoClient;
    };
    if (!globalWithMongo._mongoClient) {
      globalWithMongo._mongoClient = new MongoClient(uri, MONGODB_OPTIONS);
    }
    client = globalWithMongo._mongoClient;
  } else {
    client = new MongoClient(uri, MONGODB_OPTIONS);
  }

  return client;
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
    Sentry.captureException(error);
  }
}

/**
 * Positive allowlist for this app's database. Bare `website` is production; the suffixed
 * forms are staging and the QA environments. Anything else — including the driver's silent
 * `test` fallback and the reserved `admin`/`local`/`config` — is refused.
 */
const WEBSITE_DB_PATTERN = /^website(-(staging|test|qa|e2e))?$/;

export function isAllowedWebsiteDbName(name: string): boolean {
  return WEBSITE_DB_PATTERN.test(name);
}

/**
 * The single place this app decides which database it talks to.
 *
 * The name comes from `MONGODB_URI`'s path segment (`client.db()` with no argument), never
 * from a literal — so one connection string fully determines the target, matching the
 * apps/admin model in docs/architecture/admin-database.md.
 *
 * Fails CLOSED: when the URI carries no path the driver silently resolves `test`, which would
 * otherwise write real data into a scratch database. See docs/architecture/likes-and-mongodb.md.
 */
export function getWebsiteDb(client: MongoClient): Db {
  const db = client.db();
  if (!isAllowedWebsiteDbName(db.databaseName)) {
    throw new Error(
      `[db] Refusing to use database "${db.databaseName}". MONGODB_URI must include a database ` +
        `path matching ${WEBSITE_DB_PATTERN}. When the URI has no path segment the MongoDB ` +
        `driver silently falls back to "test".`,
    );
  }
  return db;
}
