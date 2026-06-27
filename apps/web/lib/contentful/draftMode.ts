import { draftMode } from "next/headers";

/**
 * Determines if draft mode should be enabled based on:
 * 1. Manual draft mode toggle (Next.js draftMode())
 * 2. Development environment (NODE_ENV === 'development')
 * 3. Vercel preview environment (VERCEL_ENV === 'preview')
 *
 * @returns Promise<boolean> - true if draft mode should be enabled
 */
export async function shouldUseDraftMode(): Promise<boolean> {
  // Check if draft mode is manually enabled via API routes
  const { isEnabled } = await draftMode();
  if (isEnabled) {
    return true;
  }

  // Auto-enable in development environment
  if (process.env.NODE_ENV === "development") {
    return true;
  }

  // Auto-enable in Vercel preview deployments
  if (process.env.VERCEL_ENV === "preview") {
    return true;
  }

  return false;
}

