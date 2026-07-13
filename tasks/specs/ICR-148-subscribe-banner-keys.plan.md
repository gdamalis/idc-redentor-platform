# ICR-148 — Message-Key Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` (or
> `superpowers:subagent-driven-development`) to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Make `/api/subscribe` emit its `messageKey` from the `SUBSCRIBE_BANNER_KEYS` const map instead
of bare string literals, and give both message-key maps a neutral home under `src/i18n/messageKeys/` so a
server route no longer has to reach into a component folder.

**Architecture:** Two `git mv`s plus import repointing. The maps are zero-dependency leaf modules (a const

- a derived union type, no React, no `"use client"`), so every tier — RSC, client component, server
  action, route handler — can import them. No barrel `index.ts`: one inside `src/i18n/` would invite
  re-exporting the server-only `request.ts` into client bundles.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, next-intl, Zod, Vitest.

**Spec:** `tasks/specs/ICR-148-subscribe-banner-keys.md`
**Jira:** https://divinelab.atlassian.net/browse/ICR-148

## Global Constraints

- **Zero behavior change.** No wire value, HTTP status, or locale string may change. The emitted strings
  stay byte-identical: `SubscribeBanner.error-unexpected`, `SubscribeBanner.error-already-subscribed`.
- **Do not touch** `public/locales/es-AR.json` or `public/locales/en-US.json`. Not one byte.
- **Do not touch** `SubscribeBanner.tsx` — it is _not_ an importer of the key map (it reads
  `state.messageKey` and passes it to `t()`).
- **No barrel** `src/i18n/messageKeys/index.ts`.
- **Exported symbol names, key names and values are unchanged** by the move: `SUBSCRIBE_BANNER_KEYS`,
  `SubscribeBannerKey`, `CONTACT_FORM_KEYS`, `ContactFormKey`.
- **Use `git mv`** so git records renames, not delete+add.
- **Format only the files this ticket touches.** The repo carries ~174 files of pre-existing Prettier debt
  (identical on `origin/main`); a repo-wide `pnpm format` would bury the diff in unrelated churn (ICR-109).
- **Commit type is `refactor`**, header ≤ 100 chars: `refactor(ICR-148): …`
- Working directory for all commands: `/Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148`.
  All `apps/web`-relative paths below are relative to that worktree.

---

## File Structure

