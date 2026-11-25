import { NextResponse } from "next/server";
import { revalidateSiteContent } from "@lib/content/cache";
import { isValidObjectIdHex } from "@lib/content/db";
import { notifyOnPublish } from "@src/service/post-notification.service";
import { isAuthorizedSecret } from "@src/utils/auth/secret";

const NOTIFIABLE_TYPES = new Set(["post", "sermon"]);

function isValidRevalidateSecret(provided: string | null): boolean {
  // Accept WEBSITE_REVALIDATE_SECRET (new name) or CONTENTFUL_REVALIDATE_SECRET
  // (transitional fallback for zero-downtime env rotation until ICR-207 drops it).
  return (
    isAuthorizedSecret(provided, process.env.WEBSITE_REVALIDATE_SECRET) ||
    isAuthorizedSecret(provided, process.env.CONTENTFUL_REVALIDATE_SECRET)
  );
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-vercel-reval-key");

  if (!isValidRevalidateSecret(secret)) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
  }

  // Revalidate immediately (`{ expire: 0 }`) and unconditionally — notification
  // is an isolated side-effect.
  revalidateSiteContent();

  let notified;
  try {
    const body = await request.json().catch(() => null);
    const type = typeof body?.type === "string" ? body.type : undefined;
    const id = typeof body?.id === "string" ? body.id : undefined;
    const shouldNotify =
      process.env.CONTENT_PUBLISH_EMAILS === "true" &&
      body?.notify === true &&
      type !== undefined &&
      NOTIFIABLE_TYPES.has(type) &&
      id !== undefined &&
      isValidObjectIdHex(id);

    if (shouldNotify) {
      const summary = await notifyOnPublish({ type, id });
      notified = summary.perLocale;
    }
  } catch (error) {
    console.error(
      "[revalidate] notify failed:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return NextResponse.json({ revalidated: true, now: Date.now(), notified });
}
