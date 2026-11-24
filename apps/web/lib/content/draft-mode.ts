import { draftMode } from "next/headers";
import { isAlwaysDraftEnvironment } from "@src/lib/draft-headers";

/**
 * Determines whether the current request should read draft snapshots from MongoDB:
 * 1. Signed Draft Mode cookie enabled via `/api/preview` (`draftMode().isEnabled`)
 * 2. Always-draft environments (staging, Vercel PR preview, or local development)
 */
export async function shouldUseDraftMode(): Promise<boolean> {
  const { isEnabled } = await draftMode();
  if (isEnabled) {
    return true;
  }

  return isAlwaysDraftEnvironment();
}
