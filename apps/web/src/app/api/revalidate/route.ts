import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { notifyOnPublish } from "@src/service/post-notification.service";

export async function POST(request: Request) {
  const secret = request.headers.get("x-vercel-reval-key");

  if (secret !== process.env.CONTENTFUL_REVALIDATE_SECRET) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
  }

  // Revalidate first and unconditionally — notification is an isolated side-effect.
  // Next.js 16 revalidateTag requires a second profile arg; {} = purge with no custom cache life.
  revalidateTag("site-content", {});

  let notified;
  try {
    const body = await request.json().catch(() => null);
    const contentTypeId = body?.sys?.contentType?.sys?.id;
    const entryId = body?.sys?.id;
    if (typeof contentTypeId === "string" && typeof entryId === "string") {
      const summary = await notifyOnPublish({ contentTypeId, entryId });
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
