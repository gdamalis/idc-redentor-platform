import {
  CONTENT_STATUS,
  type ContentDoc,
  type ContentStatus,
} from "./model/envelope";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * The one canonical comparison behind derived status:
 * - object key order is ignored;
 * - a key whose value is `undefined` equals an absent key;
 * - `Date`s compare by time value (a `Date` never equals an ISO string);
 * - array order is significant;
 * - `NaN` equals `NaN`; no other coercion.
 * Iterative, so very deep documents cannot overflow the stack.
 */
export function canonicalEqual(a: unknown, b: unknown): boolean {
  const stack: Array<[unknown, unknown]> = [[a, b]];
  while (stack.length > 0) {
    const [x, y] = stack.pop() as [unknown, unknown];
    if (Object.is(x, y)) continue;
    if (x instanceof Date || y instanceof Date) {
      if (!(x instanceof Date) || !(y instanceof Date)) return false;
      if (!Object.is(x.getTime(), y.getTime())) return false;
      continue;
    }
    if (Array.isArray(x) || Array.isArray(y)) {
      if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length)
        return false;
      for (let i = 0; i < x.length; i += 1) stack.push([x[i], y[i]]);
      continue;
    }
    if (isPlainObject(x) && isPlainObject(y)) {
      const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
      for (const key of keys) {
        const xv = x[key];
        const yv = y[key];
        if (xv === undefined && yv === undefined) continue;
        stack.push([xv, yv]);
      }
      continue;
    }
    return false;
  }
  return true;
}

/** Draft (never published) / Unpublished changes / Published — derived, never stored. */
export function deriveStatus<T>(
  doc: Pick<ContentDoc<T>, "draft" | "published">,
): ContentStatus {
  if (doc.published === undefined) return CONTENT_STATUS.draft;
  return canonicalEqual(doc.draft, doc.published)
    ? CONTENT_STATUS.published
    : CONTENT_STATUS.changed;
}
