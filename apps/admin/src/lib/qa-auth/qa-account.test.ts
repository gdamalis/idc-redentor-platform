import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  QA_ACCOUNT_DB_NAME,
  generateQaPassword,
  mergeQaEnv,
  parseQaAccountArgs,
  provisionQaAccount,
  readQaEnvFile,
  rotateQaPassword,
  writeQaEnvFile,
} from "./qa-account";
import type { QaAccountDeps } from "./qa-account";

const EMAIL = "qa-account@example.test";
const PASSWORD = "generated-password-".padEnd(43, "x");
const PROJECT = "some-firebase-project";

function fakeDeps(overrides: Partial<QaAccountDeps> = {}) {
  const written: unknown[] = [];
  const firebase = {
    getUserByEmail: vi.fn(async (): Promise<{ uid: string } | null> => null),
    createUser: vi.fn(async () => ({ uid: "uid-1" })),
    updateUser: vi.fn(async () => undefined),
    revokeRefreshTokens: vi.fn(async () => undefined),
  };
  const deps: QaAccountDeps = {
    databaseName: () => QA_ACCOUNT_DB_NAME,
    firebaseProjectId: "some-firebase-project",
    firebaseApiKey: "web-api-key",
    firebase,
    adminUserExists: vi.fn(async () => false),
    adminRoleId: vi.fn(async () => "admin-role-id"),
    createAdminInvite: vi.fn(async () => ({
      ok: true as const,
      refreshed: false,
    })),
    readQaEnv: vi.fn(async () => ({ preview: { baseUrl: "https://x" } })),
    writeQaEnv: vi.fn(async (value: unknown) => {
      written.push(value);
    }),
    generatePassword: () => PASSWORD,
    ...overrides,
  };
  return { deps, firebase, written };
}

describe("parseQaAccountArgs", () => {
  it("parses provision with an email and a qa-env path", () => {
    expect(
      parseQaAccountArgs([
        "provision",
        "--email",
        " QA-Account@Example.test ",
        "--firebase-project",
        "some-firebase-project",
        "--qa-env",
        "/x/qa-env.json",
      ]),
    ).toEqual({
      ok: true,
      args: {
        verb: "provision",
        email: EMAIL,
        qaEnvPath: "/x/qa-env.json",
        expectedFirebaseProject: "some-firebase-project",
        reuse: false,
      },
    });
  });

  it("parses --reuse on provision, in any position", () => {
    expect(
      parseQaAccountArgs([
        "provision",
        "--reuse",
        "--email",
        EMAIL,
        "--firebase-project",
        "p",
        "--qa-env",
        "/x",
      ]),
    ).toEqual({
      ok: true,
      args: {
        verb: "provision",
        email: EMAIL,
        qaEnvPath: "/x",
        expectedFirebaseProject: "p",
        reuse: true,
      },
    });
  });

  it("refuses --reuse on rotate", () => {
    expect(
      parseQaAccountArgs([
        "rotate",
        "--reuse",
        "--firebase-project",
        "p",
        "--qa-env",
        "/x",
      ]).ok,
    ).toBe(false);
  });

  it("parses rotate without an email", () => {
    expect(
      parseQaAccountArgs([
        "rotate",
        "--qa-env",
        "/x/qa-env.json",
        "--firebase-project",
        "some-firebase-project",
      ]),
    ).toEqual({
      ok: true,
      args: {
        verb: "rotate",
        qaEnvPath: "/x/qa-env.json",
        expectedFirebaseProject: "some-firebase-project",
      },
    });
  });

  it.each([
    [[]],
    [["delete", "--qa-env", "/x"]],
    [["provision", "--qa-env", "/x"]],
    [["provision", "--email", "not-an-email", "--qa-env", "/x"]],
    [["provision", "--email", EMAIL]],
    [["rotate", "--qa-env"]],
    [["rotate", "--qa-env", "/x", "--password", "nope"]],
    [["rotate", "--qa-env", "/x"]],
    [["provision", "--email", EMAIL, "--qa-env", "/x"]],
    [["rotate", "--qa-env", "/x", "--firebase-project", "  "]],
  ])("refuses bad usage %j", (argv) => {
    expect(parseQaAccountArgs(argv).ok).toBe(false);
  });
});

