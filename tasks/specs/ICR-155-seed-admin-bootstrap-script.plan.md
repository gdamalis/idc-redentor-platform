# ICR-155 — `seed:admin` Bootstrap Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a one-off, human-run, six-guard CLI that seeds the system roles and one pending Admin invite into the `ministry-admin*` database, so the first human can get through the invite-only door via Google sign-in.

**Architecture:** Everything testable lives in `apps/admin/src/lib/rbac/seed-admin.ts` (arg parsing, orchestration, exit-code map, host redaction) because `vitest` only globs `src/**`; `apps/admin/scripts/seed-admin.ts` is a thin shell that reads argv, prints a banner to stderr, confirms, calls `seedAdmin`, writes one JSON line to stdout, and exits. `seedAdmin` takes its six collaborators as an injected `deps` object with real defaults, so tests control every one without `vi.mock`. Every guard delegates to an already-shipped function — nothing is reimplemented.

**Tech Stack:** TypeScript (strict) · `tsx@4.23.1` · Vitest 4 · Zod 3 · mongodb 6 driver · pnpm workspace (`@idcr/admin`)

**Spec:** `tasks/specs/ICR-155-seed-admin-bootstrap-script.md` — read §0 first; it documents why the ticket's "defect 1" no longer exists.

## Global Constraints

- **Functional-first, no classes.** Outcomes are discriminated-union return values, never thrown `Error` subclasses. The single documented exception already in the codebase is `getAdminDb()`'s throw, which this code **catches at its boundary** and maps to `{ ok: false, reason: "db-guard" }`.
- **`??` over `||`.** `interface` over `type` for object shapes. Const maps, never enums.
- **NO hardcoded email address anywhere in the diff** — not `gabriel@idcredentor.org`, not any `@idcredentor.org` address, not as a default parameter, fallback constant, or test fixture. Test fixtures use `example.com`. The only permitted occurrence in the entire diff is inside `docs/architecture/admin-bootstrap.md`.
- **No database-name env var**, no second copy of the DB allowlist, no local re-derivation. `deps.getAdminDb()` is the only database resolution.
- **Never print `MONGODB_URI`** or any secret. The banner prints the resolved DB name and a redacted hostname only.
- **Do not modify `apps/admin/src/service/database.service.ts`.** The MongoClient stays private; the script terminates with `process.exit`.
- **Do not add the script to** `turbo.json`, any file under `.github/workflows/`, or any `postinstall`/`prepare` hook.
- **Commit AND push at the end of every task** (`git push`) — the draft PR only reflects what is pushed (ICR-164 lesson).
- **Never use `--no-verify`.** Husky's `lint-staged` + `commitlint` must pass.
- **The pre-commit hook rejects credential-bearing Mongo URIs, even fake ones.** `.husky/pre-commit`
  aborts on any staged diff matching `mongodb(\+srv)?://[^@[:space:]]+@`. Since `--no-verify` is
  banned, every test fixture, doc example, and shell snippet that needs such a URI must **assemble it
  from parts** so the pattern never appears contiguously on one line — `[scheme + credentials,
host].join("@")` in TypeScript, or a `SCHEME`/`CRED`/`HOST` variable trio in bash. Both forms are
  already written that way in Tasks 2 and 4; keep them that way. (Verified: this hook blocked the very
  first attempt to commit this plan.)
- Verification commands are never judged through a pipe — redirect to a file and check `$?` on the next line (ICR-128 lesson).
- Commit header ≤ 100 chars, Conventional Commits.
- Node 22.14.0, pnpm. Run admin-scoped commands as `pnpm --filter @idcr/admin <task>`.

**Baseline:** `pnpm --filter @idcr/admin test` = **342 passing, 40 files** before this plan. Every task must leave it green and growing.

**Already landed during planning (do not redo):** `tsx@4.23.1` was added as an `@idcr/admin` devDependency to empirically verify that tsx resolves the `@src/*` tsconfig aliases (it does). `apps/admin/package.json` and `pnpm-lock.yaml` are therefore already modified in the worktree; Task 4 adds the `seed:admin` script entry and commits both.

---

### Task 1: Allow `createInvite` without an inviting user

The seed script has no actor user id. `CreateInviteInput.invitedByUserId` is required today, while the stored `Invite.invitedByUserId` is already `?: string` with the comment `// nullable (seeded invites have none)`. Relaxing the input is one line — but it opens a real hazard: the driver serialises `undefined` to BSON **`null`**, and `inviteSchema` types the field `z.string().optional()`, which **rejects `null`**. A seeded invite would then throw on every later `claimPendingInvite`, breaking the exact sign-in this ticket exists to enable. So the `$set` must **omit** the key.

**Files:**

