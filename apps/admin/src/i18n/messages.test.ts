import { describe, it, expect } from "vitest";
import esAR from "../../messages/es-AR.json";
import enUS from "../../messages/en-US.json";

/** Flattens {a:{b:"x"}} => ["a.b"], so a nested key can never drift between locales. */
function flattenKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("admin locale message files", () => {
  it("have identical key sets (no key may exist in one file only)", () => {
    const es = flattenKeys(esAR).sort();
    const en = flattenKeys(enUS).sort();

    expect(es.filter((k) => !en.includes(k))).toEqual([]); // missing from en-US
    expect(en.filter((k) => !es.includes(k))).toEqual([]); // missing from es-AR
  });
});
