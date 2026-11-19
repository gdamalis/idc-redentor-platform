import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkQaHost, PRODUCTION_HOST_DENY } from "./host-gate";

const PREVIEW = "https://idc-redentor-admin-jxo67ax9h-divine-lab.vercel.app";
const STAGING = "https://staging.ministerio.idcredentor.org";

describe("checkQaHost", () => {
  it("accepts the admin staging host on stagingAdmin", () => {
    expect(checkQaHost(STAGING, "stagingAdmin")).toEqual({
      ok: true,
      origin: STAGING,
    });
  });

  it("accepts an admin preview host on previewAdmin and drops any path", () => {
    expect(checkQaHost(`${PREVIEW}/es-AR/roles`, "previewAdmin")).toEqual({
      ok: true,
      origin: PREVIEW,
    });
  });

  it.each([
    "https://ministerio.idcredentor.org",
    "https://idc-redentor-admin.vercel.app",
    "https://www.idcredentor.org",
    "https://idcredentor.org",
    "https://idc-redentor-web.vercel.app",
  ])("refuses the production host %s on every env", (url) => {
    for (const env of ["stagingAdmin", "previewAdmin"]) {
      const result = checkQaHost(url, env);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("production-host");
    }
  });

  it("refuses a preview host on stagingAdmin and the staging host on previewAdmin", () => {
    expect(checkQaHost(PREVIEW, "stagingAdmin")).toMatchObject({
      ok: false,
      reason: "host-not-allowed",
    });
    expect(checkQaHost(STAGING, "previewAdmin")).toMatchObject({
      ok: false,
      reason: "host-not-allowed",
    });
  });

  it("refuses the public website's preview on previewAdmin", () => {
    expect(
      checkQaHost(
        "https://idc-redentor-web-abc123-divine-lab.vercel.app",
        "previewAdmin",
      ),
    ).toMatchObject({ ok: false, reason: "host-not-allowed" });
  });

  it("refuses look-alike hosts", () => {
    expect(
      checkQaHost(
        "https://staging.ministerio.idcredentor.org.evil.example",
        "stagingAdmin",
      ),
    ).toMatchObject({ ok: false });
    expect(
      checkQaHost(
        "https://idc-redentor-admin-abc-divine-lab.vercel.app.evil.example",
        "previewAdmin",
      ),
    ).toMatchObject({ ok: false });
  });

  it.each([
    [
      "an extra hyphenated segment",
      "https://idc-redentor-admin-jxo67ax9h-x-divine-lab.vercel.app",
    ],
    [
      "a prefix before the project",
      "https://evil-idc-redentor-admin-jxo67ax9h-divine-lab.vercel.app",
    ],
    [
      "a different team suffix",
      "https://idc-redentor-admin-jxo67ax9h-evil-team.vercel.app",
    ],
    [
      "a team suffix with extra text",
      "https://idc-redentor-admin-jxo67ax9h-divine-lab-evil.vercel.app",
    ],
    [
      "a branch alias",
      "https://idc-redentor-admin-git-main-divine-lab.vercel.app",
    ],
    [
      "a branch alias for a feature branch",
      "https://idc-redentor-admin-git-chore-icr-222-divine-lab.vercel.app",
    ],
    [
      "a hash one character short",
      "https://idc-redentor-admin-jxo67ax9-divine-lab.vercel.app",
    ],
    [
      "a hash one character long",
      "https://idc-redentor-admin-jxo67ax9hh-divine-lab.vercel.app",
    ],
    [
      "a hash with an underscore",
      "https://idc-redentor-admin-jxo67_x9h-divine-lab.vercel.app",
    ],
    ["uppercase", "https://IDC-REDENTOR-ADMIN-JXO67AX9H-DIVINE-LAB.vercel.app"],
    [
      "mixed case",
      "https://idc-redentor-admin-JXO67ax9h-divine-lab.vercel.app",
    ],
    [
      "a trailing dot",
      "https://idc-redentor-admin-jxo67ax9h-divine-lab.vercel.app.",
    ],
    [
      "userinfo naming the real host",
      "https://idc-redentor-admin-jxo67ax9h-divine-lab.vercel.app@evil.example",
    ],
    [
      "userinfo before the real host",
      "https://evil.example@idc-redentor-admin-jxo67ax9h-divine-lab.vercel.app",
    ],
    [
      "a backslash trick",
      "https://evil.example\\@idc-redentor-admin-jxo67ax9h-divine-lab.vercel.app",
    ],
    [
      "percent-encoding",
      "https://idc-redentor-admin-jxo67ax9h-divine-lab.vercel%2Eapp",
    ],
    [
      "a non-vercel apex",
      "https://idc-redentor-admin-jxo67ax9h-divine-lab.vercel.app.evil.example",
    ],
    ["the production alias", "https://idc-redentor-admin.vercel.app"],
  ])("refuses a preview look-alike: %s", (_label, url) => {
    expect(checkQaHost(url, "previewAdmin").ok).toBe(false);
  });

  it.each([
    "https://idc-redentor-admin-12manxht9-divine-lab.vercel.app",
    "https://idc-redentor-admin-go366z576-divine-lab.vercel.app",
    "https://idc-redentor-admin-qyhgq4fvp-divine-lab.vercel.app",
  ])("accepts a real admin preview host %s", (url) => {
    expect(checkQaHost(url, "previewAdmin")).toEqual({ ok: true, origin: url });
  });

  it.each([
    "https://STAGING.ministerio.idcredentor.org",
    "https://staging.ministerio.idcredentor.org.",
    "https://x@staging.ministerio.idcredentor.org",
  ])("refuses a staging look-alike %s", (url) => {
    expect(checkQaHost(url, "stagingAdmin").ok).toBe(false);
  });

  it("refuses any env it has no rule for", () => {
    expect(checkQaHost(STAGING, "staging")).toMatchObject({
      ok: false,
      reason: "unknown-env",
    });
    expect(checkQaHost(STAGING, "production")).toMatchObject({
      ok: false,
      reason: "unknown-env",
    });
    expect(checkQaHost(STAGING, "")).toMatchObject({
      ok: false,
      reason: "unknown-env",
    });
  });

  it("refuses http, ports, userinfo and unparseable values", () => {
    expect(
      checkQaHost("http://staging.ministerio.idcredentor.org", "stagingAdmin"),
    ).toMatchObject({
      ok: false,
      reason: "not-https",
    });
    expect(checkQaHost(`${STAGING}:8443`, "stagingAdmin")).toMatchObject({
      ok: false,
      reason: "bad-url",
    });
    expect(
      checkQaHost(
        "https://user:pw@staging.ministerio.idcredentor.org",
        "stagingAdmin",
      ),
    ).toMatchObject({ ok: false, reason: "bad-url" });
    expect(checkQaHost("not a url", "stagingAdmin")).toMatchObject({
      ok: false,
      reason: "bad-url",
    });
    expect(checkQaHost(undefined, "stagingAdmin")).toMatchObject({
      ok: false,
      reason: "bad-url",
    });
  });

  it("denies at least every production host the QA config denies", () => {
    const configPath = resolve(__dirname, "../../../../../.claude/config.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      qa: { env: Record<string, { productionHostDeny?: string[] }> };
    };
    const configured = Object.values(config.qa.env).flatMap(
      (env) => env.productionHostDeny ?? [],
    );
    expect(configured.length).toBeGreaterThan(0);
    for (const host of configured) expect(PRODUCTION_HOST_DENY).toContain(host);
  });
});
