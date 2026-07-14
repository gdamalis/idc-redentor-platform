import * as Sentry from "@sentry/nextjs";
import { MongoClient, ServerApiVersion } from "mongodb";

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
