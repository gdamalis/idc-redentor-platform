/**
 * ICR-222 — the `signIn` verb of the harness's `yoke/qa-auth@1` contract for
 * the admin app: turns the standing QA account's stored credentials into an
 * admin `__session` cookie for one preview or staging address.
 *
 * Contract (yoke:warden skill, "The verb contract"):
 *  - selection inputs arrive as YOKE_QA_AUTH_* environment variables;
 *  - credentials arrive on STDIN only, as `{ contract, credentials }`;
 *  - exactly one JSON object goes to stdout; exit 0 ok, 1 tried and failed,
 *    2 bad usage / refused input, 3 declined (unknown role).
 *
 * The flow is the same one a person takes on /login: Firebase email/password
 * sign-in (REST), then the app's own `POST /api/auth/session` exchange, so the
 * invite gate and every server check run unchanged. Nothing here changes the
 * admin app's auth code. See docs/architecture/admin-qa-account.md.
 *
 * Functional-first: every outcome is a returned value; nothing throws past
 * `runSignIn`.
 */
import { createHash } from "node:crypto";
import { checkQaHost } from "./host-gate";

export const QA_AUTH_CONTRACT = "yoke/qa-auth@1";

/** The roles this command can hand out. The standing account is an Admin. */
export const QA_AUTH_ROLES: readonly string[] = ["admin"];

export const SESSION_COOKIE_NAME = "__session";

const FIREBASE_SIGN_IN_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";

/** Fallback when the cookie carries no Max-Age: the app's 5-day session. */
const DEFAULT_SESSION_SECONDS = 432000;

const CREDENTIAL_FIELDS = ["email", "password", "firebaseApiKey"] as const;

type ExitCode = 0 | 1 | 2 | 3;

export interface QaAuthCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
}

export interface QaAuthEnvelope {
  contract: typeof QA_AUTH_CONTRACT;
  ok: boolean;
  identity?: { handle: string; roles: string[]; entitlements: string[] };
  session?: { cookies: QaAuthCookie[]; bearer: null; expiresAt: string };
  cleanup?: { handle: null; residual: never[] };
  diagnostics: string[];
}

export interface SignInOutcome {
  exitCode: ExitCode;
  envelope: QaAuthEnvelope;
}

export interface SignInDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  now: () => Date;
}

export interface SignInInput {
  env: Readonly<Record<string, string | undefined>>;
  stdin: string;
}

interface Credentials {
  email: string;
  password: string;
  firebaseApiKey: string;
}

const fail = (
  exitCode: Exclude<ExitCode, 0>,
  ...diagnostics: string[]
): SignInOutcome => ({
  exitCode,
  envelope: { contract: QA_AUTH_CONTRACT, ok: false, diagnostics },
});

/** Null, empty and `<…>`-wrapped placeholder values all count as absent. */
function isPresent(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed !== "" && !/^<.*>$/.test(trimmed);
}

type ParseResult =
  | { ok: true; credentials: Credentials }
  | { ok: false; diagnostic: string };

export function parseSignInStdin(stdin: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdin);
  } catch {
    return { ok: false, diagnostic: "stdin is not one JSON object" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, diagnostic: "stdin is not one JSON object" };
  }

  const { contract, credentials } = parsed as {
    contract?: unknown;
    credentials?: unknown;
  };
  if (contract !== QA_AUTH_CONTRACT) {
    return {
      ok: false,
      diagnostic: `stdin contract is not ${QA_AUTH_CONTRACT}`,
    };
  }
  if (typeof credentials !== "object" || credentials === null) {
    return { ok: false, diagnostic: "stdin has no credentials object" };
  }

  const record = credentials as Record<string, unknown>;
  const missing = CREDENTIAL_FIELDS.filter(
    (field) => !isPresent(record[field]),
  );
  if (missing.length > 0) {
    // Field NAMES only — never a value, not even a placeholder.
    return {
      ok: false,
      diagnostic: `missing credentials: ${missing.join(", ")}`,
    };
  }

  return {
    ok: true,
    credentials: {
      email: String(record.email).trim(),
      password: String(record.password),
      firebaseApiKey: String(record.firebaseApiKey).trim(),
    },
  };
}

