/**
 * ICR-223 — query validation for the QA read-only command.
 *
 * Filters and pipelines are scanned recursively: every `$`-operator must be on an
 * explicit allowlist for its position, anything else is refused before a query is
 * built. There is no write stage and no JavaScript-executing operator on any list.
 */
import { COLLECTION_ALLOW } from "./policy";
import type { Allowed, Refusal } from "./policy";

export const RESULT_CAP = 50;
export const MAX_TIME_MS = 5000;
const MAX_DEPTH = 8;
const MAX_REGEX_LENGTH = 200;

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

export function validateProjection(
  projection: unknown,
): Allowed<Record<string, unknown> | undefined> | Refusal {
  if (projection === undefined) return { ok: true, value: undefined };
  if (!isPlainObject(projection))
    return refuse("project must be a JSON object");
  const problem = scan(projection, NO_OPS, 0);
  return problem ? refuse(problem) : { ok: true, value: projection };
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

export function clampLimit(raw: unknown): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : RESULT_CAP;
  if (!Number.isFinite(n) || n < 1) return RESULT_CAP;
  return Math.min(n, RESULT_CAP);
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
      if (name === "$lookup") {
        const lookup = lookupProblem(body);
        if (lookup) return refuse(lookup);
        hasLookup = true;
      }
    } else if (SCALAR_STAGES.has(name)) {
      if (
        name === "$count" ? typeof body !== "string" : typeof body !== "number"
      ) {
        return refuse(`${name} has an invalid value`);
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
