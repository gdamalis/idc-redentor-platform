# ICR-103 — Pin `timeZone` in `formatDate` — Implementation Plan

> **For agentic workers:** This plan is executed by the `divinelab:implementer` agent, one checkpoint per dispatch, composing `superpowers:test-driven-development` + `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every blog/sermon date render the calendar day the editor authored, for every visitor in every timezone, and eliminate the React #418 hydration mismatch it causes.

**Architecture:** One-line fix at the shared helper (`timeZone: "UTC"`), so all 7 call-sites are corrected transitively with zero call-site edits. Plus a defensive next-intl global, and the deletion of a dead component carrying a third copy of the same bug. The interesting engineering is in the **test**: it asserts zone-_independence_ (not a literal string), and ships a control that fails loudly if the timezone shift it depends on ever stops working.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, next-intl v4 (`use-intl@4.13.0`), Vitest + jsdom, pnpm + Turborepo.

**Spec:** `tasks/specs/ICR-103-pin-timezone-format-date.md` (read it first — §9 explains why the obvious test would be a fake test).

## Global Constraints

- **Worktree:** `/Users/gabriel/repos/idc-redentor-website/.claude/worktrees/ICR-103` — all commands run from here. Never work in the main checkout.
- **Branch:** `fix/ICR-103-pin-timezone-format-date`. Never commit to `main`.
- **Commit format:** Conventional Commits, header ≤ 100 chars, `<type>(ICR-103): <description>`.
- **The pinned zone is exactly `"UTC"`** — in both helpers _and_ in next-intl's global. Not `America/Argentina/Buenos_Aires` (that would render a June-14 sermon as June 13). This was decided at the design gate; do not "improve" it.
- **Do not change the helpers' signatures.** Both stay `(date: string, locale: string) => string`. If a call-site needs editing, something has gone wrong — stop and surface it.
- **Do not edit any of the 7 call-sites.** They are fixed transitively. Editing them is out of scope.
- **No message-file edits.** `public/locales/{es-AR,en-US}.json` are untouched.
- **Baseline:** 463 tests / 45 files green before any change. Any _other_ test breaking is a regression you caused.

---

### Task 1 (CP1): RED — the tz-shift regression test

**Files:**

- Modify: `apps/web/src/utils/formatDate.test.ts` (currently 27 lines; append, keep the 4 existing assertions untouched)

**Interfaces:**

- Consumes: `formatDate`, `formatDateLong` from `@src/utils/formatDate` — both `(date: string, locale: string) => string`. Already imported at the top of the test file.
- Produces: nothing consumed by later tasks. Task 2 makes these tests pass.

**Why this shape (read before writing):** asserting a literal output (`toBe("16 feb 2026")`) would **pass on the current buggy code** whenever the test process runs in UTC — which CI does. That is a green rubber stamp, not a regression test. We assert the _property_: the output must not depend on the ambient zone. And because that assertion is vacuous if the timezone shift silently fails to take effect, a **control** test proves the shift is real.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/src/utils/formatDate.test.ts` (keep the existing imports and describe blocks as they are):

