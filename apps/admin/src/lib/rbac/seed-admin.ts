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

export const USAGE = `Usage: pnpm --filter @idcr/admin seed:admin -- --email <address> [options]

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
