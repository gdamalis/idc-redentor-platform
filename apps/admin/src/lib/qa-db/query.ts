/**
 * ICR-223 — query validation for the QA read-only command.
 *
 * Filters and pipelines are scanned recursively: every `$`-operator must be on an
 * explicit allowlist for its position, anything else is refused before a query is
 * built. There is no write stage and no JavaScript-executing operator on any list.
 */
import { COLLECTION_ALLOW } from "./policy";
import type { Allowed, Refusal } from "./policy";
import { isPiiKey } from "./scrub";

export const RESULT_CAP = 50;
export const MAX_TIME_MS = 5000;
const MAX_SKIP = 10_000;
const MAX_DEPTH = 8;
const MAX_REGEX_LENGTH = 200;
const COUNT_FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const FILTER_OPS: ReadonlySet<string> = new Set([
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$nin",
  "$and",
  "$or",
  "$nor",
  "$not",
  "$exists",
  "$regex",
  "$options",
  "$size",
  "$all",
  "$elemMatch",
  "$type",
]);
const GROUP_OPS: ReadonlySet<string> = new Set([
  "$sum",
  "$avg",
  "$min",
  "$max",
  "$first",
  "$last",
  "$push",
  "$addToSet",
]);
const NO_OPS: ReadonlySet<string> = new Set();

const STAGE_OPS: Readonly<Record<string, ReadonlySet<string>>> = {
  $match: FILTER_OPS,
  $project: NO_OPS,
  $sort: NO_OPS,
  $group: GROUP_OPS,
  $unwind: NO_OPS,
  $lookup: NO_OPS,
};
const SCALAR_STAGES: ReadonlySet<string> = new Set([
  "$limit",
  "$skip",
  "$count",
]);

const refuse = (reason: string): Refusal => ({ ok: false, reason });

function scan(
  value: unknown,
  allowed: ReadonlySet<string>,
  depth: number,
): string | null {
  if (depth > MAX_DEPTH) return "query is nested too deeply";
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = scan(item, allowed, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) return "forbidden key in query";
    if (key.startsWith("$") && !allowed.has(key))
      return "operator is not allowed";
    if (
      key === "$regex" &&
      typeof child === "string" &&
      child.length > MAX_REGEX_LENGTH
    ) {
      return "regular expression is too long";
    }
    const problem = scan(child, allowed, depth + 1);
    if (problem) return problem;
  }
  return null;
}

