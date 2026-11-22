import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

/**
 * Faithful in-memory tag-indexed cache harness for testing Next.js 16 `unstable_cache` and
 * `revalidateTag(tag, { expire: 0 })` in Vitest (where Next's incrementalCache does not exist).
 *
 * Enforces Next 16's real invariants:
 * - JSON serialization round-trip (`JSON.stringify` / `JSON.parse`)
 * - Cache keying by `keyParts` + serialized invocation `args`
 * - Rejected promises are never cached
 * - `{ expire: 0 }` immediately evicts tagged entries; `"max"` marks stale-while-revalidate
 */
export function createNextCacheHarness() {
  interface CacheEntry {
    body: string;
    tags: string[];
    stale: boolean;
  }

  const store = new Map<string, CacheEntry>();
  const unstableCacheCalls: Array<{ keyParts?: string[]; tags?: string[] }> = [];
  const revalidateTagCalls: Array<{
    tag: string;
    profile: string | { expire?: number };
  }> = [];

  async function invoke<T extends (...args: never[]) => Promise<unknown>>(
    fixedKey: string,
    tags: string[],
    cb: T,
    args: Parameters<T>,
  ): Promise<Awaited<ReturnType<T>>> {
    unstableCacheCalls.push({ keyParts: fixedKey ? fixedKey.split(",") : [], tags });
    const key = `${fixedKey}:${JSON.stringify(args)}`;
    const existing = store.get(key);
    if (existing && !existing.stale) {
      return JSON.parse(existing.body) as Awaited<ReturnType<T>>;
    }
    if (existing && existing.stale) {
      const staleValue = JSON.parse(existing.body) as Awaited<ReturnType<T>>;
      const fresh = await cb(...args);
      store.set(key, {
        body: JSON.stringify(fresh),
        tags,
        stale: false,
      });
      return staleValue;
    }
    const result = await cb(...args);
    store.set(key, {
      body: JSON.stringify(result),
      tags,
      stale: false,
    });
    return result as Awaited<ReturnType<T>>;
  }

  function unstable_cache<T extends (...args: never[]) => Promise<unknown>>(
    cb: T,
    keyParts?: string[],
    options?: { revalidate?: number | false; tags?: string[] },
  ): T {
    const tags = options?.tags ?? [];
    const fixedKey = `${keyParts?.join(",") ?? ""}`;

    const wrapped = (async (...args: Parameters<T>) =>
      invoke(fixedKey, tags, cb, args)) as T;

    return wrapped;
  }

  function revalidateTag(
    tag: string,
    profile: string | { expire?: number },
  ): void {
    revalidateTagCalls.push({ tag, profile });
    const immediate =
      typeof profile === "object" && profile !== null && profile.expire === 0;
    for (const [key, entry] of store.entries()) {
      if (!entry.tags.includes(tag)) continue;
      if (immediate) {
        store.delete(key);
      } else {
        entry.stale = true;
      }
    }
  }

  function reset(): void {
    store.clear();
    unstableCacheCalls.length = 0;
    revalidateTagCalls.length = 0;
  }

  return {
    store,
    unstableCacheCalls,
    revalidateTagCalls,
    invoke,
    unstable_cache,
    revalidateTag,
    reset,
  };
}

type DocRecord = Record<string, unknown>;

function getNestedValue(obj: unknown, dottedPath: string): unknown {
  const parts = dottedPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as DocRecord)[part];
  }
  return current;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a instanceof ObjectId && b instanceof ObjectId) {
    return a.equals(b);
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return a === b;
}

function matchesFilter(doc: DocRecord, filter: DocRecord): boolean {
  for (const [key, condition] of Object.entries(filter)) {
    const actual = getNestedValue(doc, key);
    if (
      condition !== null &&
      typeof condition === "object" &&
      !(condition instanceof ObjectId) &&
      !(condition instanceof Date) &&
      !Array.isArray(condition)
    ) {
      const ops = condition as DocRecord;
      if ("$exists" in ops) {
        const exists = actual !== undefined;
        if (exists !== Boolean(ops.$exists)) return false;
      }
      if ("$ne" in ops) {
        if (valuesEqual(actual, ops.$ne)) return false;
      }
      if ("$in" in ops && Array.isArray(ops.$in)) {
        if (!ops.$in.some((candidate) => valuesEqual(actual, candidate))) {
          return false;
        }
      }
      if ("$type" in ops) {
        if (ops.$type === "string" && typeof actual !== "string") return false;
      }
    } else if (!valuesEqual(actual, condition)) {
      return false;
    }
  }
  return true;
}