- Modify: `apps/admin/src/service/invite.service.ts` (interface at :11-16, `$set` at :118-126, doc comment)
- Test: `apps/admin/src/service/invite.service.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `CreateInviteInput` with `readonly invitedByUserId?: string`. Task 3 relies on being able to call `createInvite({ email, roleIds, locale }, session)` with the field absent.

- [ ] **Step 1: Write the failing tests**

Append to `apps/admin/src/service/invite.service.test.ts` inside the existing `describe("createInvite", ...)` block (match the file's existing mock style — module-level `vi.fn()`s and `await import(...)` inside each test):

```ts
it("omits invitedByUserId from $set when the caller provides none (ICR-155 seed path)", async () => {
  const { createInvite } = await import("./invite.service");
  findOneAndUpdate.mockResolvedValueOnce({
    value: { _id: { toHexString: () => "inv-seed" } },
    lastErrorObject: { updatedExisting: false },
  });

  const result = await createInvite(
    { email: "seed@example.com", roleIds: ["r-admin"], locale: "es-AR" },
    {} as never,
  );

  expect(result).toEqual({ ok: true, inviteId: "inv-seed", refreshed: false });

  const update = findOneAndUpdate.mock.calls[0]?.[1];
  // The key must be ABSENT, not present-and-undefined: the driver serialises
  // undefined to BSON null, and inviteSchema's z.string().optional() rejects null.
  expect(Object.keys(update.$set)).not.toContain("invitedByUserId");
  expect(update.$setOnInsert).toMatchObject({
    email: "seed@example.com",
    status: "pending",
  });
});

it("still writes invitedByUserId when the caller provides one (UI path regression)", async () => {
  const { createInvite } = await import("./invite.service");
  findOneAndUpdate.mockResolvedValueOnce({
    value: { _id: { toHexString: () => "inv-ui" } },
    lastErrorObject: { updatedExisting: true },
  });

  const result = await createInvite(
    {
      email: "ui@example.com",
      roleIds: ["r1"],
      locale: "en-US",
      invitedByUserId: "u-admin",
    },
    {} as never,
  );

  expect(result).toEqual({ ok: true, inviteId: "inv-ui", refreshed: true });
  expect(findOneAndUpdate.mock.calls[0]?.[1].$set.invitedByUserId).toBe(
    "u-admin",
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @idcr/admin test -- src/service/invite.service.test.ts > /tmp/t1-red.log 2>&1; echo "exit=$?"
tail -30 /tmp/t1-red.log
```

Expected: the **first** test fails to compile/typecheck the call (`invitedByUserId` is required) or fails the `Object.keys` assertion because the key is present with value `undefined`. The second test passes already. Record the actual failure text — this is the reproduction.

- [ ] **Step 3: Relax the input interface**

In `apps/admin/src/service/invite.service.ts`:

```ts
export interface CreateInviteInput {
  readonly email: string;
  readonly roleIds: readonly string[];
  readonly locale: Locale;
  /**
   * Optional: the seed bootstrap (ICR-155) has no actor user, and
   * `Invite.invitedByUserId` is already optional on the stored type
   * ("seeded invites have none"). When absent the key is OMITTED from the
   * `$set` below — never written as `undefined`, which the driver would
   * serialise to BSON `null` and `inviteSchema`'s `z.string().optional()`
   * would then reject on every subsequent read.
   */
  readonly invitedByUserId?: string;
}
```

- [ ] **Step 4: Build the `$set` conditionally**

Replace the inline `$set` object literal in `createInvite` with:

```ts
const set: Record<string, unknown> = {
  roleIds: [...input.roleIds],
  locale: input.locale,
  expiresAt: new Date(now.getTime() + INVITE_EXPIRY_MS),
};
if (input.invitedByUserId !== undefined) {
  set.invitedByUserId = input.invitedByUserId;
}
```

and use it in the call:

```ts
      .findOneAndUpdate(
        { email, status: "pending" },
        { $set: set, $setOnInsert: { email, status: "pending", createdAt: now } },
        { upsert: true, returnDocument: "after", includeResultMetadata: true, session },
      );
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @idcr/admin test -- src/service/invite.service.test.ts > /tmp/t1-green.log 2>&1; echo "exit=$?"
tail -20 /tmp/t1-green.log
```

Expected: PASS, with 2 more tests than before.

- [ ] **Step 6: Verify nothing else depended on the field being required**

```bash
pnpm --filter @idcr/admin type-check > /tmp/t1-tsc.log 2>&1; echo "exit=$?"
pnpm --filter @idcr/admin test > /tmp/t1-all.log 2>&1; echo "exit=$?"; tail -6 /tmp/t1-all.log
```

Expected: type-check clean (proves `inviteUserAction` still compiles), full suite **344 passing**.

- [ ] **Step 7: Commit and push**

```bash
git add apps/admin/src/service/invite.service.ts apps/admin/src/service/invite.service.test.ts
git commit -m "feat(ICR-155): allow createInvite without an inviting user"
git push
```

---

### Task 2: Arg parsing, exit codes, host redaction

The pure, side-effect-free half of the CLI. It lives in `src/` so Vitest actually runs its tests — a test under `scripts/` would be **silently skipped** (`vitest.config.ts` includes only `src/**`).

**Files:**

- Create: `apps/admin/src/lib/rbac/seed-admin.ts`
- Create: `apps/admin/src/lib/rbac/seed-admin.test.ts`

**Interfaces:**

- Consumes: `normalizeEmail` from `@src/lib/auth/email`; `i18n`/`Locale` from `@src/i18n/config`.
- Produces, for Tasks 3 and 4:
  - `interface SeedArgs { readonly email: string; readonly locale: Locale; readonly force: boolean; readonly yes: boolean; readonly dryRun: boolean; readonly sendEmail: boolean }`
  - `type ParseSeedArgsResult = { ok: true; args: SeedArgs } | { ok: false; reason: "usage" | "invalid-email"; message: string }`
  - `function parseSeedArgs(argv: readonly string[], env?: NodeJS.ProcessEnv): ParseSeedArgsResult`
  - `function exitCodeFor(result: SeedAdminResult | { ok: false; reason: "usage" | "invalid-email"; message: string }): 0 | 1 | 2`
  - `function redactMongoHost(uri: string | undefined): string`
  - `type SeedAdminFailure = "db-guard" | "admin-exists" | "invalid-email" | "write-failed"`
  - `type SeedAdminResult` (defined here, implemented in Task 3)

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/src/lib/rbac/seed-admin.test.ts`:

```ts
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
    } as NodeJS.ProcessEnv);
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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @idcr/admin test -- src/lib/rbac/seed-admin.test.ts > /tmp/t2-red.log 2>&1; echo "exit=$?"
tail -20 /tmp/t2-red.log
```

Expected: FAIL — cannot resolve `./seed-admin`.

- [ ] **Step 3: Write the implementation**

Create `apps/admin/src/lib/rbac/seed-admin.ts`:

```ts
import { z } from "zod";
import { i18n } from "@src/i18n/config";
import type { Locale } from "@src/i18n/config";
import { normalizeEmail } from "@src/lib/auth/email";

export interface SeedArgs {
  readonly email: string;
  readonly locale: Locale;
  readonly force: boolean;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly sendEmail: boolean;
}

export type SeedAdminFailure =
  | "db-guard"
  | "admin-exists"
  | "invalid-email"
  | "write-failed";

/**
 * Discriminated on `dryRun` so a dry run is structurally incapable of
 * reporting ids it never created.
 */
export type SeedAdminResult =
  | { ok: true; dryRun: true }
  | {
      ok: true;
      dryRun: false;
      roleIds: string[];
      inviteId: string;
      refreshed: boolean;
    }
  | { ok: false; reason: SeedAdminFailure; message: string };

export type ParseSeedArgsResult =
  | { ok: true; args: SeedArgs }
  | { ok: false; reason: "usage" | "invalid-email"; message: string };

const BOOLEAN_FLAGS = {
  "--force": "force",
  "--yes": "yes",
  "--dry-run": "dryRun",
  "--send-email": "sendEmail",
} as const;

const VALUE_FLAGS = {
  "--email": "email",
  "--locale": "locale",
} as const;

export const USAGE = `Usage: pnpm --filter @idcr/admin seed:admin --email <address> [options]

  --email <address>   REQUIRED (or ADMIN_SEED_EMAIL). The first Admin's address.
  --locale <loc>      ${i18n.locales.join(" | ")}   (default: ${i18n.defaultLocale})
  --force             Proceed even when the panel is already self-administrable.
                      Never relaxes the database guard.
  --yes               Skip the interactive confirmation.
  --dry-run           Print the plan; write nothing.
  --send-email        Also send the courtesy invite email (opt-in; needs mail env).

Env:  MONGODB_URI (required - its PATH decides the target database)
      ADMIN_SEED_EMAIL (optional alternative to --email)
Exit: 0 success - 1 operation failure - 2 usage/guard refusal`;

const seedArgsSchema = z.object({
  email: z.string().min(1).email(),
  locale: z.enum(i18n.locales).default(i18n.defaultLocale),
  force: z.boolean().default(false),
  yes: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  sendEmail: z.boolean().default(false),
});

export function parseSeedArgs(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): ParseSeedArgsResult {
  const raw: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";

    if (token in BOOLEAN_FLAGS) {
      raw[BOOLEAN_FLAGS[token as keyof typeof BOOLEAN_FLAGS]] = true;
      continue;
    }

    if (token in VALUE_FLAGS) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return {
          ok: false,
          reason: "usage",
          message: `${token} requires a value.`,
        };
      }
      raw[VALUE_FLAGS[token as keyof typeof VALUE_FLAGS]] = value;
      index += 1;
      continue;
    }

    return {
      ok: false,
      reason: "usage",
      message: `Unknown argument: ${token}`,
    };
  }

  // normalizeEmail trims + lowercases; it returns "" for null/undefined.
  const email = normalizeEmail(
    typeof raw.email === "string" ? raw.email : env.ADMIN_SEED_EMAIL,
  );
  if (!email) {
    return {
      ok: false,
      reason: "usage",
      message: "--email (or ADMIN_SEED_EMAIL) is required.",
    };
  }

  const parsed = seedArgsSchema.safeParse({ ...raw, email });
  if (!parsed.success) {
    const isEmailIssue = parsed.error.issues.some(
      (issue) => issue.path[0] === "email",
    );
    return {
      ok: false,
      reason: isEmailIssue ? "invalid-email" : "usage",
      message: parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    };
  }

  return { ok: true, args: parsed.data };
}

