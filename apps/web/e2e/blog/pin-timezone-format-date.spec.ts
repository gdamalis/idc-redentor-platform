/**
 * ICR-103: dates must render the AUTHORED calendar day regardless of the visitor's
 * browser time zone.
 *
 * Contentful stores `publishedDate` / `sermonDate` as date-only values ("2026-02-16"),
 * which `new Date()` parses as UTC midnight. Formatting without a pinned `timeZone`
 * therefore rendered the PREVIOUS day for any visitor west of UTC (e.g. Buenos Aires,
 * UTC-3) — wrong dates sitewide, plus React #418 hydration mismatches in the client
 * components that render them (formatDate.ts / src/i18n/request.ts).
 *
 * These specs run the SAME assertions under two `timezoneId` contexts — the
 * congregation's real zone (America/Argentina/Buenos_Aires, UTC-3) and UTC — and
 * require identical, authored-day output from both. A regression would show the
 * PREVIOUS day under Buenos Aires while UTC still showed the correct one.
 *
 * Ground truth (verified live in Contentful, master environment):
 *   - blog "retiro-idc-redentor-2026"          publishedDate = 2026-02-16
 *   - sermon "el-deseo-mas-profundo-de-dios"   sermonDate    = 2026-06-07
 */

import { expect, test } from "@playwright/test";

const TIMEZONES = ["America/Argentina/Buenos_Aires", "UTC"] as const;

const HYDRATION_ERROR_RE = /#41[89]|#42[0-9]/;

for (const timezoneId of TIMEZONES) {
  test.describe(`timezone-stable dates — ${timezoneId}`, () => {
    test.use({ timezoneId });

    test("blog index renders the authored day in es-AR and en-US", async ({
      page,
    }) => {
      await page.goto("/es-AR/blog");
      await expect(page.getByText("16 de feb de 2026")).toBeVisible();

      await page.goto("/en-US/blog");
      await expect(page.getByText("Feb 16, 2026")).toBeVisible();
    });

    test("sermons listing renders the authored day in es-AR and en-US", async ({
      page,
    }) => {
      await page.goto("/es-AR/predicas");
      await expect(page.getByText("07 de jun de 2026")).toBeVisible();

      await page.goto("/en-US/predicas");
      await expect(page.getByText("Jun 07, 2026")).toBeVisible();
    });

    test("no React hydration warnings on home, blog index, and sermons listing", async ({
      page,
    }) => {
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(err.message));

      for (const path of ["/es-AR", "/es-AR/blog", "/es-AR/predicas"]) {
        await page.goto(path);
      }

      const hydrationErrors = consoleErrors.filter((message) =>
        HYDRATION_ERROR_RE.test(message),
      );
      expect(hydrationErrors).toEqual([]);
    });
  });
}

/**
 * Blocked on this preview: BOTH the blog post detail page and the sermon detail page
 * 500 (Server Components render error, digest 4282309776 = MongoServerError: user is
 * not allowed to do action [find] on [website.likes]) — a pre-existing MongoDB Atlas
 * permissions issue on the preview DB user, unrelated to ICR-103 and reproducing on
 * deployments going back to 2026-06-29. Un-skip once that permission issue is fixed
 * (see the qa-runner report on ICR-103 / the stray-observations log for the ticket
 * tracking it).
 */
test.describe("detail-page date rendering", () => {
  test.skip(
    true,
    "TODO(ICR-103): unskip once the website.likes Mongo Atlas permission issue is fixed",
  );

  test("blog post detail renders the authored day (es-AR)", async ({
    page,
  }) => {
    await page.goto("/es-AR/blog/retiro-idc-redentor-2026");
    await expect(page.getByText("16 de feb de 2026")).toBeVisible();
  });

  test("sermon detail renders the authored day (es-AR)", async ({ page }) => {
    await page.goto("/es-AR/predicas/el-deseo-mas-profundo-de-dios");
    await expect(page.getByText("07 de jun de 2026")).toBeVisible();
  });
});