export function parseJsonFlag(
  raw: string | undefined,
  label: string,
): Allowed<unknown> | Refusal {
  if (raw === undefined) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return refuse(`${label} is not valid JSON`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateFilter(
  filter: unknown,
): Allowed<Record<string, unknown>> | Refusal {
  const value = filter ?? {};
  if (!isPlainObject(value)) return refuse("filter must be a JSON object");
  const problem = scan(value, FILTER_OPS, 0);
  return problem ? refuse(problem) : { ok: true, value };
}

function referencesPiiField(value: unknown, depth: number): boolean {
  if (depth > MAX_DEPTH) return true;
  if (typeof value === "string") {
    if (!value.startsWith("$")) return false;
    const segments = value.slice(1).split(".");
    return segments.some((seg) => isPiiKey(seg) || seg === "name");
  }
  if (Array.isArray(value)) {
    return value.some((item) => referencesPiiField(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).some((child) =>
      referencesPiiField(child, depth + 1),
    );
  }
  return false;
}

export function validateProjection(
  projection: unknown,
): Allowed<Record<string, 0 | 1 | boolean> | undefined> | Refusal {
  if (projection === undefined) return { ok: true, value: undefined };
  if (!isPlainObject(projection))
    return refuse("project must be a JSON object");
  const out: Record<string, 0 | 1 | boolean> = {};
  for (const [key, flag] of Object.entries(projection)) {
    if (
      FORBIDDEN_KEYS.has(key) ||
      key.startsWith("$") ||
      (flag !== 0 && flag !== 1 && flag !== true && flag !== false)
    ) {
      return refuse("project must map plain fields to 0, 1, true or false");
    }
    out[key] = flag;
  }
  return { ok: true, value: out };
}

export function validateSort(
  sort: unknown,
): Allowed<Record<string, 1 | -1> | undefined> | Refusal {
  if (sort === undefined) return { ok: true, value: undefined };
  if (!isPlainObject(sort)) return refuse("sort must be a JSON object");
  const out: Record<string, 1 | -1> = {};
  for (const [key, direction] of Object.entries(sort)) {
    if (
      FORBIDDEN_KEYS.has(key) ||
      key.startsWith("$") ||
      (direction !== 1 && direction !== -1)
    ) {
      return refuse("sort must map plain fields to 1 or -1");
    }
    out[key] = direction;
  }
  return { ok: true, value: out };
}

export function parseLimit(raw: string | undefined): Allowed<number> | Refusal {
  if (raw === undefined) return { ok: true, value: RESULT_CAP };
  if (!/^[1-9][0-9]*$/.test(raw)) {
    return refuse("limit must be a positive integer");
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(n) || n < 1) {
    return refuse("limit must be a positive integer");
  }
  return { ok: true, value: Math.min(n, RESULT_CAP) };
}

export interface ValidatedPipeline {
  pipeline: Record<string, unknown>[];
  hasLookup: boolean;
}

export function validatePipeline(
  pipeline: unknown,
): Allowed<ValidatedPipeline> | Refusal {
  if (
    !Array.isArray(pipeline) ||
    pipeline.length === 0 ||
    pipeline.length > 12
  ) {
    return refuse("pipeline must be a JSON array of 1 to 12 stages");
  }
  let hasLookup = false;
  const stages: Record<string, unknown>[] = [];
  for (const stage of pipeline as unknown[]) {
    if (!isPlainObject(stage) || Object.keys(stage).length !== 1) {
      return refuse("each stage must be an object with exactly one stage key");
    }
    const [name, body] = Object.entries(stage)[0] as [string, unknown];
    if (Object.hasOwn(STAGE_OPS, name)) {
      const allowed = STAGE_OPS[name] as ReadonlySet<string>;
      const problem = scan(body, allowed, 0);
      if (problem) return refuse(`${name}: ${problem}`);
      if (name === "$project") {
        const proj = validateProjection(body);
        if (!proj.ok) return refuse(`$project: ${proj.reason}`);
      }
      if (name === "$group" && referencesPiiField(body, 0)) {
        return refuse("$group cannot reference masked fields");
      }
      if (name === "$lookup") {
        const lookup = lookupProblem(body);
        if (lookup) return refuse(lookup);
        hasLookup = true;
      }
    } else if (SCALAR_STAGES.has(name)) {
      if (name === "$count") {
        if (
          typeof body !== "string" ||
          !COUNT_FIELD.test(body) ||
          FORBIDDEN_KEYS.has(body)
        ) {
          return refuse("$count must be a plain field name");
        }
      } else if (name === "$limit") {
        if (typeof body !== "number" || !Number.isInteger(body) || body < 1) {
          return refuse("$limit must be a positive integer");
        }
      } else if (name === "$skip") {
        if (
          typeof body !== "number" ||
          !Number.isInteger(body) ||
          body < 0 ||
          body > MAX_SKIP
        ) {
          return refuse(`$skip must be an integer between 0 and ${MAX_SKIP}`);
        }
      }
    } else {
      return refuse("pipeline stage is not allowed");
    }
    stages.push(stage);
  }
  return { ok: true, value: { pipeline: stages, hasLookup } };
}

function lookupProblem(body: unknown): string | null {
  if (!isPlainObject(body)) return "$lookup must be an object";
  const keys = Object.keys(body);
  const shape = ["from", "localField", "foreignField", "as"];
  if (keys.length !== 4 || !shape.every((key) => keys.includes(key))) {
    return "$lookup takes exactly from, localField, foreignField, as";
  }
  if (!shape.every((key) => typeof body[key] === "string"))
    return "$lookup fields must be strings";
  if (!COLLECTION_ALLOW.has(body.from as string))
    return "$lookup collection is not on the allowlist";
  return null;
}