```ts
/**
 * ICR-103 — dates must not shift with the runtime time zone.
 *
 * Contentful stores `publishedDate` / `sermonDate` as date-only values
 * ("2026-02-16"), which `new Date()` parses as UTC midnight. Formatting without
 * a pinned `timeZone` therefore renders the PREVIOUS day for any visitor west of
 * UTC (e.g. Buenos Aires, UTC-3) — wrong dates sitewide, plus React #418 in the
 * client components that render them.
 *
 * These tests assert zone-INDEPENDENCE rather than a literal output string: a
 * literal assertion would pass on the buggy code whenever the test process runs
 * in UTC (as CI does), proving nothing.
 */
const UTC = "UTC";
const BUENOS_AIRES = "America/Argentina/Buenos_Aires"; // UTC-3 — the congregation's zone

/** Run `fn` with the process time zone temporarily set to `tz`, always restoring it. */
const withTimeZone = <T>(tz: string, fn: () => T): T => {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = original;
  }
};

/** A real published blog post's `publishedDate`. Authored day = the 16th. */
const AUTHORED_DATE = "2026-02-16";
const AUTHORED_DAY = "16";

describe("timezone stability (ICR-103)", () => {
  it("control: an UNPINNED formatter diverges across zones (proves the tz shift is real)", () => {
    // Deliberately the old, broken shape. If this ever STOPS diverging, the
    // process time zone is not actually changing and every assertion below is
    // vacuous — so this test failing means the harness is broken, not the code.
    const unpinned = (date: string, locale: string) =>
      new Date(date).toLocaleDateString(locale, {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });

    const inUtc = withTimeZone(UTC, () => unpinned(AUTHORED_DATE, "es-AR"));
    const inBuenosAires = withTimeZone(BUENOS_AIRES, () =>
      unpinned(AUTHORED_DATE, "es-AR"),
    );

    expect(inBuenosAires).not.toBe(inUtc);
  });

  it("formatDate renders the authored day in every zone and locale", () => {
    for (const locale of ["es-AR", "en-US"]) {
      const inUtc = withTimeZone(UTC, () => formatDate(AUTHORED_DATE, locale));
      const inBuenosAires = withTimeZone(BUENOS_AIRES, () =>
        formatDate(AUTHORED_DATE, locale),
      );

      expect(inBuenosAires).toBe(inUtc);
      expect(inBuenosAires).toContain(AUTHORED_DAY);
    }
  });

  it("formatDateLong renders the authored day in every zone and locale", () => {
    for (const locale of ["es-AR", "en-US"]) {
      const inUtc = withTimeZone(UTC, () =>
        formatDateLong(AUTHORED_DATE, locale),
      );
      const inBuenosAires = withTimeZone(BUENOS_AIRES, () =>
        formatDateLong(AUTHORED_DATE, locale),
      );

      expect(inBuenosAires).toBe(inUtc);
      expect(inBuenosAires).toContain(AUTHORED_DAY);
    }
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail for the RIGHT reason**

Run:

```bash
pnpm --filter @idcr/web exec vitest run src/utils/formatDate.test.ts
```

Expected — and **all three conditions must hold**:

1. The **control** test **PASSES** (the unpinned formatter diverges: `"16 feb 2026"` under UTC vs `"15 feb 2026"` under Buenos Aires). This is what proves the timezone shift is actually taking effect.
2. **`formatDate renders the authored day…` FAILS** — `expected '15 feb 2026' to be '16 feb 2026'`.
3. **`formatDateLong renders the authored day…` FAILS** — `expected '15 de febrero de 2026' to be '16 de febrero de 2026'`.

**If the control test FAILS**, or if the two regression tests unexpectedly PASS: **STOP and report.** It means `process.env.TZ` is not affecting `Intl` in this runtime, the tests are vacuous, and the whole approach needs rethinking. Do **not** proceed to Task 2 and do **not** "fix" the tests to make them green.

**Capture the failure output verbatim** — it is the reproduction of the bug and goes in the PR body.

- [ ] **Step 3: Commit the RED test**

```bash
git add apps/web/src/utils/formatDate.test.ts
git commit -m "test(ICR-103): add failing tz-shift regression test for formatDate"
```

> Committing a red test is deliberate: it is the evidence the bug was real and reproducible. Task 2 turns it green in the very next commit.

---

### Task 2 (CP2): GREEN — pin the timezone

**Files:**

- Modify: `apps/web/src/utils/formatDate.ts` (whole file — 21 lines)
- Modify: `apps/web/src/i18n/request.ts:14-21` (the `getRequestConfig` return object)

**Interfaces:**

- Consumes: the failing tests from Task 1.
- Produces: `formatDate` / `formatDateLong` — signatures **unchanged** (`(date: string, locale: string) => string`), now zone-stable. The 7 call-sites keep calling them exactly as before.

- [ ] **Step 1: Pin the timezone in both helpers**

Replace the entire contents of `apps/web/src/utils/formatDate.ts` with:

```ts
/**
 * Blog `publishedDate` and sermon `sermonDate` are Contentful **date-only** values
 * ("2026-02-16"), which `new Date()` parses as UTC midnight. They must therefore be
 * formatted **in UTC** to reproduce the calendar day the editor authored — without
 * `timeZone`, `toLocaleDateString` uses the runtime's zone, so every visitor west of
 * UTC renders the previous day, and client components throw React #418 when the
 * server's HTML disagrees with the hydrated text. (ICR-103)
 */
const UTC_DATE_ONLY = { timeZone: "UTC" } as const;

export const formatDate = (date: string, locale: string) => {
  return new Date(date).toLocaleDateString(locale, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    ...UTC_DATE_ONLY,
  });
};

/**
 * Long form with the full month name (e.g. es-AR "26 de junio de 2026",
 * en-US "June 26, 2026"). Used for article-style headers (sermon post header)
 * where the compact `formatDate` reads as an abbreviation. Listings/cards keep
 * `formatDate`.
 */
