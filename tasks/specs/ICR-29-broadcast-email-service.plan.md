# ICR-29 Broadcast Email Service — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:test-driven-development per task. Steps use checkbox (`- [ ]`) syntax. Run every command from the worktree root: `/Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-29`. App code is under `apps/web/`. Use `pnpm test`, `pnpm type-check`, `pnpm lint`, `pnpm build` (Turbo proxies to `@idcr/web`). To run one test file: `pnpm --filter @idcr/web exec vitest run <path-from-apps/web>`.

**Goal:** Add a reusable, idempotent `sendBroadcast()` service that emails one message to all newsletter subscribers via a Mailchimp campaign.

**Architecture:** A never-throwing orchestrator (`broadcast.service.ts`) composes four small units — zod-validated types, an insert-first Mongo dedupe log, a locale-aware email template, and a Mailchimp-campaign transport. Subscriber PII never reaches our server (Mailchimp owns the list/unsubscribe/CAN-SPAM).

**Tech Stack:** TypeScript (strict), zod, `@mailchimp/mailchimp_marketing` (installed), `mongodb` cached client, Vitest.

## Global Constraints

- **Default locale `es-AR`**, secondary `en-US`. Both locales must render correct template chrome.
- **`interface` over `type`** for object shapes; **avoid enums** (const maps / `as const`); **`??` over `||`**; **named exports**.
- **Validate external input with zod at the boundary** (`safeParse`, never `parse` that throws to the caller).
- **`sendBroadcast` NEVER throws** — every failure is caught, logged safely, returned as `BroadcastResult`.
- **No secrets/PII in logs** — log only `broadcastId`, `locale`, `campaignId`, `status`, `error.message`; never API keys, never subscriber data.
- **`reply_to` = constant `"info@idcredentor.org"`** (`BROADCAST_REPLY_TO`). **`from_name` = `process.env.MAILCHIMP_FROM_NAME`** (already in Vercel).
- **Conventional Commits**, header ≤ 100 chars. Commit type `feat` (Story), `docs` for CP6.
- **Do NOT commit `tasks/`** — only `apps/web/**` and `docs/**`. (The spec/plan live in the main checkout, off this branch.)
- Mongo DB name is the literal `"website"`; new collection `"broadcast_log"`.

---

### Task 1 (CP1): Input types, zod schema, env var

**Files:**

- Create: `apps/web/src/service/broadcast/types.ts`
- Create: `apps/web/src/service/broadcast/types.test.ts`
- Modify: `apps/web/src/types/environment.d.ts` (add `MAILCHIMP_FROM_NAME`)
- Modify: `apps/web/.env.example` (add `MAILCHIMP_FROM_NAME=`)

**Interfaces — Produces:**

- `BROADCAST_LOCALES`, `BroadcastLocale`, `broadcastInputSchema`, `BroadcastInput`, `BroadcastStatus`, `BroadcastResult`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/service/broadcast/types.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { broadcastInputSchema } from "./types";

const valid = {
  broadcastId: "blog:hola-mundo:es-AR",
  subject: "Nuevo post",
  html: "<p>cuerpo</p>",
  text: "cuerpo",
  locale: "es-AR",
};