function readSessionCookie(
  headers: Headers,
): { value: string; maxAgeSeconds: number } | null {
  const lines =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const fallback = lines.length === 0 ? (headers.get("set-cookie") ?? "") : "";
  const all = lines.length > 0 ? lines : fallback ? [fallback] : [];

  for (const line of all) {
    const [pair, ...attributes] = line.split(";");
    const separator = pair?.indexOf("=") ?? -1;
    if (
      !pair ||
      separator < 0 ||
      pair.slice(0, separator).trim() !== SESSION_COOKIE_NAME
    )
      continue;

    const value = pair.slice(separator + 1).trim();
    if (value === "") continue;

    const maxAge = attributes
      .map((attribute) => attribute.trim().match(/^max-age=(\d+)$/i)?.[1])
      .find((match) => match !== undefined);
    return {
      value,
      maxAgeSeconds: maxAge ? Number(maxAge) : DEFAULT_SESSION_SECONDS,
    };
  }
  return null;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Opaque per the contract: a hash prefix, never the Firebase uid itself. */
function opaqueHandle(uid: string): string {
  return `qa-admin-${createHash("sha256").update(uid).digest("hex").slice(0, 16)}`;
}

export async function runSignIn(
  input: SignInInput,
  deps: SignInDeps,
): Promise<SignInOutcome> {
  const { env } = input;

  if (env.YOKE_QA_AUTH_CONTRACT !== QA_AUTH_CONTRACT) {
    return fail(2, `YOKE_QA_AUTH_CONTRACT must be ${QA_AUTH_CONTRACT}`);
  }

  const role = env.YOKE_QA_AUTH_ROLE;
  if (role !== undefined && role !== "" && !QA_AUTH_ROLES.includes(role)) {
    return fail(
      3,
      `role "${role}" is not offered; available: ${QA_AUTH_ROLES.join(", ")}`,
    );
  }

  const host = checkQaHost(env.YOKE_QA_AUTH_BASE_URL, env.YOKE_QA_AUTH_ENV);
  if (!host.ok) return fail(2, `host gate: ${host.reason} — ${host.message}`);

  const parsed = parseSignInStdin(input.stdin);
  if (!parsed.ok) return fail(2, parsed.diagnostic);
  const { credentials } = parsed;

  try {
    // 1. Firebase email/password sign-in. The key is a public web API key; it
    //    still never reaches a diagnostic. The Referer matches what a browser
    //    on the target would send, for keys restricted by HTTP referrer.
    const firebaseResponse = await deps.fetch(
      `${FIREBASE_SIGN_IN_URL}?key=${encodeURIComponent(credentials.firebaseApiKey)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          referer: `${host.origin}/`,
        },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          returnSecureToken: true,
        }),
      },
    );
    const firebaseBody = await readJson(firebaseResponse);
    const idToken = firebaseBody.idToken;
    const uid = firebaseBody.localId;
    if (
      !firebaseResponse.ok ||
      typeof idToken !== "string" ||
      typeof uid !== "string"
    ) {
      const error = firebaseBody.error as { message?: unknown } | undefined;
      const code =
        typeof error?.message === "string"
          ? error.message.split(" ")[0]
          : "unknown-error";
      return fail(
        1,
        `firebase sign-in refused: HTTP ${firebaseResponse.status} ${code}`,
      );
    }

    // 2. The app's own session exchange — the invite gate runs here unchanged.
    const sessionResponse = await deps.fetch(
      `${host.origin}/api/auth/session`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
        redirect: "manual",
      },
    );
    if (sessionResponse.status !== 200) {
      const body = await readJson(sessionResponse);
      const reason =
        typeof body.reason === "string" ? body.reason : "no-reason";
      return fail(
        1,
        `session exchange refused: HTTP ${sessionResponse.status} ${reason}`,
      );
    }

    const cookie = readSessionCookie(sessionResponse.headers);
    if (!cookie)
      return fail(
        1,
        `session exchange returned 200 without a ${SESSION_COOKIE_NAME} cookie`,
      );

    const expiresAt = new Date(
      deps.now().getTime() + cookie.maxAgeSeconds * 1000,
    ).toISOString();
    return {
      exitCode: 0,
      envelope: {
        contract: QA_AUTH_CONTRACT,
        ok: true,
        identity: {
          handle: opaqueHandle(uid),
          roles: ["admin"],
          entitlements: [],
        },
        session: {
          cookies: [
            {
              name: SESSION_COOKIE_NAME,
              value: cookie.value,
              domain: new URL(host.origin).hostname,
              path: "/",
            },
          ],
          bearer: null,
          expiresAt,
        },
        cleanup: { handle: null, residual: [] },
        diagnostics: [],
      },
    };
  } catch (error) {
    // Network failure. The message is the runtime's own (no request data).
    const name = error instanceof Error ? error.name : "Error";
    return fail(1, `network error during sign-in: ${name}`);
  }
}
