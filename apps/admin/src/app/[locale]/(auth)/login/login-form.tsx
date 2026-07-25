"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  GoogleAuthProvider,
  deleteUser,
  getRedirectResult,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import type { Auth, User } from "firebase/auth";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { useRouter, Link } from "@src/i18n/routing";
import { getFirebaseAuth } from "@src/lib/firebase/client";
import { i18n, isValidLocale } from "@src/i18n/config";
import { Button } from "@src/components/ui/button";

interface LoginFormProps {
  readonly callbackUrl?: string;
}

type LoginErrorKey =
  | "wrongPassword"
  | "noInvite"
  | "inviteExpired"
  | "sessionExpired"
  | "popupBlocked"
  | "popupClosed"
  | "network"
  | "tooManyRequests"
  | "generic";

// Maps both Firebase Auth error codes (`auth/...`) and our own
// `POST /api/auth/session` failure reasons to a localized `auth.login.errors.*`
// key. The two code spaces never collide, so one lookup table covers both.
//
// `auth/wrong-password`, `auth/user-not-found`, and `auth/invalid-credential`
// (the modern Firebase code that collapses the first two under
// email-enumeration-protection) all resolve to the same generic
// `wrongPassword` copy — never reveal whether an email is registered.
const ERROR_KEY_BY_CODE: Record<string, LoginErrorKey> = {
  "auth/wrong-password": "wrongPassword",
  "auth/user-not-found": "wrongPassword",
  "auth/invalid-credential": "wrongPassword",
  "auth/popup-blocked": "popupBlocked",
  "auth/popup-closed-by-user": "popupClosed",
  "auth/network-request-failed": "network",
  "auth/too-many-requests": "tooManyRequests",
  "stale-token": "sessionExpired",
};

// Guards against an open redirect: only a same-origin path (not a
// protocol-relative `//host` URL) may be used as the post-login destination.
const LOCAL_PATH_PATTERN = /^\/(?!\/)/;

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const { code } = error as { code: unknown };
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function resolveErrorKey(code: string | undefined): LoginErrorKey {
  return (code ? ERROR_KEY_BY_CODE[code] : undefined) ?? "generic";
}

function sanitizeCallbackUrl(callbackUrl: string | undefined): string {
  return callbackUrl && LOCAL_PATH_PATTERN.test(callbackUrl) ? callbackUrl : "/";
}

// `callbackUrl` arrives with its original `/{locale}` prefix (the proxy built
// it from the full request pathname). next-intl's own router re-adds the
// locale prefix itself, so an already-prefixed path must be stripped first —
// otherwise the resulting URL would double the locale segment.
function stripLocalePrefix(path: string): string {
  const [maybeLocale, ...rest] = path.split("/").filter(Boolean);
  if (!isValidLocale(maybeLocale)) return path;
  const appPath = `/${rest.join("/")}`;
  return appPath === "/" ? "/" : appPath;
}

/**
 * Best-effort cleanup for a Firebase credential that provisioning refused
 * for lack of a matching invite (`no-invite`) — nothing else was ever
 * written for it, so deleting it just prevents an orphaned sign-in-only
 * Firebase account. Must NEVER be called for a `disabled` user: that
 * account is a real, provisioned `AdminUser` and deleting its Firebase
 * credential would break re-enablement.
 */
async function cleanupOrphanFirebaseAccount(auth: Auth): Promise<void> {
  try {
    if (auth.currentUser) await deleteUser(auth.currentUser);
  } catch {
    // Best-effort — sign-out still proceeds regardless of this outcome.
  }
}

export function LoginForm({ callbackUrl }: LoginFormProps) {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<LoginErrorKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasCheckedRedirectResult = useRef(false);

  async function postSession(user: User) {
    const idToken = await user.getIdToken();
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    if (response.ok) {
      const json = (await response.json()) as { preferredLocale?: string };
      const locale = isValidLocale(json.preferredLocale) ? json.preferredLocale : i18n.defaultLocale;
      router.push(stripLocalePrefix(sanitizeCallbackUrl(callbackUrl)), { locale });
      return;
    }

    if (response.status === 403) {
      const json = (await response.json().catch(() => null)) as { reason?: string } | null;
      const auth = getFirebaseAuth();
      // Only a never-provisioned orphan (`no-invite`) gets its Firebase
      // credential deleted. Every other refusal reason — `disabled` (a real,
      // provisioned `AdminUser`; deleting the credential would break
      // re-enablement) and `email-unverified` (a real invite may still be
      // pending; the user just needs to verify their email and sign in
      // again) — leaves the credential alone.
      if (json?.reason === "no-invite") {
        await cleanupOrphanFirebaseAccount(auth);
      }
      await signOut(auth);
      router.push("/no-access");
      return;
    }

    const json = (await response.json().catch(() => null)) as { reason?: string } | null;
    setErrorKey(resolveErrorKey(json?.reason));
  }

  useEffect(() => {
    if (hasCheckedRedirectResult.current) return;
    hasCheckedRedirectResult.current = true;

    async function resolveRedirectSignIn() {
      try {
        const result = await getRedirectResult(getFirebaseAuth());
        if (result) await postSession(result.user);
      } catch (error) {
        setErrorKey(resolveErrorKey(getErrorCode(error)));
      }
    }

    void resolveRedirectSignIn();
    // Deliberately run once on mount only — this only ever completes a Google
    // redirect sign-in the browser is returning from, not a per-render check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEmailPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorKey(null);
    setIsSubmitting(true);
    try {
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      await postSession(credential.user);
    } catch (error) {
      setErrorKey(resolveErrorKey(getErrorCode(error)));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogle() {
    setErrorKey(null);
    setIsSubmitting(true);
    const auth = getFirebaseAuth();
    try {
      const credential = await signInWithPopup(auth, new GoogleAuthProvider());
      await postSession(credential.user);
    } catch (error) {
      const code = getErrorCode(error);
      if (code === "auth/popup-blocked" || code === "auth/popup-closed-by-user") {
        try {
          await signInWithRedirect(auth, new GoogleAuthProvider());
          return;
        } catch (redirectError) {
          setErrorKey(resolveErrorKey(getErrorCode(redirectError)));
          return;
        }
      }
      setErrorKey(resolveErrorKey(code));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {errorKey && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{t(`errors.${errorKey}`)}</span>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={isSubmitting}
        onClick={() => void handleGoogle()}
      >
        {t("googleButton")}
      </Button>

      <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
        {t("orSeparator")}
        <span aria-hidden="true" className="h-px flex-1 bg-border" />
      </div>

      <form className="flex flex-col gap-4" onSubmit={(event) => void handleEmailPassword(event)}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            {t("emailLabel")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={isSubmitting}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            disabled={isSubmitting}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {t("submit")}
        </Button>
      </form>

      <Link
        href="/reset-password"
        className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t("forgotPassword")}
      </Link>
    </div>
  );
}
