// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DB_NAME_ALLOW, COLLECTION_ALLOW } from "./policy";
import { runQaDbRead } from "./run";
import type { QaDbDeps, ReadOnlyDb } from "./run";
import { scrubDocuments, scrubString } from "./scrub";

const FAKE_URI = "mongo\x64b://fakeuser:fakepass@db.invalid:27017";
const FAKE_SRV =
  "mongo\x64b+srv://fakeuser:fakepass@cluster.invalid/ministry-admin-staging?retryWrites=true";

function makeDeps(docs: unknown[] = [{ _id: "1" }]) {
  const handle: ReadOnlyDb = {
    find: vi.fn(async () => docs),
    count: vi.fn(async () => 3),
    aggregate: vi.fn(async () => docs),
    close: vi.fn(async () => undefined),
  };
  const connect = vi.fn(async () => handle);
  return { deps: { connect } satisfies QaDbDeps, connect, handle };
}

const env = (extra: Record<string, string> = {}) => ({
  YOKE_QA_DB_ENV: "previewAdmin",
  MONGODB_URI: FAKE_URI,
  WEBSITE_MONGODB_URI: FAKE_URI,
  ...extra,
});

const read = (
  argv: string[],
  e: Record<string, string | undefined> = env(),
) => {
  const ctx = makeDeps();
  return runQaDbRead({ env: e, argv }, ctx.deps).then((outcome) => ({
    outcome,
    ...ctx,
  }));
};
const base = (db: string) => ["read", "--db", db, "--collection", "rbacAudit"];

describe("db guard (refused before connect)", () => {
  it.each([
    "ministry-admin",
    "website",
    "test",
    "admin",
    "local",
    "config",
    "ministry-admin-prod",
    "xministry-admin-staging",
    "Ministry-Admin-Staging",
    " ministry-admin-staging",
    "ministry-admin-staging\n",
    "constructor",
    "__proto__",
    "hasOwnProperty",
    "",
  ])("refuses %j", async (db) => {
    const { outcome, connect } = await read(base(db));
    expect(outcome.exitCode).toBe(2);
    expect(connect).not.toHaveBeenCalled();
  });

  it("refuses a missing --db", async () => {
    const { outcome, connect } = await read([
      "read",
      "--collection",
      "rbacAudit",
    ]);
    expect(outcome.exitCode).toBe(2);
    expect(connect).not.toHaveBeenCalled();
  });

  it("preview env refuses -staging, allows -test", async () => {
    const preview = { ...env(), YOKE_QA_DB_ENV: "preview" };
    expect(
      (await read(base("ministry-admin-staging"), preview)).outcome.exitCode,
    ).toBe(2);
    expect(
      (await read(base("ministry-admin-test"), preview)).outcome.exitCode,
    ).toBe(0);
  });

  it.each([
    undefined,
    "",
    "production",
    "constructor",
    "__proto__",
    "toString",
  ])("refuses env %j", async (name) => {
    const e = env();
    const withEnv =
      name === undefined
        ? { MONGODB_URI: FAKE_URI }
        : { ...e, YOKE_QA_DB_ENV: name };
    const { outcome, connect } = await read(
      base("ministry-admin-staging"),
      withEnv,
    );
    expect(outcome.exitCode).toBe(2);
    expect(connect).not.toHaveBeenCalled();
  });

  it("refuses non-allowlisted collections, prototype keys included", async () => {
    for (const col of ["system.users", "constructor", "__proto__", "admin"]) {
      const { outcome, connect } = await read([
        "read",
        "--db",
        "ministry-admin-staging",
        "--collection",
        col,
      ]);
      expect(outcome.exitCode).toBe(2);
      expect(connect).not.toHaveBeenCalled();
    }
  });
});

describe("connection string path", () => {
  it("accepts a URI with no path when --db is explicit; never falls back to test", async () => {
    const { outcome, connect } = await read(base("ministry-admin-staging"));
    expect(outcome.exitCode).toBe(0);
    expect(connect).toHaveBeenCalledWith(FAKE_URI, "ministry-admin-staging");
  });
  it("accepts a matching path", async () => {
    const { outcome } = await read(
      base("ministry-admin-staging"),
      env({ MONGODB_URI: FAKE_SRV }),
    );
    expect(outcome.exitCode).toBe(0);
  });
  it.each([
    "mongo\x64b://u:p@h.invalid/ministry-admin-test",
    "mongo\x64b://u:p@h.invalid/test",
    "mongo\x64b://u:p@h.invalid/ministry-admin",
    "not-a-uri",
  ])("refuses a mismatched or invalid path (%s)", async (uri) => {
    const { outcome, connect } = await read(
      base("ministry-admin-staging"),
      env({ MONGODB_URI: uri }),
    );
    expect(outcome.exitCode).toBe(2);
    expect(connect).not.toHaveBeenCalled();
  });
  it("picks the URI variable by database prefix, with no fallback", async () => {
    const e = {
      YOKE_QA_DB_ENV: "previewAdmin",
      MONGODB_URI: "mongodb://admin.invalid",
    };
    const web = await read(
      ["read", "--db", "website-staging", "--collection", "likes"],
      e,
    );
    expect(web.outcome.exitCode).toBe(2); // WEBSITE_MONGODB_URI missing; MONGODB_URI not used
    expect(web.connect).not.toHaveBeenCalled();
    const both = { ...e, WEBSITE_MONGODB_URI: "mongodb://web.invalid" };
    const ok = await read(
      ["read", "--db", "website-staging", "--collection", "likes"],
      both,
    );
    expect(ok.connect).toHaveBeenCalledWith(
      "mongodb://web.invalid",
      "website-staging",
    );
  });
});