| File                                                                                                                      | Responsibility                                                            |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/web/src/i18n/messageKeys/subscribeBanner.ts`                                                                        | **New (moved).** `SUBSCRIBE_BANNER_KEYS` + `SubscribeBannerKey`.          |
| `apps/web/src/i18n/messageKeys/subscribeBanner.test.ts`                                                                   | **New (moved).** Pins map value → literal wire string; pins both locales. |
| `apps/web/src/i18n/messageKeys/contactForm.ts`                                                                            | **New (moved).** `CONTACT_FORM_KEYS` + `ContactFormKey`.                  |
| `apps/web/src/i18n/messageKeys/contactForm.test.ts`                                                                       | **New (moved).** Same, for the `ContactForm` namespace.                   |
| `apps/web/src/app/api/subscribe/route.ts`                                                                                 | Emits `messageKey` from the const map (the ticket proper).                |
| `apps/web/src/app/api/subscribe/route.test.ts`                                                                            | Asserts the route's bodies against the const map.                         |
| `apps/web/src/service/subscribe.ts`                                                                                       | Import path only.                                                         |
| `apps/web/src/components/features/contact-form/{contactFormAction.ts,contactFormAction.test.ts,types.ts,ContactForm.tsx}` | Import path only.                                                         |
| `docs/architecture/forms-and-email.md`                                                                                    | Two stale path citations.                                                 |

---

## Task 1: Move both message-key maps to `src/i18n/messageKeys/`

**Files:**

- Move: `apps/web/src/components/shared/subscribe-banner/subscribeBannerMessageKeys.ts` → `apps/web/src/i18n/messageKeys/subscribeBanner.ts`
- Move: `apps/web/src/components/shared/subscribe-banner/subscribeBannerMessageKeys.test.ts` → `apps/web/src/i18n/messageKeys/subscribeBanner.test.ts`
- Move: `apps/web/src/components/features/contact-form/contactFormMessageKeys.ts` → `apps/web/src/i18n/messageKeys/contactForm.ts`
- Move: `apps/web/src/components/features/contact-form/contactFormMessageKeys.test.ts` → `apps/web/src/i18n/messageKeys/contactForm.test.ts`
- Modify: `apps/web/src/service/subscribe.ts:1-4`
- Modify: `apps/web/src/components/features/contact-form/contactFormAction.ts:6`
- Modify: `apps/web/src/components/features/contact-form/contactFormAction.test.ts:3`
- Modify: `apps/web/src/components/features/contact-form/types.ts:2`
- Modify: `apps/web/src/components/features/contact-form/ContactForm.tsx:21`

**Interfaces:**

- Consumes: nothing (first task).
- Produces: two importable modules —
  - `@src/i18n/messageKeys/subscribeBanner` → `SUBSCRIBE_BANNER_KEYS` (`{ ERROR_ALREADY_SUBSCRIBED: "SubscribeBanner.error-already-subscribed"; ERROR_UNEXPECTED: "SubscribeBanner.error-unexpected" }`) and the type `SubscribeBannerKey`.
  - `@src/i18n/messageKeys/contactForm` → `CONTACT_FORM_KEYS` and the type `ContactFormKey`.
    Task 2 imports `SUBSCRIBE_BANNER_KEYS` from the first of these.

- [ ] **Step 1: Create the directory and move all four files with `git mv`**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148/apps/web
mkdir -p src/i18n/messageKeys

git mv src/components/shared/subscribe-banner/subscribeBannerMessageKeys.ts \
       src/i18n/messageKeys/subscribeBanner.ts
git mv src/components/shared/subscribe-banner/subscribeBannerMessageKeys.test.ts \
       src/i18n/messageKeys/subscribeBanner.test.ts
git mv src/components/features/contact-form/contactFormMessageKeys.ts \
       src/i18n/messageKeys/contactForm.ts
git mv src/components/features/contact-form/contactFormMessageKeys.test.ts \
       src/i18n/messageKeys/contactForm.test.ts
```

- [ ] **Step 2: Verify git recorded renames, not delete+add**

Run: `git status --porcelain`
Expected: four lines beginning with `R` (rename). If you see `D` + `??` pairs instead, undo and redo with
`git mv`.

- [ ] **Step 3: Fix the stale Mailchimp comment in `subscribeBanner.ts`**

The newsletter is Resend, not Mailchimp (see `CLAUDE.md`). This is the **only** content change to either
map. Everything else in both files stays byte-for-byte identical.

In `src/i18n/messageKeys/subscribeBanner.ts`, change line 10:

```ts
/** Shown when the submitted email is already on the Mailchimp audience. */
```

to:

```ts
/** Shown when the submitted email is already on the Resend audience. */
```

- [ ] **Step 4: Repoint each moved test's own relative dynamic import**

In `src/i18n/messageKeys/subscribeBanner.test.ts`, change the `describe` label and the dynamic import:

```ts
describe("subscribeBanner message keys", () => {
  it("exports all expected message keys as a const map", async () => {
    const { SUBSCRIBE_BANNER_KEYS } = await import("./subscribeBanner");
```

In `src/i18n/messageKeys/contactForm.test.ts`, do the same:

```ts
describe("contactForm message keys", () => {
  it("exports all expected message keys as a const map", async () => {
    const { CONTACT_FORM_KEYS } = await import("./contactForm");
```

Also delete the now-false leftover sentence in `contactForm.test.ts`'s header comment — the file it refers
to has existed since ICR-49:

