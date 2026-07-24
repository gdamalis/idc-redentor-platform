import { AppShell } from "@src/components/shell/app-shell";
import { getCurrentUser } from "@src/lib/auth/current-user";
import { redirect } from "@src/i18n/routing";
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
    redirect({ href: "/login", locale });
  }

  return <AppShell>{children}</AppShell>;
}