describe("broadcastInputSchema", () => {
  it("accepts a valid input", () => {
    expect(broadcastInputSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects an empty broadcastId", () => {
    expect(
      broadcastInputSchema.safeParse({ ...valid, broadcastId: "" }).success,
    ).toBe(false);
  });
  it("rejects a blank subject", () => {
    expect(
      broadcastInputSchema.safeParse({ ...valid, subject: "   " }).success,
    ).toBe(false);
  });
  it("rejects empty html or text", () => {
    expect(broadcastInputSchema.safeParse({ ...valid, html: "" }).success).toBe(
      false,
    );
    expect(broadcastInputSchema.safeParse({ ...valid, text: "" }).success).toBe(
      false,
    );
  });
  it("rejects an unknown locale", () => {
    expect(
      broadcastInputSchema.safeParse({ ...valid, locale: "pt-BR" }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm --filter @idcr/web exec vitest run src/service/broadcast/types.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `apps/web/src/service/broadcast/types.ts`

```ts
import { z } from "zod";

export const BROADCAST_LOCALES = ["es-AR", "en-US"] as const;
export type BroadcastLocale = (typeof BROADCAST_LOCALES)[number];

export const broadcastInputSchema = z.object({
  /** Stable, caller-supplied id. ICR-44 uses `blog:<slug>:<locale>`. */
  broadcastId: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  /** Inner body HTML; the service wraps it in the broadcast template. */
  html: z.string().min(1),
  /** Plain-text alternative (Mailchimp `plain_text`). */
  text: z.string().min(1),
  locale: z.enum(BROADCAST_LOCALES),
});

export type BroadcastInput = z.infer<typeof broadcastInputSchema>;

export type BroadcastStatus = "sent" | "skipped" | "failed";

export interface BroadcastResult {
  status: BroadcastStatus;
  campaignId?: string;
  /** Non-secret token: already-sent | invalid-input | dedupe-unavailable | mailchimp-not-configured | send-failed */
  reason?: string;
}
```

- [ ] **Step 4: Add the env var** — in `apps/web/src/types/environment.d.ts`, immediately after the `MAILCHIMP_AUDIENCE_ID: string;` line add:

```ts
MAILCHIMP_FROM_NAME: string;
```

In `apps/web/.env.example`, under the Mailchimp section, add:

```
MAILCHIMP_FROM_NAME=
```

- [ ] **Step 5: Run test + type-check** — `pnpm --filter @idcr/web exec vitest run src/service/broadcast/types.test.ts` → PASS; `pnpm type-check` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/service/broadcast/types.ts apps/web/src/service/broadcast/types.test.ts apps/web/src/types/environment.d.ts apps/web/.env.example
git commit -m "feat(ICR-29): add broadcast input types, zod schema, MAILCHIMP_FROM_NAME env"
```

---

### Task 2 (CP2): Locale-aware broadcast template

**Files:**

- Create: `apps/web/src/templates/broadcast.template.ts`
- Create: `apps/web/src/templates/broadcast.template.test.ts`
- Modify: `apps/web/src/templates/index.ts` (register `"broadcast"`)

**Interfaces — Consumes:** `BroadcastLocale` (Task 1). **Produces:** `BROADCAST_TEMPLATE`, `BROADCAST_CHROME` (`Record<BroadcastLocale, { logoAlt: string; footer: string }>`).

- [ ] **Step 1: Write the failing test** — `apps/web/src/templates/broadcast.template.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { renderTemplate } from "./template-engine";
import { BROADCAST_CHROME } from "./broadcast.template";

describe("broadcast template", () => {
  it("wraps the body and sets es-AR lang + chrome", () => {
    const html = renderTemplate("broadcast", {
      lang: "es-AR",
      body: "<p>Hola comunidad</p>",
      logoAlt: BROADCAST_CHROME["es-AR"].logoAlt,
      footer: BROADCAST_CHROME["es-AR"].footer,
    });
    expect(html).toContain('lang="es-AR"');
    expect(html).toContain("<p>Hola comunidad</p>");
    expect(html).toContain("Iglesia de Cristo Redentor");
    expect(html).not.toContain("{{body}}");
    expect(html).not.toContain("{{currentYear}}");
  });

  it("renders en-US chrome", () => {
    const html = renderTemplate("broadcast", {
      lang: "en-US",
      body: "<p>Hello church</p>",
      logoAlt: BROADCAST_CHROME["en-US"].logoAlt,
      footer: BROADCAST_CHROME["en-US"].footer,
    });
    expect(html).toContain('lang="en-US"');
    expect(html).toContain("<p>Hello church</p>");
    expect(html).toContain("Church of Christ the Redeemer");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `pnpm --filter @idcr/web exec vitest run src/templates/broadcast.template.test.ts` → FAIL.

- [ ] **Step 3: Implement the template** — `apps/web/src/templates/broadcast.template.ts`

```ts
import type { BroadcastLocale } from "@src/service/broadcast/types";

interface BroadcastChrome {
  logoAlt: string;
  /** May contain {{currentYear}} — resolved by renderTemplate. */
  footer: string;
}

export const BROADCAST_CHROME: Record<BroadcastLocale, BroadcastChrome> = {
  "es-AR": {
    logoAlt: "Logo de Iglesia de Cristo Redentor",
    footer:
      "&copy; {{currentYear}} Iglesia de Cristo Redentor. Todos los derechos reservados.",
  },
  "en-US": {
    logoAlt: "Church of Christ the Redeemer logo",
    footer:
      "&copy; {{currentYear}} Church of Christ the Redeemer. All rights reserved.",
  },
};

export const BROADCAST_TEMPLATE = `
<!DOCTYPE html>
<html lang="{{lang}}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      body { font-family: "Trebuchet MS", Arial, sans-serif; line-height: 1.6; color: #333; background:#f9f9f9; margin:0; padding:0; }
      .email-container { max-width:600px; margin:0 auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 4px 6px rgba(0,0,0,.1); }
      .email-header { background:#2563EB; padding:24px; text-align:center; }
      .email-header img { max-width:72px; height:auto; }
      .email-content { padding:32px 24px; }
      .email-footer { background:#f3f4f6; padding:16px 24px; text-align:center; font-size:14px; color:#6b7280; }
      @media only screen and (max-width:600px){ .email-container{width:100%;border-radius:0;} .email-content{padding:24px 16px;} }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="email-header">
        <img src="{{baseUrl}}/assets/img/redentor_logo.png" alt="{{logoAlt}}" />
      </div>
      <div class="email-content">{{body}}</div>
      <div class="email-footer">{{footer}}</div>
    </div>
  </body>
</html>
`;
```

- [ ] **Step 4: Register the template** — `apps/web/src/templates/index.ts`

```ts
import { CONTACT_FORM_TEMPLATE } from "./contact-form.template";
import { BROADCAST_TEMPLATE } from "./broadcast.template";

export const TEMPLATES: Record<string, string> = {
  "contact-form": CONTACT_FORM_TEMPLATE,
  broadcast: BROADCAST_TEMPLATE,
};
```

- [ ] **Step 5: Run test + type-check** — vitest on the file → PASS; `pnpm type-check` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/templates/broadcast.template.ts apps/web/src/templates/broadcast.template.test.ts apps/web/src/templates/index.ts
git commit -m "feat(ICR-29): add locale-aware broadcast email template"
```

---

### Task 3 (CP3): Mongo dedupe log (insert-first claim)

**Files:**

- Create: `apps/web/src/service/broadcast/broadcastLog.ts`
- Create: `apps/web/src/service/broadcast/broadcastLog.test.ts`

**Interfaces — Consumes:** `connect()` from `../database.service` (returns `MongoClient | undefined`). **Produces:** `claimBroadcast(id) → Promise<"claimed"|"already-sent"|"error">`, `markSent(id, campaignId) → Promise<void>`, `markFailed(id, reason) → Promise<void>`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/service/broadcast/broadcastLog.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateOne = vi.fn();
const createIndex = vi.fn();
const collection = vi.fn(() => ({ updateOne, createIndex }));
const db = vi.fn(() => ({ collection }));

vi.mock("../database.service", () => ({ connect: vi.fn() }));

import { connect } from "../database.service";
import { claimBroadcast, markFailed, markSent } from "./broadcastLog";

const mockedConnect = vi.mocked(connect);

beforeEach(() => {
  vi.clearAllMocks();
  mockedConnect.mockResolvedValue({ db } as unknown as Awaited<
    ReturnType<typeof connect>
  >);
  updateOne.mockResolvedValue({ acknowledged: true });
  createIndex.mockResolvedValue("broadcastId_1");
});

describe("claimBroadcast", () => {
  it("returns 'claimed' for a fresh broadcastId", async () => {
    expect(await claimBroadcast("b1")).toBe("claimed");
    expect(updateOne).toHaveBeenCalledOnce();
  });
  it("returns 'already-sent' on duplicate-key (E11000)", async () => {
    updateOne.mockRejectedValueOnce({ code: 11000 });
    expect(await claimBroadcast("b1")).toBe("already-sent");
  });
  it("returns 'error' when the DB is unavailable", async () => {
    mockedConnect.mockResolvedValueOnce(undefined);
    expect(await claimBroadcast("b1")).toBe("error");
  });
  it("returns 'error' on a non-duplicate DB error", async () => {
    updateOne.mockRejectedValueOnce(new Error("boom"));
    expect(await claimBroadcast("b1")).toBe("error");
  });
});

describe("markSent / markFailed", () => {
  it("markSent sets status sent + campaignId", async () => {
    await markSent("b1", "camp_1");
    expect(updateOne).toHaveBeenCalledWith(
      { broadcastId: "b1" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "sent", campaignId: "camp_1" }),
      }),
    );
  });
  it("markFailed sets status failed + reason", async () => {
    await markFailed("b1", "send-failed");
    expect(updateOne).toHaveBeenCalledWith(
      { broadcastId: "b1" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "failed",
          reason: "send-failed",
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — vitest on the file → FAIL.

- [ ] **Step 3: Implement** — `apps/web/src/service/broadcast/broadcastLog.ts`

```ts
import { connect } from "../database.service";

export type ClaimResult = "claimed" | "already-sent" | "error";

type BroadcastLogStatus = "sending" | "sent" | "failed";

interface BroadcastLogDocument {
  broadcastId: string;
  status: BroadcastLogStatus;
  campaignId?: string;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
}

const DB_NAME = "website";
const COLLECTION = "broadcast_log";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: number }).code === 11000
  );
}

function logError(op: string, broadcastId: string, error: unknown): void {
  console.error(
    `[broadcast] ${op} failed for ${broadcastId}:`,
    error instanceof Error ? error.message : String(error),
  );
}

/**
 * Insert-first claim. A *sent* doc fails the `status != sent` filter, so the
 * upsert attempts an insert and the unique index throws E11000 → "already-sent".
 * A "failed"/"sending" doc matches → re-claimed (retryable). No doc → upsert claims it.
 */
export async function claimBroadcast(
  broadcastId: string,
): Promise<ClaimResult> {
  const client = await connect();
  if (!client) return "error";
  try {
    const col = client.db(DB_NAME).collection<BroadcastLogDocument>(COLLECTION);
    await col.createIndex({ broadcastId: 1 }, { unique: true });
    const now = new Date();
    await col.updateOne(
      { broadcastId, status: { $ne: "sent" } },
      {
        $set: { status: "sending", updatedAt: now },
        $setOnInsert: { broadcastId, createdAt: now },
      },
      { upsert: true },
    );
    return "claimed";
  } catch (error) {
    if (isDuplicateKeyError(error)) return "already-sent";
    logError("claim", broadcastId, error);
    return "error";
  }
}

export async function markSent(
  broadcastId: string,
  campaignId: string,
): Promise<void> {
  const client = await connect();
  if (!client) return;
  try {
    const col = client.db(DB_NAME).collection<BroadcastLogDocument>(COLLECTION);
    const now = new Date();
    await col.updateOne(
      { broadcastId },
      { $set: { status: "sent", campaignId, sentAt: now, updatedAt: now } },
    );
  } catch (error) {
    logError("markSent", broadcastId, error);
  }
}

export async function markFailed(
  broadcastId: string,
  reason: string,
): Promise<void> {
  const client = await connect();
  if (!client) return;
  try {
    const col = client.db(DB_NAME).collection<BroadcastLogDocument>(COLLECTION);
    await col.updateOne(
      { broadcastId },
      { $set: { status: "failed", reason, updatedAt: new Date() } },
    );
  } catch (error) {
    logError("markFailed", broadcastId, error);
  }
}
```

- [ ] **Step 4: Run test + type-check** — vitest on the file → PASS; `pnpm type-check` → clean. (If the `{ db } as unknown as …` cast complains, fall back to `as never`.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/service/broadcast/broadcastLog.ts apps/web/src/service/broadcast/broadcastLog.test.ts
git commit -m "feat(ICR-29): add broadcast_log dedupe with insert-first claim"
```

---

### Task 4 (CP4): Mailchimp campaign transport

**Files:**

- Create: `apps/web/src/service/broadcast/mailchimpCampaign.ts`
- Create: `apps/web/src/service/broadcast/mailchimpCampaign.test.ts`

**Interfaces — Produces:** `BROADCAST_REPLY_TO`, `MailchimpConfigError`, `isMailchimpConfigured(): boolean`, `sendCampaign({ subjectLine, title, html, text }): Promise<string>` (returns campaignId).

- [ ] **Step 1: Write the failing test** — `apps/web/src/service/broadcast/mailchimpCampaign.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const setContent = vi.fn();
const send = vi.fn();
const setConfig = vi.fn();

vi.mock("@mailchimp/mailchimp_marketing", () => ({
  default: { setConfig, campaigns: { create, setContent, send } },
}));

import {
  BROADCAST_REPLY_TO,
  MailchimpConfigError,
  isMailchimpConfigured,
  sendCampaign,
} from "./mailchimpCampaign";

const ENV = {
  MAILCHIMP_API_KEY: "SECRET_KEY_123",
  MAILCHIMP_API_SERVER: "us21",
  MAILCHIMP_AUDIENCE_ID: "aud_1",
  MAILCHIMP_FROM_NAME: "Iglesia de Cristo Redentor",
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(process.env, ENV);
  create.mockResolvedValue({ id: "camp_1" });
  setContent.mockResolvedValue({});
  send.mockResolvedValue({});
});
afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k as keyof typeof ENV];
});

describe("isMailchimpConfigured", () => {
  it("is true when all vars are set", () =>
    expect(isMailchimpConfigured()).toBe(true));
  it("is false when MAILCHIMP_FROM_NAME is missing", () => {
    delete process.env.MAILCHIMP_FROM_NAME;
    expect(isMailchimpConfigured()).toBe(false);
  });
});

describe("sendCampaign", () => {
  it("creates, sets content, sends, returns the campaignId", async () => {
    const id = await sendCampaign({
      subjectLine: "S",
      title: "broadcast b1",
      html: "<p>x</p>",
      text: "x",
    });
    expect(id).toBe("camp_1");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "regular",
        recipients: { list_id: "aud_1" },
        settings: expect.objectContaining({
          subject_line: "S",
          title: "broadcast b1",
          from_name: "Iglesia de Cristo Redentor",
          reply_to: BROADCAST_REPLY_TO,
        }),
      }),
    );
    expect(setContent).toHaveBeenCalledWith("camp_1", {
      html: "<p>x</p>",
      plain_text: "x",
    });
    expect(send).toHaveBeenCalledWith("camp_1");
  });

  it("throws MailchimpConfigError and does not call the API when unconfigured", async () => {
    delete process.env.MAILCHIMP_FROM_NAME;
    await expect(
      sendCampaign({ subjectLine: "S", title: "t", html: "h", text: "t" }),
    ).rejects.toBeInstanceOf(MailchimpConfigError);
    expect(create).not.toHaveBeenCalled();
  });

  it("propagates a transport error", async () => {
    create.mockRejectedValueOnce(new Error("api down"));
    await expect(
      sendCampaign({ subjectLine: "S", title: "t", html: "h", text: "t" }),
    ).rejects.toThrow("api down");
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — vitest on the file → FAIL.

- [ ] **Step 3: Implement** — `apps/web/src/service/broadcast/mailchimpCampaign.ts`

```ts
import mailchimp from "@mailchimp/mailchimp_marketing";

export const BROADCAST_REPLY_TO = "info@idcredentor.org";

export class MailchimpConfigError extends Error {
  constructor() {
    super("mailchimp-not-configured");
    this.name = "MailchimpConfigError";
  }
}

export interface CampaignParams {
  subjectLine: string;
  /** Internal campaign name (not shown to subscribers; carries no PII). */
  title: string;
  html: string;
  text: string;
}

export function isMailchimpConfigured(): boolean {
  return Boolean(
    process.env.MAILCHIMP_API_KEY &&
    process.env.MAILCHIMP_API_SERVER &&
    process.env.MAILCHIMP_AUDIENCE_ID &&
    process.env.MAILCHIMP_FROM_NAME,
  );
}

export async function sendCampaign(params: CampaignParams): Promise<string> {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const server = process.env.MAILCHIMP_API_SERVER;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const fromName = process.env.MAILCHIMP_FROM_NAME;
  if (!apiKey || !server || !audienceId || !fromName) {
    throw new MailchimpConfigError();
  }

  mailchimp.setConfig({ apiKey, server });

  const created = await mailchimp.campaigns.create({
    type: "regular",
    recipients: { list_id: audienceId },
    settings: {
      subject_line: params.subjectLine,
      title: params.title,
      from_name: fromName,
      reply_to: BROADCAST_REPLY_TO,
    },
  });

  const campaignId = (created as { id: string }).id;

  await mailchimp.campaigns.setContent(campaignId, {
    html: params.html,
    plain_text: params.text,
  });

  await mailchimp.campaigns.send(campaignId);

  return campaignId;
}
```

> If `@types/mailchimp__mailchimp_marketing` rejects the `create`/`setContent` body shapes, cast the argument objects (`as Parameters<typeof mailchimp.campaigns.create>[0]`) rather than weakening the runtime values. Keep `reply_to`/`from_name`/`list_id` exactly as above.

- [ ] **Step 4: Run test + type-check** — vitest on the file → PASS; `pnpm type-check` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/service/broadcast/mailchimpCampaign.ts apps/web/src/service/broadcast/mailchimpCampaign.test.ts
git commit -m "feat(ICR-29): add Mailchimp campaign transport for broadcasts"
```

---

### Task 5 (CP5): `sendBroadcast` orchestrator + full suite

**Files:**

- Create: `apps/web/src/service/broadcast.service.ts`
- Create: `apps/web/src/service/broadcast.service.test.ts`

**Interfaces — Consumes:** all of Tasks 1–4 + `renderTemplate` from `@src/templates/template-engine`. **Produces:** `sendBroadcast(input: BroadcastInput): Promise<BroadcastResult>`.

Order of operations: validate → config-check (no claim if unconfigured) → claim → render+send → markSent; catch → markFailed.

- [ ] **Step 1: Write the failing test** — `apps/web/src/service/broadcast.service.test.ts`

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./broadcast/broadcastLog", () => ({
  claimBroadcast: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
}));
vi.mock("./broadcast/mailchimpCampaign", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./broadcast/mailchimpCampaign")>();
  return { ...actual, sendCampaign: vi.fn(), isMailchimpConfigured: vi.fn() };
});

import { sendBroadcast } from "./broadcast.service";
import { claimBroadcast, markFailed, markSent } from "./broadcast/broadcastLog";
import {
  isMailchimpConfigured,
  sendCampaign,
} from "./broadcast/mailchimpCampaign";

const input = {
  broadcastId: "blog:hola:es-AR",
  subject: "Nuevo post",
  html: "<p>cuerpo</p>",
  text: "cuerpo",
  locale: "es-AR" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_BASE_URL = "https://www.idcredentor.org";
  process.env.MAILCHIMP_API_KEY = "SECRET_KEY_123";
  vi.mocked(isMailchimpConfigured).mockReturnValue(true);
  vi.mocked(claimBroadcast).mockResolvedValue("claimed");
  vi.mocked(sendCampaign).mockResolvedValue("camp_1");
});

describe("sendBroadcast", () => {
  it("sends and marks sent on the happy path", async () => {
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "sent", campaignId: "camp_1" });
    expect(sendCampaign).toHaveBeenCalledOnce();
    expect(markSent).toHaveBeenCalledWith("blog:hola:es-AR", "camp_1");
  });

  it("skips without sending when already sent", async () => {
    vi.mocked(claimBroadcast).mockResolvedValue("already-sent");
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "skipped", reason: "already-sent" });
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("fails safe (no send) when the dedupe store is unavailable", async () => {
    vi.mocked(claimBroadcast).mockResolvedValue("error");
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "failed", reason: "dedupe-unavailable" });
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("marks failed and returns failed when the transport throws", async () => {
    vi.mocked(sendCampaign).mockRejectedValueOnce(new Error("api down"));
    const result = await sendBroadcast(input);
    expect(result).toEqual({ status: "failed", reason: "send-failed" });
    expect(markFailed).toHaveBeenCalledWith("blog:hola:es-AR", "send-failed");
  });

  it("rejects invalid input without claiming or sending", async () => {
    const result = await sendBroadcast({ ...input, subject: "" });
    expect(result).toEqual({ status: "failed", reason: "invalid-input" });
    expect(claimBroadcast).not.toHaveBeenCalled();
    expect(sendCampaign).not.toHaveBeenCalled();
  });

  it("returns mailchimp-not-configured without claiming", async () => {
    vi.mocked(isMailchimpConfigured).mockReturnValue(false);
    const result = await sendBroadcast(input);
    expect(result).toEqual({
      status: "failed",
      reason: "mailchimp-not-configured",
    });
    expect(claimBroadcast).not.toHaveBeenCalled();
  });

  it("never leaks the API key to the console", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(sendCampaign).mockRejectedValueOnce(new Error("api down"));
    await sendBroadcast(input);
    const all = [...errorSpy.mock.calls, ...logSpy.mock.calls]
      .flat()
      .map(String)
      .join(" ");
    expect(all).not.toContain("SECRET_KEY_123");
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — vitest on the file → FAIL.

- [ ] **Step 3: Implement** — `apps/web/src/service/broadcast.service.ts`

```ts
import { renderTemplate } from "@src/templates/template-engine";
import { BROADCAST_CHROME } from "@src/templates/broadcast.template";
import {
  broadcastInputSchema,
  type BroadcastInput,
  type BroadcastResult,
} from "./broadcast/types";
import { claimBroadcast, markFailed, markSent } from "./broadcast/broadcastLog";
import {
  MailchimpConfigError,
  isMailchimpConfigured,
  sendCampaign,
} from "./broadcast/mailchimpCampaign";

/**
 * Send ONE email to all current newsletter subscribers via a Mailchimp campaign.
 * Idempotent on `broadcastId`. Never throws — returns a typed result.
 */
export async function sendBroadcast(
  input: BroadcastInput,
): Promise<BroadcastResult> {
  const parsed = broadcastInputSchema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    console.error(`[broadcast] invalid-input: ${fields}`);
    return { status: "failed", reason: "invalid-input" };
  }
  const { broadcastId, subject, html, text, locale } = parsed.data;

  if (!isMailchimpConfigured()) {
    console.error(`[broadcast] mailchimp-not-configured for ${broadcastId}`);
    return { status: "failed", reason: "mailchimp-not-configured" };
  }

  const claim = await claimBroadcast(broadcastId);
  if (claim === "already-sent")
    return { status: "skipped", reason: "already-sent" };
  if (claim === "error")
    return { status: "failed", reason: "dedupe-unavailable" };

  try {
    const chrome = BROADCAST_CHROME[locale];
    const wrappedHtml = renderTemplate("broadcast", {
      lang: locale,
      body: html,
      logoAlt: chrome.logoAlt,
      footer: chrome.footer,
    });

    const campaignId = await sendCampaign({
      subjectLine: subject,
      title: `broadcast ${broadcastId}`,
      html: wrappedHtml,
      text,
    });

    await markSent(broadcastId, campaignId);
    console.log(
      `[broadcast] sent ${broadcastId} (${locale}) campaign=${campaignId}`,
    );
    return { status: "sent", campaignId };
  } catch (error) {
    const reason =
      error instanceof MailchimpConfigError
        ? "mailchimp-not-configured"
        : "send-failed";
    console.error(
      `[broadcast] ${reason} for ${broadcastId}:`,
      error instanceof Error ? error.message : String(error),
    );
    await markFailed(broadcastId, reason);
    return { status: "failed", reason };
  }
}
```

- [ ] **Step 4: Run the FULL verify stack** — `pnpm type-check && pnpm lint && pnpm test && pnpm build` → all green (281 + new tests pass).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/service/broadcast.service.ts apps/web/src/service/broadcast.service.test.ts
git commit -m "feat(ICR-29): add sendBroadcast orchestrator with idempotent dedupe"
```

---

### Task 6 (CP6): Documentation

**Files:**

- Modify: `docs/forms-and-email.md`
- Modify: `docs/likes-and-mongodb.md`

- [ ] **Step 1: Append to `docs/forms-and-email.md`** a `## Broadcast engine (ICR-29)` section covering: `sendBroadcast({ broadcastId, subject, html, text, locale })` is the single reusable way to email all subscribers; transport is a **Mailchimp campaign** (`create → setContent → send`) so Mailchimp owns the list/unsubscribe/CAN-SPAM and **no subscriber PII touches our server**; idempotency via the `broadcast_log` Mongo collection (insert-first claim on the caller's `broadcastId`, e.g. `blog:<slug>:<locale>`); `from_name` = `MAILCHIMP_FROM_NAME`, `reply_to` = `info@idcredentor.org`; the function **never throws** (returns `{status,campaignId?,reason?}`) so callers like ICR-44 can't be broken by a send failure; delivery/bounce tracking is delegated to ICR-28.

- [ ] **Step 2: Append to `docs/likes-and-mongodb.md`** a note that the `website` DB now has a third collection, `broadcast_log` (`{ broadcastId (unique), status: sending|sent|failed, campaignId?, reason?, createdAt, updatedAt, sentAt? }`), used only as the broadcast dedupe guard — written by `src/service/broadcast/broadcastLog.ts`, never read by the public site.

- [ ] **Step 3: Verify** — `pnpm lint` → clean (markdown unaffected; confirms nothing broke).

- [ ] **Step 4: Commit**

```bash
git add docs/forms-and-email.md docs/likes-and-mongodb.md
git commit -m "docs(ICR-29): document broadcast engine + broadcast_log collection"
```

---

## Self-Review

- **Spec coverage:** AC1 single-function send → Task 5; AC2 existing-stack-only (Mailchimp) → Task 4; AC3 unsubscribe (Mailchimp-managed) → Task 4 + docs; AC4 both locales → Tasks 1/2/5 tests; AC5 dedupe/idempotency → Task 3 + Task 5 skip test; AC6 caught/logged, no secrets → Task 5 (never-throws + no-secret-leak test); AC7 unit tests transport-mocked, no real email → all test tasks. Env var → Task 1. Template → Task 2. ✔ all covered.
- **Placeholder scan:** none — every code/test step is concrete.
- **Type consistency:** `claimBroadcast`/`markSent`/`markFailed`, `sendCampaign`/`isMailchimpConfigured`/`MailchimpConfigError`/`BROADCAST_REPLY_TO`, `BROADCAST_CHROME`, `broadcastInputSchema`/`BroadcastInput`/`BroadcastResult` are used with identical names/signatures across producing and consuming tasks. ✔

---

# Revision 2 — Transport pivot: Mailchimp → Resend Broadcasts

> Applied on the existing branch (CP1–CP6 + race fix already committed). This supersedes Task 4 (transport), and amends Tasks 1 (env), 2 (template footer), 5 (orchestrator wiring), 6 (docs). Tasks 3 (dedupe) is unchanged. Resend SDK is **v6.5.2** (already a dependency); `broadcasts.create`/`send` return `{ data, error }` and do NOT throw. `audienceId` satisfies the SDK's `RequireAtLeastOne<SegmentOptions>` (it's the deprecated alias of `segmentId`); **if `@typescript-eslint/no-deprecated` flags it, switch to `segmentId: process.env.RESEND_AUDIENCE_ID`** (same value — a Resend audience id is accepted as the segment id). Run all commands from the worktree; NEVER `--no-verify`; commit only `apps/web/**` + `docs/**`.

### RW-1 — Env swap

In `apps/web/src/types/environment.d.ts`: **remove** the `MAILCHIMP_FROM_NAME: string;` line; **add** (under the Mailchimp/Mail section):

```ts
RESEND_AUDIENCE_ID: string;
BROADCAST_POSTAL_ADDRESS: string;
```

In `apps/web/.env.example`: remove `MAILCHIMP_FROM_NAME=`; add `RESEND_AUDIENCE_ID=` and `BROADCAST_POSTAL_ADDRESS=`.
Verify: `pnpm type-check`. Commit: `refactor(ICR-29): swap broadcast env to RESEND_AUDIENCE_ID + BROADCAST_POSTAL_ADDRESS`

### RW-2 — Resend transport (replaces mailchimpCampaign)

`git rm` `apps/web/src/service/broadcast/mailchimpCampaign.ts` + `mailchimpCampaign.test.ts`. Create `apps/web/src/service/broadcast/resendBroadcast.ts`:

```ts
import { Resend } from "resend";
import { FROM_EMAIL } from "../mailing.service";

export const BROADCAST_REPLY_TO = "info@idcredentor.org";
export const BROADCAST_FROM_NAME = "Iglesia de Cristo Redentor";

export class ResendConfigError extends Error {
  constructor() {
    super("resend-not-configured");
    this.name = "ResendConfigError";
  }
}

export interface BroadcastParams {
  subject: string;
  /** Internal broadcast name (not shown to subscribers; carries no PII). */
  name: string;
  html: string;
  text: string;
}

export function isResendBroadcastConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_AUDIENCE_ID);
}

export async function createAndSendBroadcast(
  params: BroadcastParams,
): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) {
    throw new ResendConfigError();
  }

  const from = `${BROADCAST_FROM_NAME} <${process.env.FROM_EMAIL ?? FROM_EMAIL}>`;
  const resend = new Resend(apiKey);

  const { data: created, error: createError } = await resend.broadcasts.create({
    audienceId, // if no-deprecated lint flags this, use: segmentId: audienceId
    from,
    replyTo: BROADCAST_REPLY_TO,
    subject: params.subject,
    html: params.html,
    text: params.text,
    name: params.name,
  });
  if (createError || !created) {
    throw new Error(
      `broadcast create failed: ${createError?.message ?? "no data returned"}`,
    );
  }

  const { error: sendError } = await resend.broadcasts.send(created.id);
  if (sendError) {
    throw new Error(`broadcast send failed: ${sendError.message}`);
  }

  return created.id;
}
```

Create `apps/web/src/service/broadcast/resendBroadcast.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const send = vi.fn();
vi.mock("resend", () => ({
  Resend: vi.fn(() => ({ broadcasts: { create, send } })),
}));

import {
  BROADCAST_REPLY_TO,
  ResendConfigError,
  createAndSendBroadcast,
  isResendBroadcastConfigured,
} from "./resendBroadcast";

const ENV = {
  RESEND_API_KEY: "SECRET_KEY_123",
  RESEND_AUDIENCE_ID: "aud_1",
  FROM_EMAIL: "no-reply@notifications.idcredentor.org",
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(process.env, ENV);
  create.mockResolvedValue({ data: { id: "bcast_1" }, error: null });
  send.mockResolvedValue({ data: { id: "bcast_1" }, error: null });
});
afterEach(() => {
  for (const k of Object.keys(ENV))
    delete (process.env as Record<string, string | undefined>)[k];
});

describe("isResendBroadcastConfigured", () => {
  it("true when key + audience set", () =>
    expect(isResendBroadcastConfigured()).toBe(true));
  it("false when RESEND_AUDIENCE_ID missing", () => {
    delete (process.env as Record<string, string | undefined>)
      .RESEND_AUDIENCE_ID;
    expect(isResendBroadcastConfigured()).toBe(false);
  });
});

describe("createAndSendBroadcast", () => {
  it("creates then sends and returns the broadcast id", async () => {
    const id = await createAndSendBroadcast({
      subject: "S",
      name: "broadcast b1",
      html: "<p>x</p>",
      text: "x",
    });
    expect(id).toBe("bcast_1");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceId: "aud_1",
        from: expect.stringContaining("no-reply@notifications.idcredentor.org"),
        replyTo: BROADCAST_REPLY_TO,
        subject: "S",
        html: "<p>x</p>",
        text: "x",
        name: "broadcast b1",
      }),
    );
    expect(send).toHaveBeenCalledWith("bcast_1");
  });

  it("throws ResendConfigError and never calls the SDK when unconfigured", async () => {
    delete (process.env as Record<string, string | undefined>)
      .RESEND_AUDIENCE_ID;
    await expect(
      createAndSendBroadcast({ subject: "S", name: "n", html: "h", text: "t" }),
    ).rejects.toBeInstanceOf(ResendConfigError);
    expect(create).not.toHaveBeenCalled();
  });

  it("throws when create returns an error", async () => {
    create.mockResolvedValueOnce({
      data: null,
      error: { message: "bad", name: "validation_error" },
    });
    await expect(
      createAndSendBroadcast({ subject: "S", name: "n", html: "h", text: "t" }),
    ).rejects.toThrow(/create failed/);
    expect(send).not.toHaveBeenCalled();
  });

  it("throws when send returns an error", async () => {
    send.mockResolvedValueOnce({
      data: null,
      error: { message: "nope", name: "application_error" },
    });
    await expect(
      createAndSendBroadcast({ subject: "S", name: "n", html: "h", text: "t" }),
    ).rejects.toThrow(/send failed/);
  });
});
```

Verify: `pnpm --filter @idcr/web exec vitest run src/service/broadcast/resendBroadcast.test.ts` + `pnpm type-check`. Commit: `feat(ICR-29): use Resend Broadcasts as the broadcast transport`

### RW-3 — Template footer (unsubscribe + CAN-SPAM address)

In `apps/web/src/templates/broadcast.template.ts`, extend `BROADCAST_CHROME` with `unsubscribeLabel` and update the footer markup. Final chrome:

```ts
interface BroadcastChrome {
  logoAlt: string;
  footer: string; // may contain {{currentYear}}
  unsubscribeLabel: string;
}

export const BROADCAST_CHROME: Record<BroadcastLocale, BroadcastChrome> = {
  "es-AR": {
    logoAlt: "Logo de Iglesia de Cristo Redentor",
    footer:
      "&copy; {{currentYear}} Iglesia de Cristo Redentor. Todos los derechos reservados.",
    unsubscribeLabel: "Cancelar suscripción",
  },
  "en-US": {
    logoAlt: "Church of Christ the Redeemer logo",
    footer:
      "&copy; {{currentYear}} Church of Christ the Redeemer. All rights reserved.",
    unsubscribeLabel: "Unsubscribe",
  },
};
```

Footer block in `BROADCAST_TEMPLATE` (the triple-brace placeholder is intentional — `renderTemplate` leaves it for Resend to substitute per recipient):

```html
<div class="email-footer">
  {{footer}}<br />
  {{postalAddress}}<br />
  <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">{{unsubscribeLabel}}</a>
</div>
```

Update `apps/web/src/templates/broadcast.template.test.ts` to render with the extra vars (`postalAddress`, `unsubscribeLabel`) and assert: body present, correct `lang`, locale chrome, **footer contains the postal address string passed in**, **footer contains the locale `unsubscribeLabel`**, and **the literal `{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder survives rendering** (`expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}")`). Keep the existing `not.toContain("{{body}}")` / `not.toContain("{{currentYear}}")` assertions.

Verify: vitest on the template test + `pnpm type-check`. Commit: `feat(ICR-29): add Resend unsubscribe + CAN-SPAM address to broadcast footer`

### RW-4 — Orchestrator wiring

In `apps/web/src/service/broadcast.service.ts`: swap the transport import + config guard + render call. Diff intent:

```ts
import { BROADCAST_CHROME } from "@src/templates/broadcast.template";
import {
  ResendConfigError,
  createAndSendBroadcast,
  isResendBroadcastConfigured,
} from "./broadcast/resendBroadcast";
// ...
  if (!isResendBroadcastConfigured()) {
    console.error(`[broadcast] resend-not-configured for ${broadcastId}`);
    return { status: "failed", reason: "resend-not-configured" };
  }
  // ... after a successful claim:
    const chrome = BROADCAST_CHROME[locale];
    const postalAddress =
      process.env.BROADCAST_POSTAL_ADDRESS ??
      "Iglesia de Cristo Redentor — Buenos Aires, Argentina";
    const wrappedHtml = renderTemplate("broadcast", {
      lang: locale,
      body: html,
      logoAlt: chrome.logoAlt,
      footer: chrome.footer,
      postalAddress,
      unsubscribeLabel: chrome.unsubscribeLabel,
    });
    const campaignId = await createAndSendBroadcast({
      subject,
      name: `broadcast ${broadcastId}`,
      html: wrappedHtml,
      text,
    });
    await markSent(broadcastId, campaignId);
    console.log(`[broadcast] sent ${broadcastId} (${locale}) broadcast=${campaignId}`);
    return { status: "sent", campaignId };
  } catch (error) {
    const reason = error instanceof ResendConfigError ? "resend-not-configured" : "send-failed";
    // ... unchanged logging + markFailed + return
  }
```

Update `apps/web/src/service/broadcast.service.test.ts`: change the transport mock from `./broadcast/mailchimpCampaign` to `./broadcast/resendBroadcast` (mock `createAndSendBroadcast` + `isResendBroadcastConfigured`, keep `ResendConfigError` real via importOriginal), set `process.env.RESEND_API_KEY` in `beforeEach`, and change the not-configured expectation to `reason: "resend-not-configured"`. Keep the no-secret-leak test (assert `SECRET_KEY_123` absent from console output). All other cases identical.

Verify the FULL stack: `pnpm type-check && pnpm lint && pnpm test && pnpm build`. Commit: `refactor(ICR-29): wire sendBroadcast to Resend transport`

### RW-5 — Docs

Update the broadcast-engine section of `docs/forms-and-email.md`: transport is **Resend Broadcasts** (`broadcasts.create → send` against `RESEND_AUDIENCE_ID`); Resend manages the unsubscribe link (`{{{RESEND_UNSUBSCRIBE_URL}}}`) + one-click `List-Unsubscribe` header + suppression; the one manual CAN-SPAM piece is `BROADCAST_POSTAL_ADDRESS`; `from` = "Iglesia de Cristo Redentor <FROM_EMAIL>", `replyTo` = info@idcredentor.org; idempotent via `broadcast_log`; never-throws; subscribers live in a managed Resend audience (no PII server-side); human prerequisites = verify domain, create audience, set the two env vars, repoint signup + migrate (ICR-44/follow-up). `docs/likes-and-mongodb.md` is unchanged. Commit: `docs(ICR-29): document Resend Broadcasts transport`