```
 * This test must fail until contactFormMessageKeys.ts is created and
 * the ContactForm namespace is added to both locale JSON files.
```

Leave every `expect(...)` assertion in both files exactly as-is. The locale JSON imports use the
`@public/*` alias, so the move does **not** change their relative depth — do not touch them.

- [ ] **Step 5: Repoint the five importers (import path only)**

`src/service/subscribe.ts` — lines 1-4 become:

```ts
import {
  SUBSCRIBE_BANNER_KEYS,
  type SubscribeBannerKey,
} from "@src/i18n/messageKeys/subscribeBanner";
```

`src/components/features/contact-form/contactFormAction.ts` — line 6 becomes:

```ts
import { CONTACT_FORM_KEYS } from "@src/i18n/messageKeys/contactForm";
```

`src/components/features/contact-form/contactFormAction.test.ts` — line 3 becomes:

```ts
import { CONTACT_FORM_KEYS } from "@src/i18n/messageKeys/contactForm";
```

`src/components/features/contact-form/types.ts` — line 2 becomes (**keep `import type`**):

```ts
import type { ContactFormKey } from "@src/i18n/messageKeys/contactForm";
```

`src/components/features/contact-form/ContactForm.tsx` — line 21 becomes:

```ts
import { CONTACT_FORM_KEYS } from "@src/i18n/messageKeys/contactForm";
```

- [ ] **Step 6: Prove the old paths are completely dead**

Run:

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148
grep -rn "subscribeBannerMessageKeys\|contactFormMessageKeys" apps/web/src || echo "CLEAN"
```

Expected: `CLEAN`. Any hit is a missed importer. No re-export shim may be left at the old location.

- [ ] **Step 7: Run the full verification stack**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148
pnpm type-check && pnpm lint && pnpm test
```

Expected: all three green; **463 tests passed**, same as the pre-change baseline (this task moves tests,
it does not add or remove any).

- [ ] **Step 8: Confirm the moved tests actually EXECUTED**

A test file in a directory the vitest `include` glob misses runs as a silent no-op — a green total proves
nothing (ICR-21). `vitest.config.ts` globs `src/**`, so these _should_ be picked up; verify it, don't
assume it.

Run:

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148
pnpm test 2>&1 | grep "messageKeys/"
```

Expected: both `src/i18n/messageKeys/subscribeBanner.test.ts` and
`src/i18n/messageKeys/contactForm.test.ts` appear by name with a passing test count.

- [ ] **Step 9: Format only the touched files, then commit**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148/apps/web
pnpm exec prettier --write \
  src/i18n/messageKeys/subscribeBanner.ts \
  src/i18n/messageKeys/subscribeBanner.test.ts \
  src/i18n/messageKeys/contactForm.ts \
  src/i18n/messageKeys/contactForm.test.ts \
  src/service/subscribe.ts \
  src/components/features/contact-form/contactFormAction.ts \
  src/components/features/contact-form/contactFormAction.test.ts \
  src/components/features/contact-form/types.ts \
  src/components/features/contact-form/ContactForm.tsx

cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148
git add -A
git commit -m "refactor(ICR-148): move message-key maps to src/i18n/messageKeys"
```

---

## Task 2: Emit `SUBSCRIBE_BANNER_KEYS` from the subscribe route

**Files:**

- Modify: `apps/web/src/app/api/subscribe/route.ts:15,22,27,29`
- Modify: `apps/web/src/app/api/subscribe/route.test.ts:38,44,52,60,69,78,86`
- Modify: `docs/architecture/forms-and-email.md:62,90`

**Interfaces:**

- Consumes: `SUBSCRIBE_BANNER_KEYS` from `@src/i18n/messageKeys/subscribeBanner` (Task 1).
- Produces: nothing new — `POST /api/subscribe`'s wire contract is **unchanged**.

- [ ] **Step 1: Rewrite `route.ts` to reference the const map**

