"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { signOut } from "firebase/auth";
import { useRouter } from "@src/i18n/routing";
import { getFirebaseAuth } from "@src/lib/firebase/client";
import { Button } from "@src/components/ui/button";

/**
 * Small client island shared by the `no-access` page (R9/spec §6) and the
 * authenticated app shell's `Topbar` (Codex round-5 P1 fix — the topbar's
 * user-menu control was previously a disabled placeholder, so a signed-in
 * admin had no way to end their own session from the panel): clears the
 * session cookie via `DELETE /api/auth/session`, ends the Firebase client
 * session, then returns the visitor to `/login`.
 *
 * Codex round-6 P1 fix: navigation only happens once the SERVER confirms the
 * cookie was actually cleared (`response.ok`). `DELETE /api/auth/session` is
 * *idempotent* — calling it twice, or with no/invalid cookie, is harmless —
 * but idempotency is not the same guarantee as *success*. A rejected fetch
 * (offline/network) or a non-2xx response means `Set-Cookie: maxAge=0` never
 * reached the browser, so `__session` is still valid, even though the user
 * is shown `/login` and reasonably believes they've signed out. On a shared
 * device the next person could open a protected route and land back inside
 * the panel with congregant PII still under the prior session. So on
 * failure we stay on the page, surface a retryable error, and re-enable the
 * button instead of navigating.
 */
export function SignOutButton() {
  const t = useTranslations("auth.signOut");
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    setHasError(false);

    let response: Response;
    try {
      response = await fetch("/api/auth/session", { method: "DELETE" });
    } catch (error) {
      console.error("[sign-out] DELETE /api/auth/session failed to send", error);
      setHasError(true);
      setIsSigningOut(false);
      return;
    }

    if (!response.ok) {
      console.error(`[sign-out] DELETE /api/auth/session returned ${response.status}`);
      setHasError(true);
      setIsSigningOut(false);
      return;
    }

    // The server session (the authoritative one — it's what actually gates
    // access to the panel) is confirmed gone at this point. Also ending the
    // Firebase CLIENT session closes an adjacent gap: without this, the
    // browser keeps the previous user's Firebase session, so the next
    // person on a shared device could click "Continuar con Google" on
    // `/login` and be silently re-authenticated as them, minting a brand
    // new session cookie without entering any credentials (`login-form.tsx`
    // already calls `signOut` on its own refusal paths for the same
    // reason). A failure here is logged but must NOT block navigation — the
    // server cookie is what grants access, so failing to clear local
    // Firebase state must not strand the user on a page they can no longer
    // use.
    try {
      await signOut(getFirebaseAuth());
    } catch (error) {
      console.error("[sign-out] Failed to end the Firebase client session", error);
    }

    router.push("/login");
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isSigningOut}
        onClick={() => void handleSignOut()}
      >
        {t("label")}
      </Button>
      {hasError && (
        <span role="alert" className="text-sm text-destructive-text">
          {t("error")}
        </span>
      )}
    </div>
  );
}
