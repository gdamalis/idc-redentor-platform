# ICR-103 — Pin `timeZone` in `formatDate`: fix off-by-one dates and React #418 hydration

- **Jira:** [ICR-103](https://divinelab.atlassian.net/browse/ICR-103) · Bug · Priority High · Component: Website
- **Branch:** `fix/ICR-103-pin-timezone-format-date` · **Commit type:** `fix`
- **QA depth:** heavy (human-confirmed) · **QA type:** `ui`
- **Sensitive areas:** `i18n-messages` (touches `apps/web/src/i18n/request.ts`, matching the `apps/web/src/i18n/**` glob). No message-file edits.

---

## 1. Dependencies Check

Everything this ticket needs already exists on `main`. Nothing is blocked.

| Dependency                                      | State                                                                                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/utils/formatDate.ts`              | Exists — 21 lines, two exported helpers, no `timeZone` option on either.                                                                                              |
| `apps/web/src/utils/formatDate.test.ts`         | Exists — asserts year presence + locale divergence only. Cannot fail on this bug.                                                                                     |
| `apps/web/src/i18n/request.ts`                  | Exists — `getRequestConfig` returns `{ locale, messages }`. No `timeZone`.                                                                                            |
| `next-intl` `timeZone` support                  | **Verified against installed types**: `use-intl@4.13.0` → `IntlConfig.timeZone?: TimeZone`; next-intl's `RequestConfig` extends `IntlConfig`. The change type-checks. |
| Contentful `publishedDate` / `sermonDate` shape | **Verified live** (see §3). Both date-only.                                                                                                                           |
| Vitest + jsdom                                  | Configured; `src/**` is inside `test.include`, so `formatDate.test.ts` already runs.                                                                                  |

---

## 2. Requirements

1. **R1 — Pin the timezone in both helpers.** `formatDate` and `formatDateLong` in `apps/web/src/utils/formatDate.ts` must pass `timeZone: "UTC"` to `toLocaleDateString`. Signatures stay `(date: string, locale: string) => string`, so **no call-site changes** — all 7 call-sites are fixed transitively.

2. **R2 — Set next-intl's global `timeZone`.** `getRequestConfig` in `apps/web/src/i18n/request.ts` must return `timeZone: "UTC"` alongside `locale` and `messages`. This is **defensive**: next-intl formats zero dates today (§11). It exists so a future `useFormatter()`/`format.dateTime()` call cannot silently reintroduce this bug.

3. **R3 — Delete the dead `format-date` component.** Remove `apps/web/src/components/ui/format-date/` entirely (`FormatDate.tsx` + `index.ts`). It has **zero importers** (grep-confirmed with a positive control), carries a _third_ unpinned copy of this bug in its private `formatDateFunc`, and imports `useRouter` from `next/router` — a Pages Router API that does not exist under the App Router, so it would throw if anyone ever reused it.

4. **R4 — Add a tz-shift regression test** to `apps/web/src/utils/formatDate.test.ts` that **fails on the current implementation and passes on the fix** (§9). It must assert zone-independence, not a literal output string, and must carry a control that proves the tz shift actually took effect.

5. **R5 — No behavioral change for a UTC visitor.** A visitor already in UTC saw the correct day before and must see the identical string after. The fix moves the _other_ zones onto that same answer; it does not move UTC.

---

## 3. Data Model Changes

**None.** No Contentful content-model change, no MongoDB change, no migration. This ticket changes only the _renderer_.

Verified against the live Contentful `production` environment during the design gate:

- **`blogPostPage.publishedDate`** — field type `Date`, `required: true`. All **3** published entries store a **date-only** value: `2026-02-16`, `2026-02-06`, `2025-11-14`. (This settles the ticket's open question — it had only assumed parity with `sermonDate`.)
- **`sermon.sermonDate`** — date-only, per the ticket and the existing `formatSermonDate` precedent.

Both are typed `string` in the TS layer (`BlogPost.ts:52`, `Sermon.ts:13,76`), and both getters request the bare field.

**The invariant this establishes:** these are _calendar days_, not instants. `new Date("2026-02-16")` parses as **UTC midnight** per the ECMAScript date-only form, so the calendar day must be read back **in UTC** to reproduce what the editor typed. Any other zone west of UTC yields the previous day.

---

## 4. API Changes

**None.** No route handler, Server Action, or request/response contract is touched. No Zod schema changes.

---

## 5. New / Modified Files

### Modified

| File                                    | Change                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/utils/formatDate.ts`      | Add `timeZone: "UTC"` to both options objects. Add a comment stating the date-only invariant.                        |
| `apps/web/src/i18n/request.ts`          | Add `timeZone: "UTC"` to the `getRequestConfig` return. Comment: real instants pass an explicit per-call `timeZone`. |
| `apps/web/src/utils/formatDate.test.ts` | Add the tz-shift regression test + the divergence control (§9).                                                      |

### Deleted

| File                                                    | Reason                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `apps/web/src/components/ui/format-date/FormatDate.tsx` | Dead (zero importers); third copy of the bug; broken `next/router` import. |
| `apps/web/src/components/ui/format-date/index.ts`       | Barrel for the above; nothing else in the directory.                       |

### Unchanged (fixed transitively — listed to make the blast radius explicit)

All 7 call-sites keep calling the same signature and need **no edit**:

| Call-site                                                      | Helper           | Field                | Component |
| -------------------------------------------------------------- | ---------------- | -------------------- | --------- |
| `components/features/blog-section/BlogPostCard.tsx:24`         | `formatDate`     | `post.publishedDate` | client    |
| `components/features/blog-post-details/AuthorInfo.tsx:36`      | `formatDate`     | `publishedDate`      | client    |
| `components/features/blog-post-details/RelatedArticles.tsx:49` | `formatDate`     | `post.publishedDate` | server    |
| `components/features/sermon-section/SermonCard.tsx:25`         | `formatDate`     | `sermon.sermonDate`  | client    |
| `components/features/sermon-details/SermonByline.tsx:30`       | `formatDate`     | `publishedDate`      | client    |
| `components/features/sermon-details/SermonHeader.tsx:21`       | `formatDateLong` | `sermon.sermonDate`  | client    |
| `components/features/sermon-details/RelatedSermons.tsx:37`     | `formatDate`     | `sermon.sermonDate`  | server    |

> The ticket said "8 call-sites". It is **7**. The 8th it counted (`ui/format-date/FormatDate.tsx`) never called the shared helper — it had its own private copy, and R3 deletes it.

---

## 6. Component Hierarchy

No component tree changes. The 5 **client** call-sites above are the ones that currently throw React #418 (their server-rendered date text disagrees with the hydrated text); the 2 **server** call-sites render the wrong day silently, with no console error. Both classes are fixed by R1 alone, at the helper.

```
[locale]/page.tsx (home)              → BlogPostCard*        ┐
[locale]/blog/page.tsx (index)        → BlogPostCard*        │
[locale]/blog/[slug]/page.tsx         → AuthorInfo*          ├─ all reach formatDate/formatDateLong
                                      → RelatedArticles      │  (* = "use client" → #418 today)
[locale]/predicas/page.tsx (listing)  → SermonCard*          │
[locale]/predicas/[slug]/page.tsx     → SermonHeader*        │
                                      → SermonByline*        │
                                      → RelatedSermons       ┘
```

---

## 7. Edge Cases

1. **A visitor already in UTC.** Renders identically before and after (R5). The regression test's UTC leg pins this.
2. **A visitor east of UTC** (e.g. UTC+2). `new Date("2026-02-16")` is UTC midnight → 02:00 local, still Feb 16 — so these visitors were _already_ correct, and stay correct. The bug was only ever visible west of UTC. (Worth stating so QA doesn't read "east is fine" as the fix failing.)
3. **An entry that carries a time component.** None exist today (§3). If an editor ever saves one, `timeZone: "UTC"` still renders a _stable, non-hydration-breaking_ day — it just renders the UTC day rather than the authored local day. Accepted: the field is a calendar day by convention. This is strictly better than today, where such a value is _also_ zone-dependent.
4. **An invalid / empty date string.** `new Date("")` → `Invalid Date` → `toLocaleDateString` returns `"Invalid Date"`. **Unchanged by this fix** — the current code does the same. Not in scope; `publishedDate` is `required` in Contentful.
5. **The tz-shift test silently not shifting.** The dangerous one — see §9. If `process.env.TZ` mutation fails to take effect, an equality assertion trivially passes and proves nothing. The control assertion (§9) is what makes this loud instead of silent.
6. **Test pollution across files.** The test mutates the process-global `process.env.TZ`. It must restore the original in a `finally`, so no sibling test in the same worker observes a shifted zone.

---

## 8. i18n

- **No message-file edits.** `public/locales/es-AR.json` and `en-US.json` are untouched. The `i18n-messages` sensitive area is tripped only by the _path_ `src/i18n/request.ts`, not by any string change.
- Both locales are covered by the regression test and by QA: `es-AR` (default) and `en-US`.
- The next-intl global `timeZone: "UTC"` applies to **both** locales identically.

---

## 9. Testing Strategy

### The trap to avoid

A test asserting a literal output (`expect(formatDate("2026-02-16", "es-AR")).toBe("16 feb 2026")`) **passes on the buggy code whenever the test process runs in UTC** — which CI does. It would be a green rubber stamp, exactly the class of non-test the ticket exists to prevent.

### What we assert instead

The property that actually matters: **the formatted day must not depend on the ambient time zone.**

```ts
// Run `fn` with process.env.TZ temporarily set to `tz`, always restoring it.
const withTimeZone = <T>(tz: string, fn: () => T): T => {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = original;
  }
};

const UTC = "UTC";
const BUENOS_AIRES = "America/Argentina/Buenos_Aires"; // UTC-3, the congregation's zone
```

**Test A — the regression test (R4).** For each helper × each locale, the output under `UTC` must equal the output under `BUENOS_AIRES`.

- On the **current** code: `formatDate("2026-02-16", "es-AR")` is `"16 feb 2026"` under UTC and `"15 feb 2026"` under Buenos Aires → **FAILS**. This is a genuine RED.
- On the **fixed** code: both are `"16 feb 2026"` → passes.

**Test B — the control (guards against Edge Case 5).** A deliberately _unpinned_ formatter (`new Date(d).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })` — i.e. the old, broken shape, inlined in the test) must **diverge** between those same two zones. If this control ever stops diverging, the tz shift isn't taking effect and Test A is vacuous — so the suite fails loudly instead of rubber-stamping.

Together: Test B proves the harness can observe a zone shift; Test A proves `formatDate` doesn't move under one.

**Node support:** Node re-reads `process.env.TZ` on assignment and notifies V8's date-time cache (Node ≥ 16; this repo runs 22.14). The control is what verifies this empirically rather than on faith.

### Existing tests

The 4 existing assertions in `formatDate.test.ts` stay as-is. Baseline before any change: **463 tests / 45 files, all green.**

### TDD order (non-negotiable)

Write Test A + Test B → **run and watch A fail** (and B pass) → apply R1 → both green. Do not write the fix first. Record the RED output verbatim; it goes in the PR body as the evidence this ticket delivered value.

### QA (heavy, `ui`, against the PR's Vercel preview)

Matrix: **{home, blog index, a blog post, sermons listing, a sermon detail} × {es-AR, en-US} × {browser tz = America/Argentina/Buenos_Aires, tz = UTC}**. For each:

1. The rendered date equals the day authored in Contentful (`2026-02-16` → "16 feb 2026" / "Feb 16, 2026"), **identical under both forced zones**.
2. Console shows **zero** React #418 / hydration warnings.
3. Server HTML and hydrated DOM agree on the date string (fetch the raw HTML, compare to the live DOM node).

Mapped Playwright projects (`config.playwrightProjectMap`): `e2ePublic` + `e2eBlog`.

---

## 10. Implementation Checkpoints

### CP1 — RED: the tz-shift regression test

- **Files:** `apps/web/src/utils/formatDate.test.ts`
- **Do:** add `withTimeZone`, Test A (both helpers × both locales), Test B (the control).
- **Verify:** `pnpm test` → **Test A FAILS** with a Buenos-Aires-vs-UTC day divergence; **Test B PASSES** (proving the shift is real). Capture the failure output verbatim.
- **Commit:** `test(ICR-103): add failing tz-shift regression test for formatDate`

### CP2 — GREEN: pin the timezone

- **Files:** `apps/web/src/utils/formatDate.ts`, `apps/web/src/i18n/request.ts`
- **Do:** R1 (`timeZone: "UTC"` in both helpers + invariant comment) and R2 (next-intl global + comment).
- **Verify:** `pnpm test` → all green, **including Test A**, and Test B still diverging. Then `pnpm type-check && pnpm lint`.
- **Commit:** `fix(ICR-103): pin timeZone to UTC in formatDate and next-intl config`

### CP3 — Delete the dead `format-date` component

- **Files:** delete `apps/web/src/components/ui/format-date/` (both files).
- **Do:** R3. Re-confirm zero importers with a grep **plus a positive control** (prove the pattern matches inside the directory before trusting the "no matches" outside it) — a bare `grep` that errors returns an empty result that reads exactly like a clean negative.
- **Verify:** `pnpm type-check && pnpm lint && pnpm test && pnpm build` all green.
- **Commit:** `fix(ICR-103): delete the dead format-date component (third copy of the tz bug)`

---

## 11. Open Questions

1. **Resolved — `publishedDate` shape.** Verified live: date-only across all 3 published entries (§3). No longer open.
2. **Resolved — is next-intl's `timeZone` load-bearing?** **No.** Grep found zero `useFormatter` / `format.dateTime` calls; `NextIntlClientProvider` (`app/[locale]/layout.tsx:100`) is passed only `messages`. R2 changes **no rendered output today** — it is purely a guard for future code. Recorded so a reviewer doesn't expect it to move a pixel, and so QA doesn't hunt for its effect.
3. **Accepted tradeoff — the next-intl global is `"UTC"`, not `"America/Argentina/Buenos_Aires"`.** UTC keeps one sitewide convention (_content dates are UTC calendar days_) and protects a future dev who formats `publishedDate` through next-intl. The cost: if a **real instant** is ever rendered via next-intl (e.g. a service start time), the global would render it in UTC, so that call must pass an explicit per-call `timeZone`. A code comment in `request.ts` says exactly this.
4. **Deferred, not filed.** `ui/format-date/` is deleted here (R3), so no cleanup ticket is needed for it. Note ICR-112 is a _different_ dead component (`SubscribeForm.tsx`) and is untouched by this ticket.
