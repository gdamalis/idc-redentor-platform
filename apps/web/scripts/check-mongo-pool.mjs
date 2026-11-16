// Guarded MongoDB connection-pool check (ICR-157).
//
// Compares the driver-default pool (baseline) with the capped pool the app uses, under a burst of
// concurrent pings, and counts connections via CMAP events. Refuses to run unless the database in
// MONGODB_URI is a non-production website DB. See docs/architecture/likes-and-mongodb.md.
//
// Usage: pnpm --filter @idcr/web mongo:pool-check [--concurrency 200]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import { MongoClient, ServerApiVersion } from "mongodb";

// Mirrors MONGODB_OPTIONS in src/service/database.service.ts (kept in sync by a test).
export const POOL_OPTIONS = { maxPoolSize: 10, maxIdleTimeMS: 60_000 };

const ALLOWED_DB = /^website-(staging|test|qa|e2e)$/;
const DEFAULT_CONCURRENCY = 200;
const TRACKED_EVENTS = [
  "connectionCreated",
  "connectionClosed",
  "connectionCheckedOut",
  "connectionCheckedIn",
];

export function isNonProdWebsiteDb(name) {
  return ALLOWED_DB.test(name);
}

export function createPoolTracker() {
  let created = 0;
  let open = 0;
  let out = 0;
  let peakOpen = 0;
  let peakCheckedOut = 0;

  const record = (eventName) => {
    switch (eventName) {
      case "connectionCreated":
        created += 1;
        open += 1;
        peakOpen = Math.max(peakOpen, open);
        break;
      case "connectionClosed":
        open -= 1;
        break;
      case "connectionCheckedOut":
        out += 1;
        peakCheckedOut = Math.max(peakCheckedOut, out);
        break;
      case "connectionCheckedIn":
        out -= 1;
        break;
      default:
        break;
    }
  };

  return { record, summary: () => ({ created, peakOpen, peakCheckedOut }) };
}

function parseConcurrency(argv) {
  const index = argv.indexOf("--concurrency");
  if (index === -1) return DEFAULT_CONCURRENCY;
  const value = Number(argv[index + 1]);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_CONCURRENCY;
}

async function runPhase(uri, concurrency, extraOptions) {
  const tracker = createPoolTracker();
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    ...extraOptions,
  });
  TRACKED_EVENTS.forEach((name) => client.on(name, () => tracker.record(name)));

  try {
    await client.connect();
    const start = Date.now();
    await Promise.all(
      Array.from({ length: concurrency }, () =>
        client.db().command({ ping: 1 }),
      ),
    );
    return { ...tracker.summary(), elapsedMs: Date.now() - start };
  } finally {
    await client.close();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set.");
    return 2;
  }

  const dbName = new MongoClient(uri).db().databaseName;
  if (!isNonProdWebsiteDb(dbName)) {
    console.error(
      `Refusing to run: database "${dbName}" is not a non-production website DB ` +
        "(expected website-staging, website-test, website-qa or website-e2e).",
    );
    return 2;
  }

  const concurrency = parseConcurrency(argv);
  const driverVersion = createRequire(import.meta.url)(
    "mongodb/package.json",
  ).version;

  try {
    const baseline = await runPhase(uri, concurrency, {});
    const capped = await runPhase(uri, concurrency, POOL_OPTIONS);

    console.log(`mongodb driver ${driverVersion}, database ${dbName}`);
    console.log(`concurrency: ${concurrency} parallel pings per phase`);
    console.table({ baseline, capped });
    console.log(
      "Note: monitoring sockets (up to 2 per server) are outside the pool and not counted.",
    );
    return capped.peakOpen <= POOL_OPTIONS.maxPoolSize ? 0 : 1;
  } catch (error) {
    console.error(`Pool check failed: ${error?.message ?? "unknown error"}`);
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = await main();
}
