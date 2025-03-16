import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error("MONGODB URI is not defined");
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

export async function connect() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });

    console.log("Connected to database");

    return client;
  } catch (error) {
    console.error("Error connecting to database", error);
  }
}

export async function disconnect() {
  await client.close();
  console.log("Disconnected from database");
}