`apps/web/src/app/api/subscribe/route.ts` in full:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { addSubscriber } from "@src/service/subscribe.service";
import {
  BROADCAST_LOCALES,
  DEFAULT_BROADCAST_LOCALE,
} from "@src/service/broadcast/types";
import { SUBSCRIBE_BANNER_KEYS } from "@src/i18n/messageKeys/subscribeBanner";

const bodySchema = z.object({
  email: z.string().trim().email(),
  locale: z.enum(BROADCAST_LOCALES).optional(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { messageKey: SUBSCRIBE_BANNER_KEYS.ERROR_UNEXPECTED },
      { status: 400 },
    );
  }
  const locale = parsed.data.locale ?? DEFAULT_BROADCAST_LOCALE;
  const outcome = await addSubscriber(parsed.data.email, locale);
  if (outcome.ok) return NextResponse.json({ success: true }, { status: 200 });
  if (outcome.reason === "already-subscribed") {
    return NextResponse.json(
      { messageKey: SUBSCRIBE_BANNER_KEYS.ERROR_ALREADY_SUBSCRIBED },
      { status: 409 },
    );
  }
  if (outcome.reason === "invalid-input") {
    return NextResponse.json(
      { messageKey: SUBSCRIBE_BANNER_KEYS.ERROR_UNEXPECTED },
      { status: 400 },
    );
  }
  return NextResponse.json(
    { messageKey: SUBSCRIBE_BANNER_KEYS.ERROR_UNEXPECTED },
    { status: 500 },
  );
}
```

- [ ] **Step 2: Prove no literal survives in the route**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148
grep -n '"SubscribeBanner\.' apps/web/src/app/api/subscribe/route.ts || echo "CLEAN — zero literals"
```

Expected: `CLEAN — zero literals` (this is AC-1).

- [ ] **Step 3: Repoint the seven assertions in `route.test.ts`**

Add the import after line 5 (`import { POST } from "./route";`):

```ts
import { SUBSCRIBE_BANNER_KEYS } from "@src/i18n/messageKeys/subscribeBanner";
```

Then replace each literal body assertion. The 409 case:

```ts
expect(await res.json()).toEqual({
  messageKey: SUBSCRIBE_BANNER_KEYS.ERROR_ALREADY_SUBSCRIBED,
});
```

And each of the six `error-unexpected` cases (invalid email, empty body, malformed JSON, invalid-input,
failed, not-configured):

```ts
expect(await res.json()).toEqual({
  messageKey: SUBSCRIBE_BANNER_KEYS.ERROR_UNEXPECTED,
});
```

Leave every `expect(res.status)` assertion, every mock, and the `{ success: true }` assertion untouched.

- [ ] **Step 4: Run the tests — expect green**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148
pnpm test
```

Expected: **463 passed.** Green here proves nothing on its own (the code was already correct — this ticket
closes a _linkage_ hole, not a behavior bug). Step 5 is what actually proves the work.

- [ ] **Step 5: THE MUTATION CHECK — mandatory, do not skip**

This replaces TDD's RED phase. A suite never observed failing is a rubber stamp (ICR-108). Break the const
map and confirm the failure now reaches **`route.test.ts`** — that is the proof the route is linked to the
map rather than to a private copy of its string.

Temporarily edit `apps/web/src/i18n/messageKeys/subscribeBanner.ts`:

```ts
  /** Fallback for server/network/unexpected failures. */
  ERROR_UNEXPECTED: "SubscribeBanner.error-MUTATED",
```

Run:

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148
pnpm test 2>&1 | tee /tmp/icr148-mutation.txt | tail -30
```

**Expected — and each part matters:**

- `src/i18n/messageKeys/subscribeBanner.test.ts` fails (the byte-level wire pin — it caught the rename).
- **`src/app/api/subscribe/route.test.ts` ALSO fails** ← _this is the new protection._ Before this ticket
  it would have stayed **green** while the route silently desynced.
