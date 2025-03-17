import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Common patterns used in vulnerability scanning
const SUSPICIOUS_PATTERNS = [
  /\.php$/i,             // PHP files
  /wp-/i,                // WordPress related
  /admin/i,              // Admin paths
  /\.env$/i,             // Environment files
  /\.conf$/i,            // Config files
  /\.ini$/i,             // INI files
  /\.sql$/i,             // SQL files
  /\.phtml$/i,           // PHP/HTML files
  /shell/i,              // Shell related
  /eval/i,               // Eval attempts
  /xmlrpc\.php/i,        // XML-RPC in WordPress
  /phpmyadmin/i,         // phpMyAdmin
  /\/(xampp|cpanel|phpmyadmin|wp-admin)/i, // Common admin panels
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check if the request matches any suspicious pattern
  if (SUSPICIOUS_PATTERNS.some(pattern => pattern.test(pathname))) {
    const url = request.nextUrl.clone();
    url.pathname = '/not-found';
    return NextResponse.rewrite(url);
  }

  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 200 });
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(es-AR|en-US)/:path*", "/((?!_next|_vercel|api|.*\\..*).*)"],
};
