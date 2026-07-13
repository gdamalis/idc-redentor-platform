/**
 * ICR-114 / ICR-136: E2E spec for the predica PDF-regen webhook + cron AUTH BOUNDARY ONLY.
 *
 * Safety note: PREDICA_REGEN_SECRET / CRON_SECRET / CONTENTFUL_MANAGEMENT_ACCESS_TOKEN /
 * MONGODB_URI are NOT set on preview deployments (env-limited, see ICR-44 lesson + the cron
 * route's own doc comment: Vercel Cron only ever invokes production, never a preview). These
 * tests therefore exercise ONLY the fail-closed auth rejection — they never send a valid secret
 * and never reach the mark-dirty/render/write-back path. The happy path is BLOCKED on preview and
 * deferred to post-merge staging QA, where the secrets exist.
 *
 * ICR-136: an unset secret used to authenticate the CALLER rather than reject them. The cron
 * interpolated `process.env.CRON_SECRET` into a template literal, so with the variable unset the
 * expected value became the literal string "Bearer undefined" — and anyone sending that header was
 * let in (confirmed 200 against staging on 2026-07-10). Because preview is an environment WITHOUT
 * CRON_SECRET, the `Bearer undefined` tests below are a live regression check on exactly the
 * environment that was vulnerable. They must return 401.
 */

import { expect, test } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

test.describe("/api/predica/regenerate-pdf webhook auth boundary", () => {
  test("returns 401 'Invalid secret' when x-predica-regen-key is absent", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/predica/regenerate-pdf`, {
      data: {
        sys: { id: "qa-icr114-test", contentType: { sys: { id: "sermon" } } },
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Invalid secret" });
  });

  test("returns 401 'Invalid secret' for a wrong x-predica-regen-key", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/predica/regenerate-pdf`, {
      data: {
        sys: { id: "qa-icr114-test", contentType: { sys: { id: "sermon" } } },
      },
      headers: {
        "Content-Type": "application/json",
        "x-predica-regen-key": "intentionally-wrong-secret-icr114-qa",
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Invalid secret" });
  });

  test("401 body never leaks the configured secret or a stack trace", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/predica/regenerate-pdf`, {
      data: {},
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(401);
    const text = await res.text();
    expect(text.toLowerCase()).not.toContain("at ");
    expect(text.toLowerCase()).not.toContain("error:");
    expect(text.length).toBeLessThan(200);
  });

  test("returns 401 for the literal 'undefined' x-predica-regen-key (ICR-136 lock)", async ({
    request,
  }) => {
    const res = await request.post(`${BASE}/api/predica/regenerate-pdf`, {
      data: {
        sys: { id: "qa-icr136-test", contentType: { sys: { id: "sermon" } } },
      },
      headers: {
        "Content-Type": "application/json",
        "x-predica-regen-key": "undefined",
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Invalid secret" });
  });
});

test.describe("/api/predica/regenerate-pdf/cron auth boundary", () => {
  test("returns 401 'Unauthorized' when Authorization header is absent", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/predica/regenerate-pdf/cron`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Unauthorized" });
  });

  test("returns 401 'Unauthorized' for a wrong bearer token", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/predica/regenerate-pdf/cron`, {
      headers: { Authorization: "Bearer intentionally-wrong-cron-secret-icr114-qa" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Unauthorized" });
  });

  test("401 body never leaks the configured secret or a stack trace", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/predica/regenerate-pdf/cron`);
    expect(res.status()).toBe(401);
    const text = await res.text();
    expect(text.toLowerCase()).not.toContain("at ");
    expect(text.toLowerCase()).not.toContain("error:");
    expect(text.length).toBeLessThan(200);
  });

  test("returns 401 for 'Bearer undefined' — the ICR-136 unset-secret bypass", async ({
    request,
  }) => {
    const res = await request.get(`${BASE}/api/predica/regenerate-pdf/cron`, {
      headers: { Authorization: "Bearer undefined" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ message: "Unauthorized" });
  });
});