function compareSortValues(a: unknown, b: unknown): number {
  const aMissing = a === undefined || a === null;
  const bMissing = b === undefined || b === null;
  if (aMissing && bMissing) return 0;
  if (aMissing) return -1;
  if (bMissing) return 1;
  if (a instanceof ObjectId && b instanceof ObjectId) {
    return a.toHexString().localeCompare(b.toHexString());
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a).localeCompare(String(b));
}

function clonePreservingBson(value: unknown): unknown {
  if (value instanceof ObjectId) return new ObjectId(value.toHexString());
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clonePreservingBson);
  if (value !== null && typeof value === "object") {
    const out: DocRecord = {};
    for (const [k, v] of Object.entries(value as DocRecord)) {
      out[k] = clonePreservingBson(v);
    }
    return out;
  }
  return value;
}

function applyProjection(doc: DocRecord, projection?: DocRecord): DocRecord {
  if (!projection) return doc;
  const keys = Object.keys(projection);
  if (keys.length === 0) return doc;
  const isExclusion = keys.every((k) => projection[k] === 0);
  if (isExclusion) {
    const clone = clonePreservingBson(doc) as DocRecord;
    for (const dotted of keys) {
      const parts = dotted.split(".");
      let current: DocRecord | undefined = clone;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const next = current?.[parts[i]!];
        if (!next || typeof next !== "object") {
          current = undefined;
          break;
        }
        current = next as DocRecord;
      }
      if (current) {
        delete current[parts[parts.length - 1]!];
      }
    }
    return clone;
  }
  return doc;
}

/**
 * In-memory MongoDB `Db` fake supporting `findOne`, `find().sort().limit().project().toArray()`,
 * dotted filters, `$exists`, `$ne`, `$in`, `$type: "string"`, and query-count tracking.
 */
export function createMockContentDb(
  initialData: Record<string, DocRecord[]> = {},
) {
  const collections = new Map<string, DocRecord[]>();
  for (const [name, docs] of Object.entries(initialData)) {
    collections.set(name, [...docs]);
  }

  let queryCount = 0;
  let forcedError: Error | null = null;

  function setCollection(name: string, docs: DocRecord[]): void {
    collections.set(name, [...docs]);
  }

  function failQueriesWith(error: Error | null): void {
    forcedError = error;
  }

  function getQueryCount(): number {
    return queryCount;
  }

  function resetQueryCount(): void {
    queryCount = 0;
  }

  const db = {
    databaseName: "website-test",
    collection(name: string) {
      return {
        async findOne(filter: DocRecord = {}) {
          queryCount += 1;
          if (forcedError) throw forcedError;
          const docs = collections.get(name) ?? [];
          return docs.find((doc) => matchesFilter(doc, filter)) ?? null;
        },
        find(filter: DocRecord = {}, options?: { projection?: DocRecord }) {
          let sortSpec: Record<string, 1 | -1> | null = null;
          let limitCount: number | null = null;
          let projectionSpec: DocRecord | undefined = options?.projection;

          const cursor = {
            sort(spec: Record<string, 1 | -1>) {
              sortSpec = spec;
              return cursor;
            },
            limit(n: number) {
              limitCount = n;
              return cursor;
            },
            project(spec: DocRecord) {
              projectionSpec = spec;
              return cursor;
            },
            async toArray() {
              queryCount += 1;
              if (forcedError) throw forcedError;
              let results = (collections.get(name) ?? []).filter((doc) =>
                matchesFilter(doc, filter),
              );
              if (sortSpec) {
                const entries = Object.entries(sortSpec);
                results = [...results].sort((a, b) => {
                  for (const [field, dir] of entries) {
                    const cmp = compareSortValues(
                      getNestedValue(a, field),
                      getNestedValue(b, field),
                    );
                    if (cmp !== 0) return cmp * dir;
                  }
                  return 0;
                });
              }
              if (limitCount !== null) {
                results = results.slice(0, limitCount);
              }
              return results.map((doc) => applyProjection(doc, projectionSpec));
            },
          };

          return cursor;
        },
      };
    },
  } as unknown as Db;

  return {
    db,
    setCollection,
    failQueriesWith,
    getQueryCount,
    resetQueryCount,
  };
}