export const formatDateLong = (date: string, locale: string) => {
  return new Date(date).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...UTC_DATE_ONLY,
  });
};
```

- [ ] **Step 2: Set next-intl's global `timeZone`**

In `apps/web/src/i18n/request.ts`, change the returned config object (currently `{ locale, messages }`) to include `timeZone`. The final return becomes:

```ts
return {
  locale,
  // Pin the zone rather than inheriting the server runtime's. next-intl's default
  // is "the time zone of the server runtime", which differs between the Vercel
  // server (UTC) and the visitor's browser — the same hydration hazard `formatDate`
  // has, one layer up. UTC matches our content convention: blog/sermon dates are
  // date-only CALENDAR DAYS (see src/utils/formatDate.ts).
  //
  // NOTE: next-intl currently formats no dates in this app, so this line changes no
  // rendered output today — it exists so a future `useFormatter()` / `format.dateTime()`
  // call cannot silently reintroduce ICR-103. A real INSTANT (e.g. a service start
  // time) must pass an explicit per-call `timeZone`, since this global would render
  // it in UTC.
  timeZone: "UTC",
  messages: (
    await (locale === "es-AR"
      ? import("../../public/locales/es-AR.json")
      : import(`../../public/locales/${locale}.json`))
  ).default,
};
```

Leave the `locale` resolution logic above it exactly as-is.

- [ ] **Step 3: Run the tests and verify GREEN**

```bash
pnpm --filter @idcr/web exec vitest run src/utils/formatDate.test.ts
```

Expected:

- Both regression tests now **PASS** (Buenos Aires and UTC agree, and both contain the authored day `16`).
- The **control test still PASSES** (the unpinned formatter still diverges — that is correct and expected; the control describes the _old_ shape, not the fixed helper).

- [ ] **Step 4: Run the full stack**

```bash
pnpm test && pnpm type-check && pnpm lint
```

Expected: **466 tests / 45 files green** (463 baseline + 3 new). Zero type errors. Zero lint errors.

If `pnpm type-check` complains about `timeZone` in `request.ts`, stop and report — the installed `use-intl@4.13.0` types declare `IntlConfig.timeZone?: TimeZone`, so it should type-check cleanly.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/utils/formatDate.ts apps/web/src/i18n/request.ts
git commit -m "fix(ICR-103): pin timeZone to UTC in formatDate and next-intl config"
```

---

### Task 3 (CP3): Delete the dead `format-date` component

**Files:**

- Delete: `apps/web/src/components/ui/format-date/FormatDate.tsx`
- Delete: `apps/web/src/components/ui/format-date/index.ts`
- Delete: the now-empty `apps/web/src/components/ui/format-date/` directory

**Interfaces:**

- Consumes: nothing. **Produces:** nothing — this code has zero importers. That is the whole point.

**Why it goes:** it holds a _third_, private copy of this bug (`formatDateFunc` calls `Intl.DateTimeFormat` with `dateStyle: "long"` and no `timeZone`), **and** it imports `useRouter` from `next/router` — a Pages Router API that does not exist under the App Router, so it would throw the moment anyone reused it. Leaving it is leaving a loaded trap.

- [ ] **Step 1: Re-confirm zero importers — WITH a positive control**

```bash
# The negative: does anything outside the directory reference it?
grep -rn --include='*.ts' --include='*.tsx' -E "format-date|FormatDate|formatDateFunc" \
  apps/web/src apps/web/lib | grep -v "apps/web/src/components/ui/format-date/"

# The positive control: prove the pattern DOES match inside the directory.
grep -rn --include='*.tsx' -E "formatDateFunc" apps/web/src/components/ui/format-date/
```

Expected: the **first** command prints **nothing**; the **second** prints 2 matches in `FormatDate.tsx`.

**The control is not optional.** A malformed `grep` (e.g. an unquoted `--include=*.ts` glob, which zsh expands and errors on) exits with empty output that looks _exactly_ like a clean negative. The control is what distinguishes "no importers" from "the search never ran". If the second command prints nothing, your grep is broken — fix it before deleting anything.

- [ ] **Step 2: Delete the directory**

```bash
git rm -r apps/web/src/components/ui/format-date/
```

- [ ] **Step 3: Verify nothing broke**

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

Expected: all four green. **466 tests / 45 files.** A successful `pnpm build` is the real proof the deletion is safe — it resolves every import in the app.

If `pnpm build` fails with `ERR_INVALID_URL` / `input: 'undefined'` during page-data collection, that is the known **environmental** failure, not a code defect: the worktree needs `apps/web/.env.local` (already copied during setup — verify it is still there). Do not "fix" code for this.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(ICR-103): delete the dead format-date component (third copy of the tz bug)"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement                                           | Task                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| R1 — `timeZone: "UTC"` in both helpers                     | Task 2, Step 1                                                                                                 |
| R2 — next-intl global `timeZone`                           | Task 2, Step 2                                                                                                 |
| R3 — delete dead `format-date`                             | Task 3                                                                                                         |
| R4 — tz-shift regression test (fails before, passes after) | Task 1 (RED) → Task 2, Step 3 (GREEN)                                                                          |
| R5 — no behavioral change for a UTC visitor                | Task 1's UTC leg is the pin: `inBuenosAires` is asserted equal to `inUtc`, so UTC's output is the fixed point. |
| §7 Edge case 5 — the test could silently not shift         | Task 1's control test + the explicit STOP condition in Step 2                                                  |
| §7 Edge case 6 — TZ pollution across tests                 | `withTimeZone` restores in `finally`                                                                           |

**Placeholders:** none — every step carries the literal code or command.

**Type consistency:** `formatDate` / `formatDateLong` keep `(date: string, locale: string) => string` across all three tasks; no call-site edits anywhere; `withTimeZone` is defined once in Task 1 and used only there.
