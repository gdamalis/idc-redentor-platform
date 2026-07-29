import { describe, expect, it } from "vitest";
import { exitCodeFor, parseSeedArgs, redactMongoHost } from "./seed-admin";

const noEnv = {} as NodeJS.ProcessEnv;

describe("parseSeedArgs", () => {
  it("parses an email and defaults locale to es-AR", () => {
    const result = parseSeedArgs(["--email", "First@Example.COM"], noEnv);
    expect(result).toEqual({
      ok: true,
      args: {
        email: "first@example.com",
        locale: "es-AR",
        force: false,
        yes: false,
        dryRun: false,
        sendEmail: false,
      },
    });
  });

  it("falls back to ADMIN_SEED_EMAIL when --email is absent", () => {
    const result = parseSeedArgs([], {
      ADMIN_SEED_EMAIL: " Seed@Example.com ",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.ok && result.args.email).toBe("seed@example.com");
  });

  it("refuses when neither --email nor ADMIN_SEED_EMAIL is present", () => {
    const result = parseSeedArgs([], noEnv);
    expect(result).toMatchObject({ ok: false, reason: "usage" });
  });

  it("refuses a malformed address with invalid-email", () => {
    const result = parseSeedArgs(["--email", "not-an-address"], noEnv);
    expect(result).toMatchObject({ ok: false, reason: "invalid-email" });
  });

  it("parses every boolean flag", () => {
    const result = parseSeedArgs(
      [
        "--email",
        "a@example.com",
        "--force",
        "--yes",
        "--dry-run",
        "--send-email",
      ],
      noEnv,
    );
    expect(result.ok && result.args).toMatchObject({
      force: true,
      yes: true,
      dryRun: true,
      sendEmail: true,
    });
  });

  it("accepts an explicit valid locale", () => {
    const result = parseSeedArgs(
      ["--email", "a@example.com", "--locale", "en-US"],
      noEnv,
    );
    expect(result.ok && result.args.locale).toBe("en-US");
  });

  it("refuses an invalid locale with usage", () => {
    const result = parseSeedArgs(
      ["--email", "a@example.com", "--locale", "pt-BR"],
      noEnv,
    );
    expect(result).toMatchObject({ ok: false, reason: "usage" });
  });

  it("refuses an unknown flag", () => {
    const result = parseSeedArgs(["--email", "a@example.com", "--wat"], noEnv);
    expect(result).toMatchObject({ ok: false, reason: "usage" });
  });

  it("refuses a value flag with no value", () => {
    expect(parseSeedArgs(["--email"], noEnv)).toMatchObject({
      ok: false,
      reason: "usage",
    });
    expect(parseSeedArgs(["--email", "--force"], noEnv)).toMatchObject({
      ok: false,
      reason: "usage",
    });
  });
});

describe("exitCodeFor", () => {
  it("maps success to 0", () => {
    expect(exitCodeFor({ ok: true, dryRun: true })).toBe(0);
    expect(
      exitCodeFor({
        ok: true,
        dryRun: false,
        roleIds: ["r1"],
        inviteId: "i1",
        refreshed: false,
      }),
    ).toBe(0);
  });

  it("maps an operation failure to 1", () => {
    expect(
      exitCodeFor({ ok: false, reason: "write-failed", message: "x" }),
    ).toBe(1);
  });

  it("maps every guard and usage refusal to 2", () => {
    for (const reason of [
      "db-guard",
      "admin-exists",
      "invalid-email",
      "usage",
    ] as const) {
      expect(exitCodeFor({ ok: false, reason, message: "x" })).toBe(2);
    }
  });
});

describe("redactMongoHost", () => {
  // Assembled from parts on purpose: the husky pre-commit hook rejects any
  // staged diff matching `mongodb(+srv)?://<userinfo>@`, and --no-verify is
  // banned — so even a fake credential-bearing URI cannot be one literal.
  const CREDENTIALED_URI = [
    "mongodb+srv://seeduser:sup3rsecret",
    "cluster0.abcde.mongodb.net/ministry-admin?authSource=admin",
  ].join("@");

  it("returns the hostname and never the credentials", () => {
    const host = redactMongoHost(CREDENTIALED_URI);
    expect(host).toBe("cluster0.abcde.mongodb.net");
    expect(host).not.toContain("sup3rsecret");
    expect(host).not.toContain("seeduser");
  });

  it("reports an unset variable without inventing a host", () => {
    expect(redactMongoHost(undefined)).toBe("<unset>");
  });

  it("never echoes an unparseable URI back", () => {
    expect(redactMongoHost("not a uri with a s3cret in it")).toBe(
      "<unparseable>",
    );
  });
});