- The route failures are on the **body** `toEqual`, while `expect(res.status)` still passes — precisely the
  blind spot being closed.

Capture the verbatim failing output; it goes in the PR body as the evidence this ticket delivered value.

- [ ] **Step 6: Revert the mutation and prove the tree is clean**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148
git checkout -- apps/web/src/i18n/messageKeys/subscribeBanner.ts
git status --porcelain apps/web/src/i18n/messageKeys/subscribeBanner.ts
pnpm test 2>&1 | tail -5
```

Expected: `git status` prints **nothing** for that file, and the suite is back to **463 passed**. Do not
proceed while the mutation is still on disk.

- [ ] **Step 7: Update the two stale doc citations**

In `docs/architecture/forms-and-email.md`, line 62 — replace:

```
`ContactFormKey` from `src/components/features/contact-form/contactFormMessageKeys.ts`
```

with:

```
`ContactFormKey` from `src/i18n/messageKeys/contactForm.ts`
```

And line 90 — replace:

```
  `src/components/shared/subscribe-banner/subscribeBannerMessageKeys.ts`). `src/service/subscribe.ts`
```

with:

```
  `src/i18n/messageKeys/subscribeBanner.ts`). `src/service/subscribe.ts`
```

Then prove the docs carry no stale path:

```bash
cd /Users/gabriel/repos/idc-redentor-website
grep -rn "subscribeBannerMessageKeys\|contactFormMessageKeys" docs/ || echo "DOCS CLEAN"
```

Expected: `DOCS CLEAN` (this completes AC-5).

- [ ] **Step 8: Full verification stack**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148
pnpm type-check && pnpm lint && pnpm test
```

Expected: all green, 463 passed.

- [ ] **Step 9: Confirm no locale file was touched — the one true failure mode**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148
git diff origin/main --stat -- apps/web/public/locales/ || true
```

Expected: **empty output.** Any diff here violates AC-3 and the `i18n-messages` sensitive-area
constraint — stop and investigate rather than committing.

- [ ] **Step 10: Format the touched files and commit**

```bash
cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148/apps/web
pnpm exec prettier --write \
  src/app/api/subscribe/route.ts \
  src/app/api/subscribe/route.test.ts

cd /Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-148
git add apps/web/src/app/api/subscribe/route.ts \
        apps/web/src/app/api/subscribe/route.test.ts \
        docs/architecture/forms-and-email.md
git commit -m "refactor(ICR-148): use SUBSCRIBE_BANNER_KEYS in the subscribe route"
```

---

## Self-Review

**Spec coverage:** R1/R2 (neutral home, no barrel) → Task 1 Step 1. R3 (move the maps) → T1 S1-S3.
R4 (move the tests) → T1 S1, S4. R5 (5 importers) → T1 S5, verified S6. R6 (the route + its test) →
Task 2 S1-S3. R7 (stale Mailchimp comment) → T1 S3. R8 (docs) → T2 S7. Edge cases 1-7 → T1 S2 (rename
detection), T1 S5 (`import type` preserved), T1 S6 + T2 S7 (old paths dead), T1 S9 + T2 S10 (scoped
format), T2 S5 (mutation check), T2 S9 (locale guard), T1 S8 (tests actually execute). Testing strategy
§9 → T2 S5-S6. **No gaps.**

**Placeholder scan:** none — every code step carries the literal code, every command its expected output.

**Type consistency:** `SUBSCRIBE_BANNER_KEYS.ERROR_UNEXPECTED` / `.ERROR_ALREADY_SUBSCRIBED` and
`CONTACT_FORM_KEYS` / `ContactFormKey` are used identically in Task 1 (Produces) and Task 2 (Consumes).
Module specifiers match exactly: `@src/i18n/messageKeys/subscribeBanner`, `@src/i18n/messageKeys/contactForm`.
