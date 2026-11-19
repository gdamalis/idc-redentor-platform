import { describe, expect, it } from "vitest";
import { QA_AUTH_CONTRACT, runSignIn } from "./sign-in";
import type { SignInDeps } from "./sign-in";

const PREVIEW = "https://idc-redentor-admin-jxo67ax9h-divine-lab.vercel.app";
const PASSWORD = "p".repeat(43);
const API_KEY = "fake-web-api-key";
const SESSION_VALUE = "session-cookie-value";

const baseEnv = {
  YOKE_QA_AUTH_CONTRACT: QA_AUTH_CONTRACT,
  YOKE_QA_AUTH_ENV: "previewAdmin",
  YOKE_QA_AUTH_BASE_URL: PREVIEW,
};

const stdinWith = (credentials: Record<string, unknown>, contract: string = QA_AUTH_CONTRACT) =>
  JSON.stringify({ contract, credentials });

const goodStdin = stdinWith({ email: "qa@example.test", password: PASSWORD, firebaseApiKey: API_KEY });

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function fakeDeps(
  sessionResponse: () => Response = () =>
    jsonResponse(200, { ok: true, preferredLocale: "es-AR" }, {
      "set-cookie": `__session=${SESSION_VALUE}; Max-Age=432000; Path=/; HttpOnly; Secure; SameSite=lax`,
    }),
  firebaseResponse: () => Response = () => jsonResponse(200, { idToken: "id-token", localId: "firebase-uid" }),
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const deps: SignInDeps = {
    fetch: async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      return url.startsWith("https://identitytoolkit.googleapis.com/") ? firebaseResponse() : sessionResponse();
    },
    now: () => new Date("2026-11-19T12:00:00.000Z"),
  };
  return { deps, calls };
}

/** Every secret the run handled. None may appear in diagnostics. */
const SECRETS = [PASSWORD, API_KEY, "id-token", "qa@example.test", "firebase-uid"];

