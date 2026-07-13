import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { isValidLocale } from "@src/i18n/config";
import { isAuthorizedSecret } from "@src/utils/auth/secret";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const locale = searchParams.get("locale");

  if (!isAuthorizedSecret(secret, process.env.CONTENTFUL_PREVIEW_SECRET)) {
    return new Response("Invalid token", { status: 401 });
  }

  if (!isValidLocale(locale)) {
    return new Response("Invalid locale", { status: 400 });
  }

  const draftModeCall = await draftMode();
  draftModeCall.enable();

  redirect(`/${locale}`);
}