export function exitCodeFor(
  result:
    | SeedAdminResult
    | { ok: false; reason: "usage" | "invalid-email"; message: string },
): 0 | 1 | 2 {
  if (result.ok) return 0;
  return result.reason === "write-failed" ? 1 : 2;
}

/**
 * Guard 6. Returns the cluster hostname ONLY — never the userinfo, never the
 * raw string on a parse failure (which could itself contain a credential).
 */
export function redactMongoHost(uri: string | undefined): string {
  if (!uri) return "<unset>";
  try {
    const { hostname } = new URL(uri);
    return hostname === "" ? "<unparseable>" : hostname;
  } catch {
    return "<unparseable>";
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @idcr/admin test -- src/lib/rbac/seed-admin.test.ts > /tmp/t2-green.log 2>&1; echo "exit=$?"
tail -20 /tmp/t2-green.log
```

Expected: PASS, all 15 tests.

- [ ] **Step 5: Prove the redaction guard by mutation**

Temporarily change `redactMongoHost`'s catch branch to `return uri;`. Re-run the file. The "never echoes an unparseable URI back" test **must** fail. Then `git checkout -- apps/admin/src/lib/rbac/seed-admin.ts`… — no: the file is untracked at this point, so instead **undo the edit by hand** and re-run to confirm green. Paste the observed failure into the commit body as evidence the guard is real, not decorative (ICR-18 rule: prove a gate by mutation or it is decoration).

- [ ] **Step 6: Verify the whole suite and types**

```bash
pnpm --filter @idcr/admin type-check > /tmp/t2-tsc.log 2>&1; echo "exit=$?"
pnpm --filter @idcr/admin lint > /tmp/t2-lint.log 2>&1; echo "exit=$?"
pnpm --filter @idcr/admin test > /tmp/t2-all.log 2>&1; echo "exit=$?"; tail -6 /tmp/t2-all.log
```

Expected: all clean; **359 passing**.

- [ ] **Step 7: Commit and push**

```bash
git add apps/admin/src/lib/rbac/seed-admin.ts apps/admin/src/lib/rbac/seed-admin.test.ts
git commit -m "feat(ICR-155): add seed-admin arg parsing, exit codes, host redaction"
git push
```

---

### Task 3: `seedAdmin` orchestration and the six guards

The heart of the ticket. Every guard delegates to an already-shipped function. The administrability check runs **before any write**, which is what makes "refuses with zero writes" literally true.

**Files:**

- Modify: `apps/admin/src/lib/rbac/seed-admin.ts` (append)
- Modify: `apps/admin/src/lib/rbac/seed-admin.test.ts` (append)

**Interfaces:**

- Consumes: `SeedArgs`, `SeedAdminResult`, `SeedAdminFailure` (Task 2); `getAdminDb`/`withAdminTransaction` (`@src/service/database.service`); `seedSystemRoles`/`listRoles` (`@src/service/role.service`); `listUsers` (`@src/service/user.service`); `createInvite` (`@src/service/invite.service`, made optional-friendly in Task 1); `retainsAdministrability`/`AdminStateSnapshot` (`./last-admin`).
- Produces, for Task 4:
  - `interface SeedAdminDeps` (six members, listed below)
  - `const defaultSeedAdminDeps: SeedAdminDeps`
  - `async function seedAdmin(args: SeedArgs, deps?: SeedAdminDeps): Promise<SeedAdminResult>`

- [ ] **Step 1: Write the failing tests**

Append to `apps/admin/src/lib/rbac/seed-admin.test.ts`. Add `vi` to the vitest import at the top of the file (`import { describe, expect, it, vi } from "vitest";`) and add `seedAdmin` to the `./seed-admin` import.

```ts
import type { SeedAdminDeps, SeedArgs } from "./seed-admin";

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
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @idcr/admin test -- src/lib/rbac/seed-admin.test.ts > /tmp/t3-red.log 2>&1; echo "exit=$?"
tail -25 /tmp/t3-red.log
```

Expected: FAIL — `seedAdmin` is not exported.

- [ ] **Step 3: Write the implementation**

Append to `apps/admin/src/lib/rbac/seed-admin.ts` (and add the imports at the top of the file):

```ts
import {
  getAdminDb,
  withAdminTransaction,
} from "@src/service/database.service";
import { listRoles, seedSystemRoles } from "@src/service/role.service";
import { listUsers } from "@src/service/user.service";
import { createInvite } from "@src/service/invite.service";
import { retainsAdministrability } from "./last-admin";
import type { AdminStateSnapshot } from "./last-admin";
```

```ts
/**
 * The six collaborators, injected so tests control every one of them without
 * `vi.mock`. Each is an already-shipped function: this script orchestrates,
 * it never reimplements a guard.
 */
export interface SeedAdminDeps {
  readonly getAdminDb: typeof getAdminDb;
  readonly seedSystemRoles: typeof seedSystemRoles;
  readonly listRoles: typeof listRoles;
  readonly listUsers: typeof listUsers;
  readonly createInvite: typeof createInvite;
  readonly withAdminTransaction: typeof withAdminTransaction;
}

export const defaultSeedAdminDeps: SeedAdminDeps = {
  getAdminDb,
  seedSystemRoles,
  listRoles,
  listUsers,
  createInvite,
  withAdminTransaction,
};

/**
 * Retries the whole TRANSACTION, never the operation inside it: a duplicate
 * key inside a transaction aborts it server-side, and a same-session retry
 * would read the pre-race snapshot and could never observe the winner. Mirrors
 * `inviteUserAction`'s documented pattern.
 */
async function createBootstrapInvite(
  deps: SeedAdminDeps,
  input: { email: string; roleIds: string[]; locale: Locale },
): Promise<{ ok: true; inviteId: string; refreshed: boolean } | { ok: false }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await deps.withAdminTransaction((session) =>
      deps.createInvite(input, session),
    );
    if (result.ok) return result;
  }
  return { ok: false };
}

