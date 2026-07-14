# ICR-29 — Broadcast email service (the reusable subscriber-broadcast engine)

> Story · `feat` · QA Depth **heavy** · component Website
> Jira: https://divinelab.atlassian.net/browse/ICR-29 · PR: https://github.com/gdamalis/idc-redentor-web/pull/69
> Consumed by ICR-44 (blog-post notifications). Deferred replacement: ICR-28 (fully in-house mailing).
> **Sensitive areas:** `email-services`, `form-pii-spam`, `env-secrets` (sends to the whole subscriber list).

> **REVISION 2 (transport pivot).** The brainstorm originally locked **Mailchimp campaigns**. Research found Mailchimp's free tier now caps at **250 contacts** and _pauses all sending_ past that (forcing a ~$13/mo upgrade) + a forced "Sent with Mailchimp" badge. Decision: switch the transport to **Resend Broadcasts** — free to **1,000 contacts**, no badge, and Resend manages the unsubscribe link + one-click `List-Unsubscribe` header + suppression. The architecture is unchanged; only the transport unit, env vars, and the template footer change. The site already uses the `resend` SDK (v6.5.2) for transactional mail.

## Design decisions (locked)

1. **Transport: Resend Broadcasts** via the already-installed `resend` SDK (v6.5.2). Flow: `resend.broadcasts.create({ audienceId, from, replyTo, subject, html, text, name })` → `resend.broadcasts.send(id)`. The broadcast targets a managed Resend **Audience** (`RESEND_AUDIENCE_ID`), so **subscriber emails/PII never touch our server**. Zero new deps.
2. **Idempotency: caller-supplied `broadcastId`** + an **insert-first claim** in a Mongo `broadcast_log` collection (`website` DB). The claim happens **before** the irreversible Resend send. (Unchanged from R1.)
3. **Template: one locale-aware `broadcast` template** wrapping the caller's body in branded chrome. Because Resend (unlike Mailchimp) does **not** auto-inject the HTML unsubscribe footer/address, the template footer now includes the **`{{{RESEND_UNSUBSCRIBE_URL}}}`** placeholder (Resend swaps the per-recipient link at send) **+ the physical postal address** (CAN-SPAM).
4. **Invocation: a plain exported async function** `sendBroadcast(...)` (no HTTP route). New env: **`RESEND_AUDIENCE_ID`** + **`BROADCAST_POSTAL_ADDRESS`**. `from` = `"Iglesia de Cristo Redentor <{FROM_EMAIL}>"` (reuses the existing verified notifications address); `replyTo` = constant `info@idcredentor.org`.

## 1. Dependencies Check (all present — nothing to build first)

- `resend@6.5.2` (already used by `apps/web/src/service/mailing/resend.adapter.ts`) — exposes `resend.broadcasts.create/send`. SDK methods return `{ data, error }` (they do **not** throw).
- `zod@^3.25.76` — boundary validation.
- `mongodb` cached client — `apps/web/src/service/database.service.ts#connect()` (returns `MongoClient | undefined`).
- `renderTemplate(name, vars)` — `apps/web/src/templates/template-engine.ts` (dumb `{{key}}` replace; auto-injects `currentYear` + `baseUrl`; leaves the triple-brace `{{{RESEND_UNSUBSCRIBE_URL}}}` untouched because we never pass that key).
- Env already typed: `RESEND_API_KEY`, `FROM_EMAIL` — `apps/web/src/types/environment.d.ts`.

### Human prerequisites before a LIVE send (not needed for the engine's unit tests)

These are Vercel/Resend setup steps the human owns; flagged on the PR + Jira. The engine + tests work without them (transport mocked):

1. **Verify the sending domain** in Resend (DKIM/SPF/MX/DMARC for `notifications.idcredentor.org` or `idcredentor.org`) — free tier allows 1 domain.
2. **Create a Resend Audience** and set **`RESEND_AUDIENCE_ID`** in Vercel (all envs).
3. **Set `BROADCAST_POSTAL_ADDRESS`** in Vercel to the church's real CAN-SPAM postal address (a valid street/PO-box address — city+country alone is insufficient).
4. (ICR-44 / separate ticket) repoint the newsletter signup (`/api/subscribe`) from Mailchimp → Resend Contacts, and migrate existing Mailchimp subscribers into the Resend audience. `MAILCHIMP_FROM_NAME` (set earlier in Vercel) can be removed.

## 2. Requirements

