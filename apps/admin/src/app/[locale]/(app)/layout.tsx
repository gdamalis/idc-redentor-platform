import { headers } from "next/headers";
import { AppShell } from "@src/components/shell/app-shell";
import { getCurrentUser } from "@src/lib/auth/current-user";
import { redirect } from "@src/i18n/routing";
import {
  REQUEST_PATHNAME_HEADER,
  sanitizeRequestPathname,
} from "@src/lib/http/request-pathname";
import type { ReactNode } from "react";

/**
 * The authoritative server-side gate for every `(app)` route (spec §2 R8).
 * `proxy.ts` already redirects an unauthenticated request before it reaches
 * here (fast local `verifySession(cookie, false)`), but this RSC layout is
 * the gate of record: `getCurrentUser()` re-verifies with
 * `checkRevoked: true`, so a cookie revoked or a Mongo user disabled/deleted
 * *after* the proxy's check is still caught here on every render.
 */
export default async function AppLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const result = await getCurrentUser();

  if (!result.ok) {
    if (result.reason === "no-user" || result.reason === "disabled") {
      redirect({ href: "/no-access", locale });
    }

    // Reached when a cookie is revoked / a Mongo user is disabled AFTER the
    // proxy's own fast local check (`checkRevoked: false`) already let the
    // request through — the proxy's own `callbackUrl` redirect never ran for
    // this request, so it's rebuilt here from the proxy-injected
    // `x-pathname` header (P2 finding) rather than being lost.
    const requestHeaders = await headers();
    const callbackUrl = sanitizeRequestPathname(
      requestHeaders.get(REQUEST_PATHNAME_HEADER),
    );
    redirect({
      href: callbackUrl ? { pathname: "/login", query: { callbackUrl } } : "/login",
      locale,
    });
  }

  return <AppShell>{children}</AppShell>;
}