export async function seedAdmin(
  args: SeedArgs,
  deps: SeedAdminDeps = defaultSeedAdminDeps,
): Promise<SeedAdminResult> {
  // Guard 1 — wrong database. Delegated entirely to getAdminDb(), which throws
  // on any name outside its positive allowlist. Never relaxed by --force.
  try {
    deps.getAdminDb();
  } catch (error) {
    return {
      ok: false,
      reason: "db-guard",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  // Guard 2 — already administrable. Evaluated BEFORE any write, so a refusal
  // leaves the database byte-for-byte untouched. On a fresh database the
  // snapshot is empty, the predicate is false, and the seed proceeds.
  const [users, roles] = await Promise.all([
    deps.listUsers(),
    deps.listRoles(),
  ]);
  const snapshot: AdminStateSnapshot = {
    users: users.map((user) => ({
      id: user._id.toHexString(),
      status: user.status,
      roleIds: user.roleIds,
    })),
    roles: roles.map((role) => ({
      id: role._id.toHexString(),
      permissions: role.permissions,
    })),
  };

  if (retainsAdministrability(snapshot) && !args.force) {
    return {
      ok: false,
      reason: "admin-exists",
      message:
        "The panel is already self-administrable — an active user holds both " +
        "users:manage and roles:manage. Pass --force only to recover from a genuine lockout.",
    };
  }

  if (args.dryRun) return { ok: true, dryRun: true };

  // Guard 3 — idempotency is inherited, never reimplemented: seedSystemRoles
  // upserts by the immutable Role.key with $setOnInsert, and createInvite is a
  // single atomic upsert on { email, status: "pending" }.
  await deps.seedSystemRoles();

  // seedSystemRoles returns void, so the Admin role id is read back by its
  // immutable key rather than by name.
  const seededRoles = await deps.listRoles();
  const adminRole = seededRoles.find((role) => role.key === "admin");
  if (!adminRole) {
    return {
      ok: false,
      reason: "write-failed",
      message:
        'No role with key "admin" exists after seedSystemRoles() — the seed did not apply.',
    };
  }

  const invite = await createBootstrapInvite(deps, {
    email: args.email,
    roleIds: [adminRole._id.toHexString()],
    locale: args.locale,
  });

  if (!invite.ok) {
    return {
      ok: false,
      reason: "write-failed",
      message:
        "Could not create the bootstrap invite: the upsert lost an insert race twice. Re-run the script.",
    };
  }

  return {
    ok: true,
    dryRun: false,
    roleIds: seededRoles
      .filter((role) => role.isSystem)
      .map((role) => role._id.toHexString()),
    inviteId: invite.inviteId,
    refreshed: invite.refreshed,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @idcr/admin test -- src/lib/rbac/seed-admin.test.ts > /tmp/t3-green.log 2>&1; echo "exit=$?"
tail -20 /tmp/t3-green.log
```

Expected: PASS, all 27 tests in the file.

- [ ] **Step 5: Prove guard 2's ordering by mutation**

Move the `await deps.seedSystemRoles();` line **above** the `retainsAdministrability` check. Re-run. The "refuses with admin-exists and performs ZERO writes" test **must** fail on `expect(deps.seedSystemRoles).not.toHaveBeenCalled()`. Restore the correct order, re-run green, and paste the observed failure into the commit body. This is the one ordering decision in the whole ticket that a reasonable person could get wrong, so it needs a test that actually catches it.

- [ ] **Step 6: Full verification**

```bash
pnpm --filter @idcr/admin type-check > /tmp/t3-tsc.log 2>&1; echo "exit=$?"
pnpm --filter @idcr/admin lint > /tmp/t3-lint.log 2>&1; echo "exit=$?"
pnpm --filter @idcr/admin test > /tmp/t3-all.log 2>&1; echo "exit=$?"; tail -6 /tmp/t3-all.log
```

Expected: clean; **371 passing**.

- [ ] **Step 7: Commit and push**

```bash
git add apps/admin/src/lib/rbac/seed-admin.ts apps/admin/src/lib/rbac/seed-admin.test.ts
git commit -m "feat(ICR-155): add guarded seedAdmin bootstrap orchestration"
git push
```

---

### Task 4: The CLI shell and package wiring

A thin, deliberately untested-by-unit shell — everything it could get wrong lives in Task 2/3. It owns the three things that are inherently process-level: the `CI` refusal, the interactive confirm, and termination.

**Files:**

- Create: `apps/admin/scripts/seed-admin.ts`
- Modify: `apps/admin/package.json` (add the `seed:admin` script; the `tsx` devDep is already present)
- Modify: `pnpm-lock.yaml` (already updated by the planning-time `tsx` install)

**Interfaces:**

- Consumes: `parseSeedArgs`, `seedAdmin`, `exitCodeFor`, `redactMongoHost`, `USAGE`, `SeedAdminResult` (Tasks 2–3); `getAdminDb` (`@src/service/database.service`); `sendInviteEmail` (`@src/service/auth-email`).
- Produces: the `pnpm --filter @idcr/admin seed:admin` entry point. Nothing imports this file.

- [ ] **Step 1: Write the CLI shell**

Create `apps/admin/scripts/seed-admin.ts`:

```ts
/**
 * ICR-155 — the one-time Ministry Admin bootstrap.
 *
 * Human-run only. Writes Mongo exclusively: it never creates a Firebase user,
 * never publishes, never touches the website database. See
 * docs/architecture/admin-bootstrap.md for the runbook.
 *
 * Exit codes: 0 success - 1 operation failure - 2 usage/guard refusal.
 */
import { writeSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { getAdminDb } from "@src/service/database.service";
import { sendInviteEmail } from "@src/service/auth-email";
import {
  USAGE,
  exitCodeFor,
  parseSeedArgs,
  redactMongoHost,
  seedAdmin,
} from "@src/lib/rbac/seed-admin";
import type { SeedAdminResult } from "@src/lib/rbac/seed-admin";

// stdout carries exactly one JSON line (machine-readable); all narration goes
// to stderr so a caller can pipe stdout safely.
const narrate = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

/**
 * writeSync is synchronous even when stdout is a pipe, so the JSON line cannot
 * be truncated by the process.exit below. (process.stdout.write is async on a
 * pipe, and process.exit does not flush it.)
 */
const emit = (
  result: SeedAdminResult | { ok: false; reason: string; message: string },
): never => {
  writeSync(1, `${JSON.stringify(result)}\n`);
  process.exit(exitCodeFor(result as SeedAdminResult));
};

async function main(): Promise<never> {
  // Guard 5a — never in automation. Checked before ANY database access.
  if (process.env.CI) {
    narrate("Refusing to run: CI is set. This bootstrap is human-run only.");
    return emit({
      ok: false,
      reason: "usage",
      message: "Refusing to run under CI.",
    });
  }

  const parsed = parseSeedArgs(process.argv.slice(2));
  if (!parsed.ok) {
    narrate(parsed.message);
    narrate("");
    narrate(USAGE);
    return emit(parsed);
  }

  const { args } = parsed;

  // Guard 1 runs inside seedAdmin too; this early call is what lets the banner
  // print the RESOLVED database name before the human confirms.
  let databaseName: string;
  try {
    databaseName = getAdminDb().databaseName;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    narrate(message);
    return emit({ ok: false, reason: "db-guard", message });
  }

  // Guard 6 — names and a redacted host only; never the URI itself.
  narrate("");
  narrate("  Ministry Admin bootstrap");
  narrate(`  database : ${databaseName}`);
  narrate(`  cluster  : ${redactMongoHost(process.env.MONGODB_URI)}`);
  narrate(`  invite   : ${args.email} (${args.locale})`);
  narrate(
    `  mode     : ${args.dryRun ? "DRY RUN (writes nothing)" : "WRITE"}${args.force ? " --force" : ""}`,
  );
  narrate("");

  // Guard 5b — deliberate. --yes is the non-interactive human escape hatch.
  if (!args.yes && !args.dryRun) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    const answer = await rl.question(
      `Grant Admin to ${args.email} on "${databaseName}"? [y/N] `,
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "y") {
      narrate("Aborted — nothing was written.");
      return emit({
        ok: false,
        reason: "usage",
        message: "Confirmation declined.",
      });
    }
  }

  const result = await seedAdmin(args);

  // Opt-in courtesy only. The invite URL carries no token, so a failed send is
  // never fatal: the invite is already committed and the human can sign in.
  if (result.ok && !result.dryRun && args.sendEmail) {
    const base = process.env.NEXT_PUBLIC_ADMIN_BASE_URL;
    if (!base) {
      narrate("--send-email skipped: NEXT_PUBLIC_ADMIN_BASE_URL is not set.");
    } else {
      const sent = await sendInviteEmail({
        to: args.email,
        inviteUrl: `${base}/${args.locale}/login`,
        locale: args.locale,
      });
      narrate(
        sent
          ? "Invite email sent."
          : "Invite email FAILED to send (the invite is still valid).",
      );
    }
  }

  if (!result.ok) narrate(result.message);
  return emit(result);
}

await main();
```

- [ ] **Step 2: Add the package script**

In `apps/admin/package.json`, add to `"scripts"` (after `"test:watch"`):

```json
    "seed:admin": "tsx scripts/seed-admin.ts"
```

- [ ] **Step 3: Verify the guards behave, end to end, without a database**

Each of these must exit non-zero and write nothing. Run from the repo root.

```bash
# Guard 5a — CI refusal (before any DB access)
CI=1 pnpm --filter @idcr/admin seed:admin --email a@example.com --yes > /tmp/t4-ci.log 2>&1
echo "CI refusal exit=$?  (expect 2)"; cat /tmp/t4-ci.log

# Guard 4 — no email
pnpm --filter @idcr/admin seed:admin > /tmp/t4-noemail.log 2>&1
echo "no-email exit=$?  (expect 2)"

# Guard 4 — malformed email
pnpm --filter @idcr/admin seed:admin --email nope > /tmp/t4-bademail.log 2>&1
echo "bad-email exit=$?  (expect 2)"

# Guard 1 — the driver's silent `test` fallback (URI with no path database)
MONGODB_URI='mongodb://127.0.0.1:27017' \
  pnpm --filter @idcr/admin seed:admin --email a@example.com --yes > /tmp/t4-testdb.log 2>&1
echo "test-fallback exit=$?  (expect 2)"; grep -c 'ministry-admin' /tmp/t4-testdb.log

# Guard 1 — the WEBSITE database must be refused
MONGODB_URI='mongodb://127.0.0.1:27017/website' \
  pnpm --filter @idcr/admin seed:admin --email a@example.com --yes > /tmp/t4-website.log 2>&1
echo "website-db exit=$?  (expect 2)"

# Guard 1 is NOT relaxed by --force
MONGODB_URI='mongodb://127.0.0.1:27017/website' \
  pnpm --filter @idcr/admin seed:admin --email a@example.com --yes --force > /tmp/t4-force.log 2>&1
echo "website-db+force exit=$?  (expect 2)"

# Guard 6 — no secret ever reaches the output.
# The scheme is held in its own variable so this command never contains a
# scheme-then-userinfo sequence on one line (the pre-commit hook rejects it).
SCHEME='mongodb+srv://'; CRED='seeduser:sup3rsecret'; HOST='cluster0.abcde.mongodb.net/website'
MONGODB_URI="$SCHEME$CRED@$HOST" \
  pnpm --filter @idcr/admin seed:admin --email a@example.com --yes > /tmp/t4-secret.log 2>&1
echo "exit=$?"
grep -c 'sup3rsecret\|seeduser' /tmp/t4-secret.log   # MUST print 0
grep -c 'cluster0.abcde.mongodb.net' /tmp/t4-secret.log  # MUST print >= 1
```

Every command must exit **2**, and the secret grep must print **0**. Record the outputs; they are the QA evidence for the guard ACs.

- [ ] **Step 4: Verify the automation-absence AC**

```bash
grep -rn 'seed:admin\|seed-admin' turbo.json .github/ 2>/dev/null; echo "hits above (expect NONE)"
grep -n 'postinstall\|prepare' apps/admin/package.json; echo "(expect no seed reference)"
```

- [ ] **Step 5: Verify the no-hardcoded-address AC**

```bash
git diff origin/main...HEAD > /tmp/t4-diff.txt
grep -n '@idcredentor\.org' /tmp/t4-diff.txt; echo "hits above (expect NONE — the runbook lands in Task 5)"
```

- [ ] **Step 6: Full verification**

```bash
pnpm --filter @idcr/admin type-check > /tmp/t4-tsc.log 2>&1; echo "exit=$?"
pnpm --filter @idcr/admin lint > /tmp/t4-lint.log 2>&1; echo "exit=$?"
pnpm --filter @idcr/admin test > /tmp/t4-all.log 2>&1; echo "exit=$?"; tail -6 /tmp/t4-all.log
pnpm build > /tmp/t4-build.log 2>&1; echo "build exit=$?"; tail -10 /tmp/t4-build.log
```

type-check must cover `scripts/seed-admin.ts` (tsconfig `include` is `**/*.ts`). Expected: all clean, **371 passing**.

- [ ] **Step 7: Commit and push**

```bash
git add apps/admin/scripts/seed-admin.ts apps/admin/package.json pnpm-lock.yaml
git commit -m "feat(ICR-155): add seed:admin CLI entrypoint"
git push
```

---

### Task 5: Runbook, doc index, changeset

The runbook is a deliverable, not an afterthought: it is the only place the first Admin's address may appear, and the only place the Google-sign-in constraint is written down.

**Files:**

- Create: `docs/architecture/admin-bootstrap.md`
- Create: `.changeset/<name>.md`
- Modify: `docs/architecture/admin-rbac.md` (cross-link from § Known limitations)
- Modify: `CLAUDE.md` (engineering-docs index)

**Interfaces:**

- Consumes: the CLI contract from Task 4.
- Produces: nothing code depends on.

- [ ] **Step 1: Write the runbook**

Create `docs/architecture/admin-bootstrap.md` covering, in this order:

1. **Why this exists** — `apps/admin` is invite-only; only a holder of `users:manage` can invite; a fresh `ministry-admin` database has no roles, no users, and therefore no way in.
2. **What the script does and does not do** — writes Mongo only (system roles + one pending invite); never creates a Firebase user; never writes an `AdminUser` (`firebaseUid` is only knowable at first sign-in); needs no Firebase credentials.
3. **The database rides in the URI path.** There is no DB-name env var. A URI with no path database silently resolves to `test` and is refused. `WEBSITE_MONGODB_URI` must stay unset.
4. **Invocation**, both styles, verbatim:

   ```bash
   # From a local env file (node --env-file, Node >= 20.6; this repo pins 22.14.0)
   node --env-file=apps/admin/.env.local \
     ./node_modules/.bin/tsx apps/admin/scripts/seed-admin.ts --email <address> --dry-run

   # Production — the URI is exported for ONE command and never committed
   MONGODB_URI='mongodb+srv://…/ministry-admin?authSource=admin' \
     pnpm --filter @idcr/admin seed:admin --email <address> --yes
   ```

   Always `--dry-run` first and read the printed database name before re-running for real.

5. **🔴 Google sign-in only.** `provision.ts` refuses a first sign-in whose token lacks `email_verified: true`. Firebase email/password signup starts unverified and this app never sends Firebase's verification mail, so **the bootstrap must use the Google button, not the email/password form**. The first Admin is `gabriel@idcredentor.org` — Google Workspace (`idcredentor.org` MX is `1 smtp.google.com`), so its token always carries `email_verified: true`. **This file is the only place in the repo where that address appears; it is an argument a human types, never a code value.**
6. **Re-running is safe.** Roles upsert by immutable `key`; the invite is a single atomic upsert on `{ email, status: "pending" }`. A second run reports `refreshed: true` and exits 0. **A lapsed 7-day window needs no special handling — just re-run**, and `createInvite` extends `expiresAt` in place (ICR-128's upsert-refresh; this is why ICR-155 has no `--ttl-days`).
7. **"Already administrable"** — the script refuses while any _active_ user holds **both** `users:manage` and `roles:manage`. `--force` is for a genuine lockout only, and never relaxes the database guard.
8. **Exit codes** — `0` / `1` / `2`, and the single-JSON-line stdout contract.
9. **After the run** — sign in with Google, confirm `/users` and `/roles` render, then provision everyone else from the UI. The script is a bootstrap, not a role-management tool.

- [ ] **Step 2: Cross-link from the RBAC doc and the docs index**

Add a line to `docs/architecture/admin-rbac.md` under § Known limitations pointing at `admin-bootstrap.md` for how the first Admin comes to exist. Add the doc to the `CLAUDE.md` engineering-docs list, in the same style as its neighbours:

```markdown
- `admin-bootstrap.md` — the one-time `seed:admin` bootstrap: why an invite-only panel needs it, the six guards, the `MONGODB_URI`-path requirement and the silent `test` fallback, why re-running is safe, and the Google-sign-in-only constraint on the first sign-in.
```

- [ ] **Step 3: Add the changeset**

The bump comes from a `.changeset/*.md` file, **not** from the commit or PR type (Changesets landed in ICR-164). Create `.changeset/seed-admin-bootstrap.md`:

```markdown
---
"@idcr/admin": minor
---

Add the guarded `seed:admin` bootstrap script that provisions the first Admin
user: seeds the system roles and creates one pending Admin invite in the
`ministry-admin*` database, behind six guards (wrong-database refusal,
already-administrable refusal, idempotency, explicit target, human
confirmation, secret hygiene). `createInvite` now accepts an optional
`invitedByUserId` so seeded invites carry none.
```

- [ ] **Step 4: Verify the address AC across the whole diff**

```bash
git add -A
git diff origin/main...HEAD --stat > /tmp/t5-stat.txt; cat /tmp/t5-stat.txt
git diff origin/main...HEAD > /tmp/t5-diff.txt
grep -n '@idcredentor\.org' /tmp/t5-diff.txt
echo "--- every hit above MUST be inside docs/architecture/admin-bootstrap.md ---"
grep -n 'gabriel@idcredentor\.org' -- apps/ packages/ 2>/dev/null || true
echo "(expect NO hits under apps/ or packages/)"
```

- [ ] **Step 5: Full verification**

```bash
pnpm --filter @idcr/admin type-check > /tmp/t5-tsc.log 2>&1; echo "exit=$?"
pnpm --filter @idcr/admin lint > /tmp/t5-lint.log 2>&1; echo "exit=$?"
pnpm --filter @idcr/admin test > /tmp/t5-all.log 2>&1; echo "exit=$?"; tail -6 /tmp/t5-all.log
pnpm exec prettier --check docs/architecture/admin-bootstrap.md docs/architecture/admin-rbac.md CLAUDE.md .changeset/seed-admin-bootstrap.md > /tmp/t5-fmt.log 2>&1; echo "format exit=$?"
```

Note: a repo-wide `pnpm format:check` reports ~173 pre-existing unclean files on this repo — check only the touched files (ICR-109 lesson).

- [ ] **Step 6: Commit and push**

```bash
git add docs/architecture/admin-bootstrap.md docs/architecture/admin-rbac.md CLAUDE.md .changeset/seed-admin-bootstrap.md
git commit -m "docs(ICR-155): add the admin bootstrap runbook"
git push
```

---

## Self-Review

**Spec coverage** — R1 Task 2 · R2 Task 2 · R3 Task 2 (types) + Task 3 (impl) · R4 Task 3 · R5 Task 3 · R6 Task 3 · R7 Task 3 · R8 Tasks 2/4/5 (verified by grep in Task 4 Step 5 and Task 5 Step 4) · R9 Task 4 · R10 Task 2 (`redactMongoHost`) + Task 4 (banner) · R11 Task 3 · R12 Task 3 (`createBootstrapInvite`) · R13 Task 1 · R14 Task 4 · R15 Task 2 · R16 Task 4 (`emit`) · R17 Task 4 Step 4. All 20 spec edge cases map to a test or a Task 4 shell check, except #4 (the ICR-166 widening — documented in the runbook, unenforceable in code by design) and #13 (concurrent runs — covered by the insert-race retry tests).

**Symbol graph, both directions** (the ICR-128 rule — every function _called_ must be _defined_ by some task): `parseSeedArgs`/`exitCodeFor`/`redactMongoHost`/`USAGE`/`SeedArgs`/`SeedAdminResult`/`SeedAdminFailure`/`ParseSeedArgsResult` → Task 2. `SeedAdminDeps`/`defaultSeedAdminDeps`/`seedAdmin`/`createBootstrapInvite` → Task 3. The CLI shell → Task 4. Everything else (`getAdminDb`, `withAdminTransaction`, `seedSystemRoles`, `listRoles`, `listUsers`, `createInvite`, `retainsAdministrability`, `AdminStateSnapshot`, `normalizeEmail`, `sendInviteEmail`, `i18n`, `Locale`) is **already on `main` at `7f21c75`** and was re-read during exploration — no task needs to create it. Task 3 consumes Task 1's relaxed `CreateInviteInput`, which is why Task 1 goes first.

**Type consistency** — `SeedAdminResult` is defined once in Task 2 and implemented in Task 3; `exitCodeFor` accepts the union of it and a `parseSeedArgs` failure, which is why the CLI can map both through one function. `roleIds` in the success shape is the ids of the **system** roles (`isSystem === true`), which is what Task 3's happy-path test asserts (`["role-admin", "role-leader"]`).

**Known deviation from strict RED-first:** Task 4's shell has no unit tests by design — `vitest` only globs `src/**`, and putting a test under `scripts/` would be silently skipped. Its behaviour is instead proven by the seven executable guard checks in Task 4 Step 3, whose output becomes the QA evidence.