describe("read-only", () => {
  it.each([
    "insert",
    "insertOne",
    "update",
    "updateOne",
    "delete",
    "deleteMany",
    "drop",
    "bulkWrite",
    "",
  ])("refuses verb %j", async (verb) => {
    const { outcome, connect } = await read([
      verb,
      "--db",
      "ministry-admin-staging",
      "--collection",
      "users",
    ]);
    expect(outcome.exitCode).toBe(2);
    expect(connect).not.toHaveBeenCalled();
  });

  it("the handle contract has no write methods", () => {
    const { handle } = makeDeps();
    expect(Object.keys(handle).sort()).toEqual([
      "aggregate",
      "close",
      "count",
      "find",
    ]);
  });

  it.each([
    "$out",
    "$merge",
    "$unionWith",
    "$graphLookup",
    "$documents",
    "$currentOp",
    "$collStats",
    "$function",
    "$facet",
    "$set",
    "$addFields",
  ])("refuses pipeline stage %s", async (stage) => {
    const pipeline = JSON.stringify([
      { $match: {} },
      { [stage]: stage === "$out" ? "x" : {} },
    ]);
    const { outcome, connect } = await read([
      "aggregate",
      "--db",
      "ministry-admin-staging",
      "--collection",
      "users",
      "--pipeline",
      pipeline,
    ]);
    expect(outcome.exitCode).toBe(2);
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    '{"$where":"1==1"}',
    '{"$expr":{"$function":{"body":"x","args":[],"lang":"js"}}}',
    '{"a":{"$accumulator":{}}}',
    '{"$or":[{"$where":"x"}]}',
    '{"__proto__":{"x":1}}',
    '{"a":{"$regex":"' + "a".repeat(300) + '"}}',
  ])("refuses filter %s", async (filter) => {
    const { outcome, connect } = await read([
      ...base("ministry-admin-staging"),
      "--filter",
      filter,
    ]);
    expect(outcome.exitCode).toBe(2);
    expect(connect).not.toHaveBeenCalled();
  });

  it("refuses nested JS in $group and $lookup to a non-allowlisted collection or with a pipeline", async () => {
    const bad = [
      [{ $group: { _id: null, x: { $accumulator: {} } } }],
      [
        {
          $lookup: {
            from: "system.users",
            localField: "a",
            foreignField: "b",
            as: "c",
          },
        },
      ],
      [{ $lookup: { from: "users", pipeline: [{ $out: "x" }], as: "c" } }],
      [
        {
          $lookup: {
            from: "users",
            localField: "a",
            foreignField: "b",
            as: "c",
            let: {},
          },
        },
      ],
    ];
    for (const pipeline of bad) {
      const { outcome, connect } = await read([
        "aggregate",
        "--db",
        "ministry-admin-staging",
        "--collection",
        "users",
        "--pipeline",
        JSON.stringify(pipeline),
      ]);
      expect(outcome.exitCode).toBe(2);
      expect(connect).not.toHaveBeenCalled();
    }
  });

  it("allows $match/$sort/$limit/$group/$lookup(allowlisted), clamps the limit, sets maxTimeMS", async () => {
    const pipeline = JSON.stringify([
      { $match: { action: "x" } },
      {
        $lookup: { from: "roles", localField: "a", foreignField: "b", as: "c" },
      },
      { $group: { _id: "$action", n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]);
    const a = await read([
      "aggregate",
      "--db",
      "ministry-admin-staging",
      "--collection",
      "rbacAudit",
      "--pipeline",
      pipeline,
      "--limit",
      "9999",
    ]);
    expect(a.outcome.exitCode).toBe(0);
    const [, sent, opts] = (a.handle.aggregate as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, unknown[], { maxTimeMS: number }];
    expect(sent.at(-1)).toEqual({ $limit: 50 });
    expect(opts.maxTimeMS).toBe(5000);
    const f = await read([
      ...base("ministry-admin-staging"),
      "--limit",
      "9999",
    ]);
    expect(
      (f.handle.find as ReturnType<typeof vi.fn>).mock.calls[0]?.[2],
    ).toMatchObject({ limit: 50, maxTimeMS: 5000 });
  });

  it("refuses unknown or repeated flags", async () => {
    expect(
      (await read([...base("ministry-admin-staging"), "--uri", "x"])).outcome
        .exitCode,
    ).toBe(2);
    expect(
      (
        await read([
          ...base("ministry-admin-staging"),
          "--db",
          "ministry-admin-test",
        ])
      ).outcome.exitCode,
    ).toBe(2);
  });
});

describe("scrubbing", () => {
  it("masks emails, connection strings and tokens in any string", () => {
    const text = `a@b.example mongo\x64b://u:p@h.invalid/x mongo\x64b+srv://u:p@c.invalid eyJabcdef.abcdefg.abcdefg Bearer abcdefgh12345`;
    const out = scrubString(text);
    expect(out).not.toMatch(/@|mongodb|eyJ|Bearer abc/);
  });

  it("masks denylisted keys recursively and in arrays; keeps QA names and role keys", () => {
    const { docs, masked } = scrubDocuments(
      [
        {
          actorEmail: "x@y.example",
          actorUid: "u1",
          nested: { telefono: "1", list: [{ firstName: "A" }] },
          note: "mail me at p@q.example",
          name: "QA Tester",
          role: "admin",
        },
      ],
      { collection: "users", hasLookup: false },
    );
    const json = JSON.stringify(docs);
    expect(json).not.toMatch(/@|"A"|"1"|"u1"/);
    expect(json).toContain("QA Tester");
    expect(json).toContain('"role":"admin"');
    expect(masked).toEqual(
      expect.arrayContaining([
        "actorEmail",
        "actorUid",
        "telefono",
        "firstName",
      ]),
    );
  });

  it("masks `name` on identity collections and after $lookup, keeps it on role data", () => {
    const person = scrubDocuments([{ name: "Maria Perez" }], {
      collection: "users",
      hasLookup: false,
    });
    expect(JSON.stringify(person.docs)).not.toContain("Maria");
    const looked = scrubDocuments([{ name: "Maria Perez" }], {
      collection: "roles",
      hasLookup: true,
    });
    expect(JSON.stringify(looked.docs)).not.toContain("Maria");
    const role = scrubDocuments([{ name: "admin" }], {
      collection: "roles",
      hasLookup: false,
    });
    expect(JSON.stringify(role.docs)).toContain("admin");
  });

  it("masks sensitive-looking keys and drops prototype keys", () => {
    const doc = JSON.parse(
      '{"__proto__":{"x":1},"user@x.example":1,"ok":2}',
    ) as unknown;
    const { docs } = scrubDocuments([doc], {
      collection: "roles",
      hasLookup: false,
    });
    expect(JSON.stringify(docs)).not.toContain("@");
    expect(Object.getPrototypeOf(docs[0] as object)).toBe(Object.prototype);
  });

  it("never echoes the URI or driver text, even when the driver fails", async () => {
    const connect = vi.fn(async () => {
      throw new Error(`failed to reach ${FAKE_URI} for a@b.example`);
    });
    const outcome = await runQaDbRead(
      { env: env(), argv: base("ministry-admin-staging") },
      { connect },
    );
    const all = JSON.stringify(outcome);
    expect(outcome.exitCode).toBe(1);
    expect(all).not.toMatch(
      /fakepass|fakeuser|db\.invalid|[\w.]+@[\w.]+\.[a-z]+/,
    );
  });

  it("emits observedVia DB with scrubbed docs on success and never the URI", async () => {
    const ctx = makeDeps([
      {
        _id: "1",
        action: "role.change",
        actorEmail: "a@b.example",
        name: "QA Bot",
      },
    ]);
    const outcome = await runQaDbRead(
      { env: env(), argv: base("ministry-admin-staging") },
      ctx.deps,
    );
    expect(outcome.exitCode).toBe(0);
    expect(outcome.envelope.observedVia).toBe("DB");
    expect(JSON.stringify(outcome)).not.toMatch(
      /fakepass|db\.invalid|[\w.]+@[\w.]+\.[a-z]+/,
    );
    expect(ctx.handle.close).toHaveBeenCalled();
  });
});

describe(".claude/config.json", () => {
  const config = JSON.parse(
    readFileSync(
      new URL("../../../../../.claude/config.json", import.meta.url),
      "utf8",
    ),
  ) as {
    qa: { env: Record<string, Record<string, unknown>> };
    qaDb: Record<string, unknown>;
  };

  it("keeps dbNameAllow equal to the code's allowlist for all four envs", () => {
    for (const [name, regex] of Object.entries(DB_NAME_ALLOW)) {
      expect(config.qa.env[name]?.dbNameAllow).toBe(regex.source);
    }
  });
  it("drops the nonexistent mongoMcp and points every env at the command via dbReadNote", () => {
    for (const name of Object.keys(DB_NAME_ALLOW)) {
      expect(config.qa.env[name]).not.toHaveProperty("mongoMcp");
      expect(String(config.qa.env[name]?.dbReadNote)).toContain(
        "scripts/qa-db-read.ts",
      );
      expect(String(config.qa.env[name]?.dbReadNote)).toContain(
        "docs/architecture/qa-db-read.md",
      );
    }
  });
  it("declares qaDb with the same collections as the code", () => {
    expect(config.qaDb.contract).toBe("yoke/qa-db-read@1");
    expect([...(config.qaDb.collections as string[])].sort()).toEqual(
      [...COLLECTION_ALLOW].sort(),
    );
  });
});