1. Export `sendBroadcast(input: BroadcastInput): Promise<BroadcastResult>` from `apps/web/src/service/broadcast.service.ts`. **It never throws** — all operational + validation failures are caught, logged safely, and returned as a typed result (callers like ICR-44 can't be broken by a send failure).
2. `input.html` is the **inner body** content; the service wraps it in the locale-aware `broadcast` template. `input.text` is the plain-text alternative (Resend `text`).
3. **Validate** `input` with a zod `safeParse` at the boundary. Invalid input → `{ status: "failed", reason: "invalid-input" }` (no throw).
4. **Dedupe (insert-first claim):** before sending, atomically claim `broadcastId` in `broadcast_log`. If already `sent`, return `{ status: "skipped", reason: "already-sent" }` and **do not send**. If Mongo is unavailable, **fail safe** → `{ status: "failed", reason: "dedupe-unavailable" }` and **do not send**.
5. **Send** one Resend broadcast to the audience: `broadcasts.create({ audienceId: RESEND_AUDIENCE_ID, from: BROADCAST_FROM, replyTo: BROADCAST_REPLY_TO, subject: input.subject, html: wrappedHtml, text: input.text, name: \`broadcast \${broadcastId}\` })`, check `error`, then `broadcasts.send(created.id)`, check `error`. On success mark the log `sent`(with the broadcast id as`campaignId`) → `{ status: "sent", campaignId }`.
6. On create/send failure, mark the log `failed` (so a later retry with the same `broadcastId` is allowed) and return `{ status: "failed", reason }` — `reason` is a short non-secret token (`send-failed`).
7. **No secrets/PII in logs.** Log only `broadcastId`, `locale`, `campaignId`, `status`, and `error.message` (never API keys, never subscriber data — with the broadcast transport we never even have subscriber emails).
8. **Config guard:** if `RESEND_API_KEY` or `RESEND_AUDIENCE_ID` is missing, return `{ status: "failed", reason: "resend-not-configured" }` without attempting a send (and without claiming — Edge Cases #7).
9. **CAN-SPAM postal-address guard (fail closed):** if `BROADCAST_POSTAL_ADDRESS` is unset/blank, return `{ status: "failed", reason: "postal-address-missing" }` **before claiming and before sending** (Edge Cases #9). A real postal address is legally required in every broadcast, so there is **no fallback value** — the send does not proceed. Order is load-bearing: validate input → validate Resend config → **validate the postal address** → `claimBroadcast` → send.

## 3. Data Model Changes

### TypeScript interfaces (`apps/web/src/service/broadcast/types.ts`) — unchanged from R1

```ts
import { z } from "zod";

export const BROADCAST_LOCALES = ["es-AR", "en-US"] as const;
export type BroadcastLocale = (typeof BROADCAST_LOCALES)[number];

export const broadcastInputSchema = z.object({
  broadcastId: z.string().trim().min(1), // stable, caller-supplied (ICR-44: `blog:<slug>:<locale>`)
  subject: z.string().trim().min(1),
  html: z.string().min(1), // inner body; service wraps it
  text: z.string().min(1), // plain-text alternative
  locale: z.enum(BROADCAST_LOCALES),
});

export type BroadcastInput = z.infer<typeof broadcastInputSchema>;
export type BroadcastStatus = "sent" | "skipped" | "failed";

export interface BroadcastResult {
  status: BroadcastStatus;
  campaignId?: string; // the Resend broadcast id on success
  reason?: string; // already-sent | invalid-input | dedupe-unavailable | resend-not-configured | postal-address-missing | send-failed
}
```

### MongoDB — `website` DB, `broadcast_log` collection — unchanged from R1

```ts
type BroadcastLogStatus = "sending" | "sent" | "failed";
interface BroadcastLogDocument {
  broadcastId: string; // unique index
  status: BroadcastLogStatus;
  campaignId?: string; // Resend broadcast id
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
  sentAt?: Date;
}
```

Insert-first claim semantics (the Codex-P1-fixed form): claim filter is **`{ broadcastId, status: "failed" }`** — only a _failed_ prior attempt is re-claimable; a `sent` **or** in-flight `sending` doc fails the filter → upsert insert → unique-index E11000 → `already-sent` (blocked). Unique index ensured once per process. `markSent`/`markFailed` as in R1.

## 4. API Changes

**None.** No new HTTP route (decision #4). The engine is a server-side function; ICR-44 owns its own authenticated webhook and calls this in-process.

## 5. New / Modified Files

| File                                                               | Change                                                                                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/service/broadcast/types.ts`                          | reason-token comment: `resend-not-configured` (was `mailchimp-not-configured`); **plus `postal-address-missing`** for the fail-closed CAN-SPAM guard.             |
| `apps/web/src/service/broadcast/types.test.ts`                     | unchanged.                                                                                                                                                        |
| `apps/web/src/templates/broadcast.template.ts`                     | footer adds `{{{RESEND_UNSUBSCRIBE_URL}}}` + `{{postalAddress}}` + `{{unsubscribeLabel}}`; `BROADCAST_CHROME` gains `unsubscribeLabel` per locale.                |
| `apps/web/src/templates/index.ts`                                  | unchanged (already registers `"broadcast"`).                                                                                                                      |
| `apps/web/src/templates/broadcast.template.test.ts`                | assert the unsubscribe placeholder + postal address render; both locales.                                                                                         |
| `apps/web/src/service/broadcast/broadcastLog.ts`                   | unchanged (race-fixed).                                                                                                                                           |
| `apps/web/src/service/broadcast/broadcastLog.test.ts`              | unchanged.                                                                                                                                                        |
| `apps/web/src/service/broadcast/resendBroadcast.ts`                | **Replaces** `mailchimpCampaign.ts`. `BROADCAST_REPLY_TO`, `BROADCAST_FROM`, `ResendConfigError`, `isResendBroadcastConfigured()`, `createAndSendBroadcast(...)`. |
| `apps/web/src/service/broadcast/resendBroadcast.test.ts`           | **Replaces** `mailchimpCampaign.test.ts`. Mock the `resend` SDK (`broadcasts.create`/`send` return `{data,error}`).                                               |
| `apps/web/src/service/broadcast/mailchimpCampaign.ts` + `.test.ts` | **Deleted.**                                                                                                                                                      |
| `apps/web/src/service/broadcast.service.ts`                        | imports + calls the Resend transport; passes `postalAddress` + `unsubscribeLabel` into the template; `resend-not-configured` reason.                              |
| `apps/web/src/service/broadcast.service.test.ts`                   | mock `./broadcast/resendBroadcast`; reason `resend-not-configured`.                                                                                               |
| `apps/web/src/types/environment.d.ts`                              | **remove** `MAILCHIMP_FROM_NAME`; **add** `RESEND_AUDIENCE_ID: string` + `BROADCAST_POSTAL_ADDRESS: string`.                                                      |
| `apps/web/.env.example`                                            | **remove** `MAILCHIMP_FROM_NAME=`; **add** `RESEND_AUDIENCE_ID=` + `BROADCAST_POSTAL_ADDRESS=`.                                                                   |
| `docs/forms-and-email.md`                                          | broadcast-engine section → Resend Broadcasts (transport, managed unsubscribe, the one manual address piece, env, PII posture).                                    |
| `docs/likes-and-mongodb.md`                                        | unchanged (`broadcast_log` already documented).                                                                                                                   |

## 6. Component Hierarchy (module graph)

```
broadcast.service.ts  (sendBroadcast — orchestration, never throws)
├── broadcast/types.ts            (BroadcastInput/Result + zod schema)   ← validate boundary
├── broadcast/broadcastLog.ts     (claim / markSent / markFailed)        ← database.service.connect()
├── templates/template-engine.ts  (renderTemplate "broadcast")           ← templates/broadcast.template.ts
└── broadcast/resendBroadcast.ts  (createAndSendBroadcast: create→send)  ← resend SDK (broadcasts.*)
```

## 7. Edge Cases

1. **Re-invoke after a successful send (same `broadcastId`)** → claim returns `already-sent` → `{ status:"skipped" }`, no second send. (Core AC.)
2. **Re-invoke after a _failed_ send** → log is `failed` → re-claimed → retried.
3. **Concurrent invocations, same new `broadcastId`** → claim filter `{ status:"failed" }` + unique index: only one inserts; the other (and any in-flight `sending`) → E11000 → `already-sent`. Only one broadcast is created+sent. (Codex P1.)
4. **Mongo unreachable** → `dedupe-unavailable`, **no send** (fail safe).
5. **Resend `create` returns an `error`** (or null data) → throw internally → caught → `markFailed` → `{ status:"failed", reason:"send-failed" }`.
6. **Resend `send` returns an `error`** → same: caught → `markFailed` → `send-failed`. (A draft broadcast may remain in Resend; acceptable — the dedupe log is `failed`, retry re-creates.)
7. **Missing Resend config** (`RESEND_API_KEY` / `RESEND_AUDIENCE_ID`) → `resend-not-configured`, no claim, no send.
8. **Invalid input** → zod fail → `invalid-input`, no claim, no send.
9. **`BROADCAST_POSTAL_ADDRESS` unset** → the engine **fails closed**: `{ status: "failed", reason: "postal-address-missing" }` returned **before** `claimBroadcast` — **no claim, no template render, no send**. There is **no fallback address**: a real postal address is a CAN-SPAM legal requirement, and validating before the claim means a retry still works once the address is set (a claim would have marked the id `sending` and caused the retry to be skipped). Setting the var is a human prerequisite for any live send, and the guard is asserted by a dedicated unit test (`returns postal-address-missing without claiming or sending`). This **does** block the engine — by design.
10. **`input.html` contains `{{…}}`** → only our known keys are replaced; unknown braces (incl. `{{{RESEND_UNSUBSCRIBE_URL}}}`) pass through verbatim to Resend.

## 8. i18n

- Template chrome is an in-file const map keyed by `BroadcastLocale` (`logoAlt`, `footer`, **`unsubscribeLabel`**) so both `es-AR` and `en-US` render correct chrome + unsubscribe label. `<html lang="{{lang}}">` from `input.locale`. The postal address is locale-neutral (`BROADCAST_POSTAL_ADDRESS`).

## 9. Testing Strategy (Vitest — heavy depth, transport + DB mocked; **no real email ever sent**)

- **`types.test.ts`** — schema accept/reject (unchanged).
- **`broadcast.template.test.ts`** — body slot filled; `lang` matches locale; both locales' chrome; **footer contains the `{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder + the postal address + the locale unsubscribe label**.
- **`broadcastLog.test.ts`** — claim/skip/retry/connect-fail + the race guard (filter `{status:"failed"}`, in-flight→already-sent) (unchanged).
- **`resendBroadcast.test.ts`** (mock the `resend` SDK) — success: `create` then `send` called in order with `{ audienceId, from, replyTo, subject, html, text }` and returns the broadcast id; `create` returns `{error}` → throws; `send` returns `{error}` → throws; missing config → `ResendConfigError` and the SDK is never called.
- **`broadcast.service.test.ts`** (mock the units) — success → `sent`+id+`markSent`; dedupe `already-sent` → `skipped`, transport never called; transport throws → `markFailed`+`failed`; invalid input → `failed`/no claim/no send; not-configured → `resend-not-configured`/no claim; **`BROADCAST_POSTAL_ADDRESS` unset → `postal-address-missing`, asserting neither `claimBroadcast` nor the transport was called** (the fail-closed CAN-SPAM guard); **no API key in `console` output**.
- **Manual smoke:** none against a deployed env (no trigger surface until ICR-44; staging mail policy forbids live POSTs). Verification = unit suite + `pnpm build`/`type-check`/`lint`. QA TYPE = **chore**.

## 10. Implementation (Revision 2 — transport swap on the existing branch)

The branch already has CP1–CP6 + the race fix committed. Apply the delta:

**RW-1 — Env.** environment.d.ts: remove `MAILCHIMP_FROM_NAME`; add `RESEND_AUDIENCE_ID: string` + `BROADCAST_POSTAL_ADDRESS: string`. `.env.example`: same swap. Commit: `refactor(ICR-29): swap broadcast env to RESEND_AUDIENCE_ID + BROADCAST_POSTAL_ADDRESS`

**RW-2 — Transport.** Delete `mailchimpCampaign.ts` + test; add `resendBroadcast.ts` + test (bind to the SDK types below). Commit: `feat(ICR-29): use Resend Broadcasts as the broadcast transport`

**RW-3 — Template footer.** Add unsubscribe placeholder + postal address + `unsubscribeLabel` chrome; update test. Commit: `feat(ICR-29): add Resend unsubscribe + CAN-SPAM address to broadcast footer`

**RW-4 — Orchestrator.** Rewire to the Resend transport; pass `postalAddress`/`unsubscribeLabel`; `resend-not-configured` reason; update test. Full stack verify: `pnpm type-check && pnpm lint && pnpm test && pnpm build`. Commit: `refactor(ICR-29): wire sendBroadcast to Resend transport`

**RW-5 — Docs.** Update `docs/forms-and-email.md` broadcast section to Resend. Commit: `docs(ICR-29): document Resend Broadcasts transport`

### Resend SDK contract (v6.5.2 — verified from node_modules types)

```ts
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

// create returns { data: { id } | null, error: ErrorResponse | null } — does NOT throw
const { data: created, error: createErr } = await resend.broadcasts.create({
  audienceId: process.env.RESEND_AUDIENCE_ID, // SegmentOptions: audienceId (or segmentId)
  from: BROADCAST_FROM, // "Iglesia de Cristo Redentor <no-reply@notifications.idcredentor.org>"
  replyTo: BROADCAST_REPLY_TO, // "info@idcredentor.org"
  subject,
  html,
  text,
  name: `broadcast ${broadcastId}`, // internal name, not shown to subscribers
});
// then:
const { data: sent, error: sendErr } = await resend.broadcasts.send(created.id);
```

## 11. Open Questions (resolved)

- **RESOLVED:** transport = Resend Broadcasts (free to 1,000 contacts, managed unsubscribe). Mailchimp dropped.
- **RESOLVED:** `replyTo` = `info@idcredentor.org`; `from` display = "Iglesia de Cristo Redentor" over the existing `FROM_EMAIL` address.
- **Human prerequisites** (domain verify, audience id, postal address, signup repoint + migration) tracked on the PR + Jira; not blockers for the engine.
- Delivery/bounce tracking remains out of scope (ICR-28).