describe("generateQaPassword", () => {
  it("is at least 24 characters, URL-safe, and different every call", () => {
    const first = generateQaPassword();
    const second = generateQaPassword();
    expect(first.length).toBeGreaterThanOrEqual(24);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first).not.toBe(second);
  });
});

describe("mergeQaEnv", () => {
  it("sets adminQa.users.admin and keeps every other key", () => {
    const merged = mergeQaEnv(
      {
        preview: { baseUrl: "b" },
        adminQa: { users: { other: { a: 1 } }, keep: true },
      },
      { email: EMAIL, password: PASSWORD, firebaseApiKey: "k" },
    );
    expect(merged).toEqual({
      preview: { baseUrl: "b" },
      adminQa: {
        keep: true,
        users: {
          other: { a: 1 },
          admin: { email: EMAIL, password: PASSWORD, firebaseApiKey: "k" },
        },
      },
    });
  });

  it("starts from an empty object when the file held no object", () => {
    expect(
      mergeQaEnv(null, {
        email: EMAIL,
        password: PASSWORD,
        firebaseApiKey: "k",
      }),
    ).toEqual({
      adminQa: {
        users: {
          admin: { email: EMAIL, password: PASSWORD, firebaseApiKey: "k" },
        },
      },
    });
  });
});

describe("qa-env file helpers", () => {
  it("writes atomically with mode 600 and reads it back", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-env-"));
    const path = join(dir, "qa-env.json");
    writeFileSync(path, JSON.stringify({ keep: 1 }), { mode: 0o644 });

    await writeQaEnvFile(path, { keep: 1, added: 2 });

    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      keep: 1,
      added: 2,
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(await readQaEnvFile(path)).toEqual({ keep: 1, added: 2 });
  });

  it("reads a missing file as an empty object", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-env-"));
    expect(await readQaEnvFile(join(dir, "absent.json"))).toEqual({});
  });
});

