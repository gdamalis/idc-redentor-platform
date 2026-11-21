/**
 * ICR-223 — the QA read-only database command, as a pure function over injected deps.
 *
 * Exit codes (exactly these): 0 = ok, 2 = refused (policy/args, before any query),
 * 1 = unexpected failure (fixed message — driver text is never echoed).
 * Order matters: env → verb → db → collection → URI variable → URI path → query
 * validation → connect. Nothing reaches `connect` unless every guard passed.
 */
import {
  MAX_TIME_MS,
  parseJsonFlag,
  parseLimit,
  validateFilter,
  validatePipeline,
  validateProjection,
  validateSort,
} from "./query";
import {
  checkCollection,
  checkDbName,
  checkUriPath,
  QA_DB_CONTRACT,
  resolveEnv,
  uriVariableFor,
} from "./policy";
import { scrubDocuments, scrubString } from "./scrub";

export interface ReadOnlyDb {
  find(
    collection: string,
    filter: Record<string, unknown>,
    options: {
      projection?: Record<string, unknown>;
      sort?: Record<string, 1 | -1>;
      limit: number;
      maxTimeMS: number;
    },
  ): Promise<unknown[]>;
  count(
    collection: string,
    filter: Record<string, unknown>,
    options: { maxTimeMS: number },
  ): Promise<number>;
  aggregate(
    collection: string,
    pipeline: Record<string, unknown>[],
    options: { maxTimeMS: number },
  ): Promise<unknown[]>;
  close(): Promise<void>;
}

export interface QaDbDeps {
  connect(uri: string, dbName: string): Promise<ReadOnlyDb>;
}

export interface QaDbEnvelope {
  contract: typeof QA_DB_CONTRACT;
  ok: boolean;
  diagnostics: string[];
  observedVia?: "DB";
  db?: string;
  collection?: string;
  count?: number;
  docs?: unknown[];
  masked?: string[];
}

export interface QaDbOutcome {
  exitCode: 0 | 1 | 2;
  envelope: QaDbEnvelope;
}

type QaDbVerb = "read" | "count" | "aggregate";

const FLAGS_BY_VERB: Readonly<Record<QaDbVerb, ReadonlySet<string>>> = {
  read: new Set([
    "--db",
    "--collection",
    "--filter",
    "--project",
    "--sort",
    "--limit",
  ]),
  count: new Set(["--db", "--collection", "--filter"]),
  aggregate: new Set(["--db", "--collection", "--pipeline", "--limit"]),
};

const refused = (reason: string): QaDbOutcome => ({
  exitCode: 2,
  envelope: {
    contract: QA_DB_CONTRACT,
    ok: false,
    diagnostics: [scrubString(reason)],
  },
});

function parseFlags(
  args: readonly string[],
  allowedFlags: ReadonlySet<string>,
): Map<string, string> | string {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i] as string;
    const value = args[i + 1];
    if (!allowedFlags.has(flag) || value === undefined || flags.has(flag))
      return "unknown, repeated or incomplete flag";
    flags.set(flag, value);
  }
  return flags;
}

export async function runQaDbRead(
  input: { env: Record<string, string | undefined>; argv: readonly string[] },
  deps: QaDbDeps,
): Promise<QaDbOutcome> {
  const [verb, ...rest] = input.argv;
  if (typeof verb !== "string" || !Object.hasOwn(FLAGS_BY_VERB, verb))
    return refused("verb must be read, count or aggregate");
  const verbKey = verb as QaDbVerb;

  const env = resolveEnv(input.env.YOKE_QA_DB_ENV);
  if (!env.ok) return refused(env.reason);

  const flags = parseFlags(rest, FLAGS_BY_VERB[verbKey]);
  if (typeof flags === "string") return refused(flags);

  const db = checkDbName(env.value, flags.get("--db"));
  if (!db.ok) return refused(db.reason);
  const collection = checkCollection(flags.get("--collection"));
  if (!collection.ok) return refused(collection.reason);

  const uri = input.env[uriVariableFor(db.value)];
  if (typeof uri !== "string" || uri === "")
    return refused("the connection string variable is missing or malformed");
  const path = checkUriPath(uri, db.value);
  if (!path.ok) return refused(path.reason);

  // Parse and validate the query shape before connecting.
  const filterRaw = parseJsonFlag(flags.get("--filter"), "filter");
  const projectRaw = parseJsonFlag(flags.get("--project"), "project");
  const sortRaw = parseJsonFlag(flags.get("--sort"), "sort");
  const pipelineRaw = parseJsonFlag(flags.get("--pipeline"), "pipeline");
  for (const parsed of [filterRaw, projectRaw, sortRaw, pipelineRaw])
    if (!parsed.ok) return refused(parsed.reason);
  const unwrap = (r: typeof filterRaw): unknown => (r.ok ? r.value : undefined);

  const filter = validateFilter(unwrap(filterRaw));
  if (!filter.ok) return refused(filter.reason);
  const projection = validateProjection(unwrap(projectRaw));
  if (!projection.ok) return refused(projection.reason);
  const sort = validateSort(unwrap(sortRaw));
  if (!sort.ok) return refused(sort.reason);
  let pipeline: ReturnType<typeof validatePipeline> | undefined;
  if (verbKey === "aggregate") {
    pipeline = validatePipeline(unwrap(pipelineRaw));
    if (!pipeline.ok) return refused(pipeline.reason);
  }
  const limitResult = parseLimit(flags.get("--limit"));
  if (!limitResult.ok) return refused(limitResult.reason);
  const limit = limitResult.value;

  let handle: ReadOnlyDb | undefined;
  try {
    handle = await deps.connect(uri, db.value);
    const options = { maxTimeMS: MAX_TIME_MS };
    const envelope: QaDbEnvelope = {
      contract: QA_DB_CONTRACT,
      ok: true,
      diagnostics: [],
      observedVia: "DB",
      db: db.value,
      collection: collection.value,
    };
    if (verb === "count") {
      envelope.count = await handle.count(
        collection.value,
        filter.value,
        options,
      );
    } else {
      let docs: unknown[];
      let hasLookup = false;
      if (verb === "aggregate" && pipeline?.ok) {
        hasLookup = pipeline.value.hasLookup;
        docs = await handle.aggregate(
          collection.value,
          [...pipeline.value.pipeline, { $limit: limit }],
          options,
        );
      } else {
        docs = await handle.find(collection.value, filter.value, {
          ...(projection.value ? { projection: projection.value } : {}),
          ...(sort.value ? { sort: sort.value } : {}),
          limit,
          ...options,
        });
      }
      const scrubbed = scrubDocuments(docs.slice(0, limit), {
        collection: collection.value,
        hasLookup,
      });
      envelope.docs = scrubbed.docs;
      envelope.masked = scrubbed.masked;
      envelope.count = scrubbed.docs.length;
    }
    return { exitCode: 0, envelope };
  } catch {
    return {
      exitCode: 1,
      envelope: {
        contract: QA_DB_CONTRACT,
        ok: false,
        diagnostics: ["query failed (details withheld)"],
      },
    };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
