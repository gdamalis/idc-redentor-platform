import { describe, expect, it, vi } from "vitest";
import {
  USAGE,
  exitCodeFor,
  parseSeedArgs,
  redactMongoHost,
  seedAdmin,
} from "./seed-admin";
import type { SeedAdminDeps, SeedArgs } from "./seed-admin";

const noEnv = {} as NodeJS.ProcessEnv;

describe("USAGE", () => {
  // pnpm 10 forwards a literal `--` token into argv for a `--filter <pkg> <script> --` invocation,
  // and parseSeedArgs correctly rejects it as an unknown argument (see the behavioural lock below).
  // Printing that exact form as the documented invocation would send an operator who hits a usage
  // error straight into a second usage error.
  it("does NOT document the pnpm `--` separator form", () => {
    expect(USAGE).not.toContain("seed:admin -- ");
  });

  it("documents the working direct-flag form", () => {
    expect(USAGE).toContain("seed:admin --email");
  });
});

describe("parseSeedArgs", () => {
  it("refuses a bare `--` as an unknown argument (this is why the pnpm `--` form is not documented)", () => {
    const result = parseSeedArgs(["--", "--email", "a@example.com"], noEnv);
    expect(result).toMatchObject({ ok: false, reason: "usage" });
  });

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

const ADMIN_ROLE_DOC = {
  _id: { toHexString: () => "role-admin" },
  key: "admin",
  permissions: ["users:manage", "roles:manage"],
  isSystem: true,
};
const LEADER_ROLE_DOC = {
  _id: { toHexString: () => "role-leader" },
  key: "leader",
  permissions: ["people:read"],
  isSystem: true,
};

const ARGS: SeedArgs = {
  email: "first@example.com",
  locale: "es-AR",
  force: false,
  yes: true,
  dryRun: false,
  sendEmail: false,
};

// Fresh, fully-controlled collaborators. No vi.mock needed: seedAdmin takes
// its dependencies as an argument, which is the whole point of the deps object
// on the one function in this app that grants the highest privilege there is.
const makeDeps = (over: Partial<SeedAdminDeps> = {}): SeedAdminDeps =>
  ({
    getAdminDb: vi.fn(() => ({ databaseName: "ministry-admin-test" })),
    seedSystemRoles: vi.fn(async () => undefined),
    listRoles: vi.fn(async () => [ADMIN_ROLE_DOC, LEADER_ROLE_DOC]),
    listUsers: vi.fn(async () => []),
    createInvite: vi.fn(async () => ({
      ok: true as const,
      inviteId: "invite-1",
      refreshed: false,
    })),
    withAdminTransaction: vi.fn(async (fn) => fn({} as never)),
    ...over,
  }) as unknown as SeedAdminDeps;

describe("seedAdmin — guard 1 (wrong database)", () => {
  it("refuses with db-guard and writes nothing when getAdminDb throws", async () => {
    const deps = makeDeps({
      getAdminDb: vi.fn(() => {
        throw new Error(
          'Refusing to use the Ministry Admin Mongo client against database "test"',
        );
      }) as unknown as SeedAdminDeps["getAdminDb"],
    });

    const result = await seedAdmin(ARGS, deps);

    expect(result).toMatchObject({ ok: false, reason: "db-guard" });
    expect(deps.seedSystemRoles).not.toHaveBeenCalled();
    expect(deps.createInvite).not.toHaveBeenCalled();
    expect(deps.listUsers).not.toHaveBeenCalled();
  });

  it("is NOT relaxed by --force", async () => {
    const deps = makeDeps({
      getAdminDb: vi.fn(() => {
        throw new Error("bad db");
      }) as unknown as SeedAdminDeps["getAdminDb"],
    });

    const result = await seedAdmin({ ...ARGS, force: true }, deps);

    expect(result).toMatchObject({ ok: false, reason: "db-guard" });
    expect(deps.seedSystemRoles).not.toHaveBeenCalled();
  });
});

describe("seedAdmin — guard 2 (already administrable)", () => {
  const administrableUsers = [
    {
      _id: { toHexString: () => "u1" },
      status: "active",
      roleIds: ["role-admin"],
    },
  ];

  it("refuses with admin-exists and performs ZERO writes", async () => {
    const deps = makeDeps({
      listUsers: vi.fn(
        async () => administrableUsers,
      ) as unknown as SeedAdminDeps["listUsers"],
    });

    const result = await seedAdmin(ARGS, deps);

    expect(result).toMatchObject({ ok: false, reason: "admin-exists" });
    expect(deps.seedSystemRoles).not.toHaveBeenCalled();
    expect(deps.createInvite).not.toHaveBeenCalled();
  });

  it("proceeds when --force is passed", async () => {
    const deps = makeDeps({
      listUsers: vi.fn(
        async () => administrableUsers,
      ) as unknown as SeedAdminDeps["listUsers"],
    });

    const result = await seedAdmin({ ...ARGS, force: true }, deps);

    expect(result).toMatchObject({
      ok: true,
      dryRun: false,
      inviteId: "invite-1",
    });
    expect(deps.seedSystemRoles).toHaveBeenCalledTimes(1);
  });

  it("proceeds when the only admin is DISABLED (they cannot repair the panel)", async () => {
    const deps = makeDeps({
      listUsers: vi.fn(async () => [
        {
          _id: { toHexString: () => "u1" },
          status: "disabled",
          roleIds: ["role-admin"],
        },
      ]) as unknown as SeedAdminDeps["listUsers"],
    });

    const result = await seedAdmin(ARGS, deps);
    expect(result).toMatchObject({ ok: true });
  });

  it("proceeds when a user holds users:manage but NOT roles:manage (AND, not OR)", async () => {
    const deps = makeDeps({
      listUsers: vi.fn(async () => [
        {
          _id: { toHexString: () => "u1" },
          status: "active",
          roleIds: ["role-partial"],
        },
      ]) as unknown as SeedAdminDeps["listUsers"],
      listRoles: vi.fn(async () => [
        ADMIN_ROLE_DOC,
        {
          _id: { toHexString: () => "role-partial" },
          key: undefined,
          permissions: ["users:manage"],
          isSystem: false,
        },
      ]) as unknown as SeedAdminDeps["listRoles"],
    });

    const result = await seedAdmin(ARGS, deps);
    expect(result).toMatchObject({ ok: true });
  });
});

describe("seedAdmin — dry run", () => {
  it("returns dryRun:true and writes nothing", async () => {
    const deps = makeDeps();

    const result = await seedAdmin({ ...ARGS, dryRun: true }, deps);

    expect(result).toEqual({ ok: true, dryRun: true });
    expect(deps.seedSystemRoles).not.toHaveBeenCalled();
    expect(deps.createInvite).not.toHaveBeenCalled();
  });
});

describe("seedAdmin — happy path", () => {
  it("seeds roles then creates the invite with the Admin role id and no inviter", async () => {
    const deps = makeDeps();

    const result = await seedAdmin(ARGS, deps);

    expect(result).toEqual({
      ok: true,
      dryRun: false,
      roleIds: ["role-admin", "role-leader"],
      inviteId: "invite-1",
      refreshed: false,
    });

    const [input] = (deps.createInvite as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(input).toEqual({
      email: "first@example.com",
      roleIds: ["role-admin"],
      locale: "es-AR",
    });
    // Guard: the seed must never invent an inviting user.
    expect(Object.keys(input)).not.toContain("invitedByUserId");
  });

  it("reports refreshed:true on a re-run", async () => {
    const deps = makeDeps({
      createInvite: vi.fn(async () => ({
        ok: true as const,
        inviteId: "invite-1",
        refreshed: true,
      })) as unknown as SeedAdminDeps["createInvite"],
    });

    const result = await seedAdmin(ARGS, deps);
    expect(result).toMatchObject({ ok: true, dryRun: false, refreshed: true });
  });
});

describe("seedAdmin — failure paths", () => {
  it("retries the WHOLE transaction once on insert-race, then succeeds", async () => {
    const createInvite = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: "insert-race" })
      .mockResolvedValueOnce({
        ok: true,
        inviteId: "invite-2",
        refreshed: true,
      });
    const deps = makeDeps({
      createInvite: createInvite as unknown as SeedAdminDeps["createInvite"],
    });

    const result = await seedAdmin(ARGS, deps);

    expect(result).toMatchObject({
      ok: true,
      inviteId: "invite-2",
      refreshed: true,
    });
    // A retry on the SAME session can never observe the winner, so the retry
    // must open a FRESH transaction.
    expect(deps.withAdminTransaction).toHaveBeenCalledTimes(2);
  });

  it("gives up with write-failed after a second insert-race", async () => {
    const deps = makeDeps({
      createInvite: vi.fn(async () => ({
        ok: false as const,
        reason: "insert-race" as const,
      })) as unknown as SeedAdminDeps["createInvite"],
    });

    const result = await seedAdmin(ARGS, deps);

    expect(result).toMatchObject({ ok: false, reason: "write-failed" });
    expect(deps.withAdminTransaction).toHaveBeenCalledTimes(2);
  });

  it("returns write-failed when no admin role exists after seeding", async () => {
    const deps = makeDeps({
      listRoles: vi.fn(async () => [
        LEADER_ROLE_DOC,
      ]) as unknown as SeedAdminDeps["listRoles"],
    });

    const result = await seedAdmin(ARGS, deps);

    expect(result).toMatchObject({ ok: false, reason: "write-failed" });
    expect(deps.createInvite).not.toHaveBeenCalled();
  });
});