describe("provisionQaAccount", () => {
  it("creates the Firebase user verified, stores credentials, then creates the Admin invite", async () => {
    const { deps, firebase, written } = fakeDeps();
    const result = await provisionQaAccount(
      { email: EMAIL, expectedFirebaseProject: PROJECT },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      verb: "provision",
      firebaseProjectId: "some-firebase-project",
      firebase: "created",
      invite: "created",
      qaEnv: "written",
    });
    expect(firebase.createUser).toHaveBeenCalledWith({
      email: EMAIL,
      password: PASSWORD,
      emailVerified: true,
    });
    expect(written).toEqual([
      {
        preview: { baseUrl: "https://x" },
        adminQa: {
          users: {
            admin: {
              email: EMAIL,
              password: PASSWORD,
              firebaseApiKey: "web-api-key",
            },
          },
        },
      },
    ]);
    expect(deps.createAdminInvite).toHaveBeenCalledWith({
      email: EMAIL,
      roleIds: ["admin-role-id"],
      locale: "es-AR",
    });
  });

  it("refuses an existing Firebase user without --reuse, before any write", async () => {
    const { deps, firebase, written } = fakeDeps();
    firebase.getUserByEmail.mockResolvedValueOnce({ uid: "uid-9" });
    const result = await provisionQaAccount(
      { email: EMAIL, expectedFirebaseProject: PROJECT, reuse: false },
      deps,
    );

    expect(result).toMatchObject({ ok: false, reason: "firebase-user-exists" });
    expect(firebase.createUser).not.toHaveBeenCalled();
    expect(firebase.updateUser).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
    expect(deps.createAdminInvite).not.toHaveBeenCalled();
  });

  it("refuses an existing Firebase user when reuse is omitted", async () => {
    const { deps, firebase } = fakeDeps();
    firebase.getUserByEmail.mockResolvedValueOnce({ uid: "uid-9" });
    const result = await provisionQaAccount(
      { email: EMAIL, expectedFirebaseProject: PROJECT },
      deps,
    );

    expect(result).toMatchObject({ ok: false, reason: "firebase-user-exists" });
    expect(firebase.updateUser).not.toHaveBeenCalled();
  });

  it("updates an existing Firebase user with --reuse instead of creating one", async () => {
    const { deps, firebase } = fakeDeps();
    firebase.getUserByEmail.mockResolvedValueOnce({ uid: "uid-9" });
    const result = await provisionQaAccount(
      { email: EMAIL, expectedFirebaseProject: PROJECT, reuse: true },
      deps,
    );

    expect(result).toMatchObject({ ok: true, firebase: "updated" });
    expect(firebase.createUser).not.toHaveBeenCalled();
    expect(firebase.updateUser).toHaveBeenCalledWith("uid-9", {
      password: PASSWORD,
      emailVerified: true,
    });
  });

  it.each([
    "ministry-admin",
    "ministry-admin-test",
    "ministry-admin-qa",
    "website-staging",
    "test",
  ])("refuses database %s before any write", async (name) => {
    const { deps, firebase, written } = fakeDeps({ databaseName: () => name });
    const result = await provisionQaAccount(
      { email: EMAIL, expectedFirebaseProject: PROJECT },
      deps,
    );

    expect(result).toMatchObject({ ok: false, reason: "db-guard" });
    expect(firebase.createUser).not.toHaveBeenCalled();
    expect(firebase.updateUser).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
    expect(deps.createAdminInvite).not.toHaveBeenCalled();
  });

  it("refuses when the database accessor itself refuses", async () => {
    const { deps } = fakeDeps({
      databaseName: () => {
        throw new Error("bad name");
      },
    });
    expect(
      await provisionQaAccount(
        { email: EMAIL, expectedFirebaseProject: PROJECT },
        deps,
      ),
    ).toMatchObject({ ok: false, reason: "db-guard" });
  });

  it("refuses when an AdminUser already holds the address (an invite would be inert)", async () => {
    const { deps, firebase, written } = fakeDeps({
      adminUserExists: vi.fn(async () => true),
    });
    const result = await provisionQaAccount(
      { email: EMAIL, expectedFirebaseProject: PROJECT },
      deps,
    );

    expect(result).toMatchObject({ ok: false, reason: "user-exists" });
    expect(firebase.createUser).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
  });

  it("refuses when the Firebase project or web API key is not configured", async () => {
    for (const override of [
      { firebaseProjectId: undefined },
      { firebaseApiKey: "" },
    ]) {
      const { deps, firebase } = fakeDeps(override);
      expect(
        await provisionQaAccount(
          { email: EMAIL, expectedFirebaseProject: PROJECT },
          deps,
        ),
      ).toMatchObject({ ok: false, reason: "missing-env" });
      expect(firebase.createUser).not.toHaveBeenCalled();
    }
  });

  it("refuses before any write when the env's Firebase project is not the one the operator named", async () => {
    const { deps, firebase, written } = fakeDeps({
      firebaseProjectId: "the-production-project",
    });
    const result = await provisionQaAccount(
      { email: EMAIL, expectedFirebaseProject: PROJECT },
      deps,
    );

    expect(result).toMatchObject({ ok: false, reason: "project-mismatch" });
    expect(firebase.getUserByEmail).not.toHaveBeenCalled();
    expect(firebase.createUser).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
    expect(deps.createAdminInvite).not.toHaveBeenCalled();
  });

  it("refuses when the admin system role is missing", async () => {
    const { deps, firebase } = fakeDeps({
      adminRoleId: vi.fn(async () => null),
    });
    expect(
      await provisionQaAccount(
        { email: EMAIL, expectedFirebaseProject: PROJECT },
        deps,
      ),
    ).toMatchObject({ ok: false, reason: "no-admin-role" });
    expect(firebase.createUser).not.toHaveBeenCalled();
  });

  it("reports a failed invite after the credentials are stored, so a re-run can finish", async () => {
    const { deps, written } = fakeDeps({
      createAdminInvite: vi.fn(async () => ({ ok: false as const })),
    });
    const result = await provisionQaAccount(
      { email: EMAIL, expectedFirebaseProject: PROJECT },
      deps,
    );

    expect(result).toMatchObject({ ok: false, reason: "invite-failed" });
    expect(written).toHaveLength(1);
  });

  it("never puts the password, email or API key in a result", async () => {
    const { deps } = fakeDeps();
    const text = JSON.stringify(
      await provisionQaAccount(
        { email: EMAIL, expectedFirebaseProject: PROJECT },
        deps,
      ),
    );
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain("web-api-key");
  });
});

