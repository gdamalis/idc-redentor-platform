import { draftMode } from "next/headers";
import { DEFAULT_LOCALE } from "@idcr/content";
import { classifyPreviewPath } from "@idcr/content/preview";
import { getBlogPostPage } from "@lib/content/getBlogPostPages";
import { getChurchInfoTopic } from "@lib/content/getChurchInfoTopic";
import { getSermon } from "@lib/content/getSermons";
import {
  DRAFT_CACHE_CONTROL,
  DRAFT_ROBOTS_TAG,
} from "@src/lib/draft-headers";

const NO_STORE_HEADERS = {
  "Cache-Control": DRAFT_CACHE_CONTROL,
  "X-Robots-Tag": DRAFT_ROBOTS_TAG,
} as const;

async function resolveExitRedirectTarget(rawPath: string): Promise<string> {
  const route = classifyPreviewPath(rawPath);
  if (!route) {
    return `/${DEFAULT_LOCALE}`;
  }

  // Static pages (including /blog and /predicas index pages) always have a published route and
  // are matched before the single-segment `[topic]` lookup.
  if (route.kind === "static") {
    return route.path;
  }

  const localeHome = `/${route.locale}`;
  try {
    if (route.kind === "blog") {
      const published = await getBlogPostPage(route.slug, route.locale, false);
      return published ? route.path : localeHome;
    }
    if (route.kind === "sermon") {
      const published = await getSermon(route.slug, route.locale, false);
      return published ? route.path : localeHome;
    }
    const published = await getChurchInfoTopic(route.slug, route.locale, false);
    return published ? route.path : localeHome;
  } catch (error) {
    console.error("[preview/exit] Failed to verify published route:", error);
    return localeHome;
  }
}

/**
 * Form-POST handler that turns Draft Mode off and redirects (`303 See Other`) back to the same
 * relative address, or to that locale's home page when the current entry has no published copy.
 * Deliberately POST-only so link prefetchers cannot prematurely clear Draft Mode.
 */
export async function POST(request: Request): Promise<Response> {
  const dm = await draftMode();
  dm.disable();

  let rawPath = "";
  try {
    const formData = await request.formData();
    const field = formData.get("path");
    if (typeof field === "string") {
      rawPath = field;
    }
  } catch {
    // Missing or non-form body: fall back safely to default locale home.
  }

  const target = await resolveExitRedirectTarget(rawPath);

  return new Response(null, {
    status: 303,
    headers: {
      Location: target,
      ...NO_STORE_HEADERS,
    },
  });
}