function expectNoSecretsInDiagnostics(diagnostics: string[]): void {
  const text = diagnostics.join("\n");
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

describe("runSignIn", () => {
  it("signs in and returns the session cookie in a yoke/qa-auth@1 envelope", async () => {
    const { deps, calls } = fakeDeps();
    const outcome = await runSignIn({ env: baseEnv, stdin: goodStdin }, deps);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.envelope).toMatchObject({
      contract: QA_AUTH_CONTRACT,
      ok: true,
      identity: { roles: ["admin"], entitlements: [] },
      session: {
        cookies: [
          { name: "__session", value: SESSION_VALUE, domain: "idc-redentor-admin-jxo67ax9h-divine-lab.vercel.app", path: "/" },
        ],
        bearer: null,
        expiresAt: "2026-11-24T12:00:00.000Z",
      },
      cleanup: { handle: null, residual: [] },
    });
    // The handle is opaque: never the raw Firebase uid.
    expect(outcome.envelope.identity?.handle).toBeTruthy();
    expect(outcome.envelope.identity?.handle).not.toContain("firebase-uid");

    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      email: "qa@example.test",
      password: PASSWORD,
      returnSecureToken: true,
    });
    expect(calls[1]?.url).toBe(`${PREVIEW}/api/auth/session`);
    expect(calls[1]?.init?.redirect).toBe("manual");
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ idToken: "id-token" });
    expectNoSecretsInDiagnostics(outcome.envelope.diagnostics);
  });

  it.each([
    "https://ministerio.idcredentor.org",
    "https://idc-redentor-admin.vercel.app",
  ])("refuses the production address %s before any network call", async (baseUrl) => {
    const { deps, calls } = fakeDeps();
    const outcome = await runSignIn({ env: { ...baseEnv, YOKE_QA_AUTH_BASE_URL: baseUrl }, stdin: goodStdin }, deps);

    expect(outcome.exitCode).toBe(2);
    expect(outcome.envelope.ok).toBe(false);
    expect(outcome.envelope.diagnostics.join(" ")).toContain("production-host");
    expect(calls).toHaveLength(0);
  });

  it("refuses a missing base URL and an env with no rule", async () => {
    const { deps, calls } = fakeDeps();
    const noUrl = await runSignIn({ env: { ...baseEnv, YOKE_QA_AUTH_BASE_URL: undefined }, stdin: goodStdin }, deps);
    const badEnv = await runSignIn({ env: { ...baseEnv, YOKE_QA_AUTH_ENV: "production" }, stdin: goodStdin }, deps);

    expect(noUrl.exitCode).toBe(2);
    expect(badEnv.exitCode).toBe(2);
    expect(calls).toHaveLength(0);
  });

  it("refuses a missing or different contract", async () => {
    const { deps, calls } = fakeDeps();
    const envMissing = await runSignIn({ env: { ...baseEnv, YOKE_QA_AUTH_CONTRACT: undefined }, stdin: goodStdin }, deps);
    const stdinV2 = await runSignIn(
      { env: baseEnv, stdin: stdinWith({ email: "qa@example.test", password: PASSWORD, firebaseApiKey: API_KEY }, "yoke/qa-auth@2") },
      deps,
    );

    expect(envMissing.exitCode).toBe(2);
    expect(stdinV2.exitCode).toBe(2);
    expect(calls).toHaveLength(0);
  });

  it("declines (exit 3) a role it does not offer", async () => {
    const { deps, calls } = fakeDeps();
    const outcome = await runSignIn({ env: { ...baseEnv, YOKE_QA_AUTH_ROLE: "leader" }, stdin: goodStdin }, deps);

    expect(outcome.exitCode).toBe(3);
    expect(calls).toHaveLength(0);
  });

  it("accepts the admin role when it is requested", async () => {
    const { deps } = fakeDeps();
    const outcome = await runSignIn({ env: { ...baseEnv, YOKE_QA_AUTH_ROLE: "admin" }, stdin: goodStdin }, deps);
    expect(outcome.exitCode).toBe(0);
  });

  it.each([
    ["empty stdin", ""],
    ["non-JSON stdin", "not json"],
    ["no credentials object", JSON.stringify({ contract: QA_AUTH_CONTRACT })],
    ["missing password", stdinWith({ email: "qa@example.test", firebaseApiKey: API_KEY })],
    ["empty email", stdinWith({ email: "", password: PASSWORD, firebaseApiKey: API_KEY })],
    ["placeholder password", stdinWith({ email: "qa@example.test", password: "<set me>", firebaseApiKey: API_KEY })],
    ["null api key", stdinWith({ email: "qa@example.test", password: PASSWORD, firebaseApiKey: null })],
  ])("refuses missing credentials (%s) with exit 2 and no network call", async (_label, stdin) => {
    const { deps, calls } = fakeDeps();
    const outcome = await runSignIn({ env: baseEnv, stdin }, deps);

    expect(outcome.exitCode).toBe(2);
    expect(outcome.envelope.ok).toBe(false);
    expect(calls).toHaveLength(0);
    expectNoSecretsInDiagnostics(outcome.envelope.diagnostics);
  });

  it("names the missing field, never a value", async () => {
    const { deps } = fakeDeps();
    const outcome = await runSignIn(
      { env: baseEnv, stdin: stdinWith({ email: "qa@example.test", password: "<set me>", firebaseApiKey: API_KEY }) },
      deps,
    );
    const text = outcome.envelope.diagnostics.join(" ");
    expect(text).toContain("password");
    expect(text).not.toContain("<set me>");
  });

  it("fails (exit 1) with only the Firebase reason code when Firebase refuses", async () => {
    const { deps, calls } = fakeDeps(undefined, () =>
      jsonResponse(400, { error: { code: 400, message: "INVALID_LOGIN_CREDENTIALS" } }),
    );
    const outcome = await runSignIn({ env: baseEnv, stdin: goodStdin }, deps);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.envelope.diagnostics.join(" ")).toContain("INVALID_LOGIN_CREDENTIALS");
    expect(calls).toHaveLength(1);
    expectNoSecretsInDiagnostics(outcome.envelope.diagnostics);
  });

  it("fails (exit 1) with the app's refusal reason when the session exchange is refused", async () => {
    const { deps } = fakeDeps(() => jsonResponse(403, { ok: false, reason: "no-invite" }));
    const outcome = await runSignIn({ env: baseEnv, stdin: goodStdin }, deps);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.envelope.session).toBeUndefined();
    expect(outcome.envelope.diagnostics.join(" ")).toContain("403");
    expect(outcome.envelope.diagnostics.join(" ")).toContain("no-invite");
  });

  it("fails (exit 1) when a 200 carries no session cookie", async () => {
    const { deps } = fakeDeps(() => jsonResponse(200, { ok: true }));
    const outcome = await runSignIn({ env: baseEnv, stdin: goodStdin }, deps);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.envelope.session).toBeUndefined();
  });

  it("fails (exit 1) instead of throwing when the network errors", async () => {
    const deps: SignInDeps = {
      fetch: async () => {
        throw new Error("getaddrinfo ENOTFOUND");
      },
      now: () => new Date(),
    };
    const outcome = await runSignIn({ env: baseEnv, stdin: goodStdin }, deps);

    expect(outcome.exitCode).toBe(1);
    expect(outcome.envelope.ok).toBe(false);
  });
});