describe("rotateQaPassword", () => {
  const stored = {
    adminQa: {
      users: {
        admin: { email: EMAIL, password: "old", firebaseApiKey: "old-key" },
      },
    },
  };

  it("sets a new password, stores it, and revokes old sessions", async () => {
    const { deps, firebase, written } = fakeDeps({
      readQaEnv: vi.fn(async () => stored),
    });
    firebase.getUserByEmail.mockResolvedValueOnce({ uid: "uid-3" });
    const result = await rotateQaPassword(
      { expectedFirebaseProject: PROJECT },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      verb: "rotate",
      firebaseProjectId: "some-firebase-project",
      firebase: "updated",
      qaEnv: "written",
      sessionsRevoked: true,
    });
    expect(firebase.updateUser).toHaveBeenCalledWith("uid-3", {
      password: PASSWORD,
    });
    expect(written).toEqual([
      {
        adminQa: {
          users: {
            admin: {
              email: EMAIL,
              password: PASSWORD,
              firebaseApiKey: "web-api-key",
            },
          },
        },
      },
    ]);
    expect(firebase.revokeRefreshTokens).toHaveBeenCalledWith("uid-3");
  });

  it("refuses a non-staging database", async () => {
    const { deps, firebase } = fakeDeps({
      databaseName: () => "ministry-admin",
      readQaEnv: vi.fn(async () => stored),
    });
    expect(
      await rotateQaPassword({ expectedFirebaseProject: PROJECT }, deps),
    ).toMatchObject({ ok: false, reason: "db-guard" });
    expect(firebase.updateUser).not.toHaveBeenCalled();
  });

  it("refuses a Firebase project mismatch before touching the user", async () => {
    const { deps, firebase, written } = fakeDeps({
      firebaseProjectId: "the-production-project",
      readQaEnv: vi.fn(async () => stored),
    });
    expect(
      await rotateQaPassword({ expectedFirebaseProject: PROJECT }, deps),
    ).toMatchObject({
      ok: false,
      reason: "project-mismatch",
    });
    expect(firebase.getUserByEmail).not.toHaveBeenCalled();
    expect(firebase.updateUser).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
  });

  it("refuses when qa-env.json holds no account", async () => {
    const { deps, firebase } = fakeDeps({ readQaEnv: vi.fn(async () => ({})) });
    expect(
      await rotateQaPassword({ expectedFirebaseProject: PROJECT }, deps),
    ).toMatchObject({ ok: false, reason: "not-provisioned" });
    expect(firebase.updateUser).not.toHaveBeenCalled();
  });

  it("refuses when the Firebase user does not exist", async () => {
    const { deps, firebase, written } = fakeDeps({
      readQaEnv: vi.fn(async () => stored),
    });
    expect(
      await rotateQaPassword({ expectedFirebaseProject: PROJECT }, deps),
    ).toMatchObject({ ok: false, reason: "not-provisioned" });
    expect(firebase.updateUser).not.toHaveBeenCalled();
    expect(written).toHaveLength(0);
  });
});
