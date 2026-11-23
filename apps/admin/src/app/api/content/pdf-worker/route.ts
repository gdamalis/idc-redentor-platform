import { NextResponse } from "next/server";
import { extractBearerToken, isAuthorizedSecret } from "@src/lib/http/secret";
import { runPdfWorkerTick } from "@src/service/content/sermons/pdf-worker.service";

/**
 * Unscheduled admin sermon PDF rebuild worker (`ICR-200`).
 *
 * Lives in `apps/admin` because admin holds the sole `BLOB_READ_WRITE_TOKEN`
 * and transactional `sermonService.updatePdfMedia` / `content_audit` write
 * path. Sits outside `src/proxy.ts` (`/api/*`), so constant-time fail-closed
 * `CRON_SECRET` Bearer verification is the sole gate.
 *
 * Deliberately NOT scheduled in `apps/admin/vercel.json` until `ICR-205`
 * switches the cron away from `apps/web`'s live Contentful PDF worker.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

export async function GET(request: Request) {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!isAuthorizedSecret(token, process.env.CRON_SECRET)) {
    return NextResponse.json(
      { message: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const summary = await runPdfWorkerTick();
  return NextResponse.json(summary, { status: 200, headers: NO_STORE_HEADERS });
}
