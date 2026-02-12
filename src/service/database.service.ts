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

export async function connect() {
  try {
    const mongoClient = getClient();
    await mongoClient.connect();
    await mongoClient.db("admin").command({ ping: 1 });

    console.log("Connected to database");

    return mongoClient;
  } catch (error) {
    console.error("Error connecting to database", error);
  }
}

export async function disconnect() {
  if (client) {
    await client.close();
    console.log("Disconnected from database");
  }
}
