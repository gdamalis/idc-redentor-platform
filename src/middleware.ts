import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

export function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 200 });
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(es-AR|en-US)/:path*", "/((?!_next|_vercel|api|.*\\..*).*)"],
};
