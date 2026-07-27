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

describe("auth.resetPassword + auth.email.{invite,reset} (ICR-127)", () => {
  const resetPasswordKeys = [
    "title",
    "subtitle",
    "emailLabel",
    "submit",
    "successGeneric",
    "backToLogin",
  ].sort();
  const inviteEmailKeys = [
    "subject",
    "heading",
    "greeting",
    "body",
    "cta",
    "expiryNote",
    "footer",
  ].sort();
  const resetEmailKeys = [
    "subject",
    "heading",
    "body",
    "cta",
    "expiryNote",
    "ignoreNote",
    "footer",
  ].sort();

  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])("%s carries the auth.resetPassword subtree with every expected key", (_locale, messages) => {
    expect(Object.keys(messages.auth.resetPassword).sort()).toEqual(resetPasswordKeys);
  });

  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])("%s carries the auth.email.invite subtree with every expected key", (_locale, messages) => {
    expect(Object.keys(messages.auth.email.invite).sort()).toEqual(inviteEmailKeys);
  });

  it.each([
    ["es-AR", esAR],
    ["en-US", enUS],
  ])("%s carries the auth.email.reset subtree with every expected key", (_locale, messages) => {
    expect(Object.keys(messages.auth.email.reset).sort()).toEqual(resetEmailKeys);
  });
});
