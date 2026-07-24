"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@src/i18n/routing";
import { Button } from "@src/components/ui/button";

/**
 * Small client island for the otherwise-RSC `no-access` page (R9/spec §6):
 * clears the session cookie via `DELETE /api/auth/session`, then returns the
 * visitor to `/login`. The request is fire-and-forget-safe — the route is
 * idempotent even with no/invalid cookie, so failures don't block navigation.
 */
export function SignOutButton() {
  const t = useTranslations("auth.noAccess");
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } finally {
      router.push("/login");
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isSigningOut}
      onClick={() => void handleSignOut()}
    >
      {t("signOut")}
    </Button>
  );
}
