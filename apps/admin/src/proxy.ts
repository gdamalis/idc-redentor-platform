import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { SESSION_COOKIE_NAME, verifySession } from "@src/lib/auth/session";
import { REQUEST_PATHNAME_HEADER } from "@src/lib/http/request-pathname";

const intlMiddleware = createMiddleware(routing);

/**
 * Clones `request` with an added `x-pathname` header carrying the current
 * `pathname + search`. next-intl's own `next()`/rewrite composition derives
 * the headers it forwards downstream from `new Headers(request.headers)` —
 * i.e. from the request object it's GIVEN, not from anything on its
 * response — so passing this clone into `intlMiddleware` means the header
 * survives into whatever response it builds. Used so the `(app)` RSC layout
 * can rebuild `callbackUrl` on its own redirect (see
 * `lib/http/request-pathname.ts`).
 */
function withRequestPathnameHeader(request: NextRequest): NextRequest {
  const headers = new Headers(request.headers);
  headers.set(
    REQUEST_PATHNAME_HEADER,
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return new NextRequest(request, { headers });
}

// Locale-relative (app) paths reachable without a session: the sign-in
// surface itself, the password-reset request flow, and the "you're signed
// in but have no access" landing page. Every other path is `(app)` and
// requires a valid session cookie.
const PUBLIC_AUTH_PATHS = ["/login", "/reset-password", "/no-access"];

function isKnownLocale(segment: string | undefined): segment is string {
  return (
    segment != null && (routing.locales as readonly string[]).includes(segment)
  );
}

/**
 * Splits `/{locale}/rest/of/path` into its locale + app-relative path. Falls
 * back to `routing.defaultLocale` when the leading segment isn't a
 * recognized locale (e.g. a bare path `intlMiddleware` hasn't prefixed yet)
 * — in that case nothing is stripped, since there's no locale segment to
 * remove.
 */
function splitLocaleAndAppPath(pathname: string): {
  locale: string;
  appPath: string;
} {
  const [maybeLocale, ...rest] = pathname.split("/").filter(Boolean);
  if (isKnownLocale(maybeLocale)) {
    return { locale: maybeLocale, appPath: `/${rest.join("/")}` };
  }
  return { locale: routing.defaultLocale, appPath: pathname };
}

function isPublicAuthPath(appPath: string): boolean {
  return PUBLIC_AUTH_PATHS.some((publicPath) => appPath.startsWith(publicPath));
}

// `webmanifest` MUST stay in this list: the matcher below catches
// `/manifest.webmanifest`, and without a bypass an unauthenticated browser
// fetching the manifest gets redirected to /login — so the app is not
// installable from the sign-in screen, which is where it gets installed.
const SAFE_ASSET_EXTENSIONS = [
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
  "webmanifest",
  "xml",
  "txt",
  "woff",
  "woff2",
  "ttf",
  "eot",
] as const;

export function isSafeAssetPath(pathname: string): boolean {
  const extension = pathname.split(".").pop()?.toLowerCase();
  if (!extension || extension === pathname.toLowerCase()) {
    return false;
  }
  return (SAFE_ASSET_EXTENSIONS as readonly string[]).includes(extension);
}

export async function proxy(request: NextRequest) {
  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 200 });
  }

  const pathname = request.nextUrl.pathname;

  // Skip middleware for safe asset extensions
  if (isSafeAssetPath(pathname)) {
    return NextResponse.next();
  }

  const { locale, appPath } = splitLocaleAndAppPath(pathname);

  if (isPublicAuthPath(appPath)) {
    return intlMiddleware(withRequestPathnameHeader(request));
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

  return intlMiddleware(withRequestPathnameHeader(request));
}

export const config = {
  matcher: ["/((?!_next|_vercel|api|trpc).*)"],
};
