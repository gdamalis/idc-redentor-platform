import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { SESSION_COOKIE_NAME, verifySession } from "@src/lib/auth/session";

const intlMiddleware = createMiddleware(routing);

// Locale-relative (app) paths reachable without a session: the sign-in
// surface itself, the password-reset request flow, and the "you're signed
// in but have no access" landing page. Every other path is `(app)` and
// requires a valid session cookie.
const PUBLIC_AUTH_PATHS = ["/login", "/reset-password", "/no-access"];

function isKnownLocale(segment: string | undefined): segment is string {
  return segment != null && (routing.locales as readonly string[]).includes(segment);
}

/**
 * Splits `/{locale}/rest/of/path` into its locale + app-relative path. Falls
 * back to `routing.defaultLocale` when the leading segment isn't a
 * recognized locale (e.g. a bare path `intlMiddleware` hasn't prefixed yet)
 * — in that case nothing is stripped, since there's no locale segment to
 * remove.
 */
function splitLocaleAndAppPath(pathname: string): { locale: string; appPath: string } {
  const [maybeLocale, ...rest] = pathname.split("/").filter(Boolean);
  if (isKnownLocale(maybeLocale)) {
    return { locale: maybeLocale, appPath: `/${rest.join("/")}` };
  }
  return { locale: routing.defaultLocale, appPath: pathname };
}

function isPublicAuthPath(appPath: string): boolean {
  return PUBLIC_AUTH_PATHS.some((publicPath) => appPath.startsWith(publicPath));
}

export async function proxy(request: NextRequest) {
  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 200 });
  }

  // Extract file extension if present
  const pathname = request.nextUrl.pathname;
  const fileExtension = pathname.split(".").pop()?.toLowerCase();

  // Common safe assets to bypass middleware
  const safeExtensions = [
    "ico",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "svg",
    "webp",
    "css",
    "js",
    "json",
    "xml",
    "txt",
    "woff",
    "woff2",
    "ttf",
    "eot",
  ];

  // Skip middleware for safe asset extensions
  if (fileExtension && safeExtensions.includes(fileExtension)) {
    return NextResponse.next();
  }

  const { locale, appPath } = splitLocaleAndAppPath(pathname);

  if (isPublicAuthPath(appPath)) {
    return intlMiddleware(request);
  }

  // Fast, local verification only (`checkRevoked: false`) — this is a
  // convenience redirect, not the authoritative gate. The `(app)` RSC
  // layout re-checks with `checkRevoked: true` via `getCurrentUser()`.
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const decoded = cookieValue ? await verifySession(cookieValue, false) : null;

  if (!decoded) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${locale}/login`;
    loginUrl.search = "";
    loginUrl.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next|_vercel|api|trpc).*)"],
};
