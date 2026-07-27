"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { useTranslations } from "next-intl";
import { AlertCircle } from "lucide-react";
import { useRouter, Link } from "@src/i18n/routing";
import { getFirebaseAuth } from "@src/lib/firebase/client";
import { i18n, isValidLocale } from "@src/i18n/config";
import { Button } from "@src/components/ui/button";
import { Input } from "@src/components/ui/input";

interface LoginFormProps {
  readonly callbackUrl?: string;
}

type LoginErrorKey =
  | "wrongPassword"
  | "noInvite"
  | "inviteExpired"
  | "sessionExpired"
  | "provisioningConflict"
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
// it from the full request pathname) and may carry a query string (e.g.
// `?tab=roles`). next-intl's own router re-adds the locale prefix itself, so
// an already-prefixed path must be stripped first — otherwise the resulting
// URL would double the locale segment.
//
// The query string MUST be split off BEFORE the leading path segment is
// parsed (Codex round-3 P2 fix): naively splitting the whole string on `/`
// treats `es-AR?tab=roles` as a single (invalid) locale token, so
// `isValidLocale` fails, the strip never fires, and the stored-locale push
// prepends a SECOND locale onto the untouched original
// (`/en-US/es-AR?tab=roles` — a 404).
function stripLocalePrefix(path: string): string {
  const queryIndex = path.indexOf("?");
  const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const search = queryIndex === -1 ? "" : path.slice(queryIndex);

  const [maybeLocale, ...rest] = pathname.split("/").filter(Boolean);
  if (!isValidLocale(maybeLocale)) return path;

  const appPath = rest.length > 0 ? `/${rest.join("/")}` : "/";
  return `${appPath}${search}`;
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

    if (response.status === 409) {
      // Transient/ambiguous provisioning outcome (Codex round-4 fix) — never
      // a provable "not invited", so the Firebase credential is NEVER
      // deleted here and the user is never routed to /no-access. Just sign
      // out and let them retry.
      await signOut(getFirebaseAuth());
      setErrorKey("provisioningConflict");
      return;
    }

    if (response.status === 403) {
      // No Firebase credential is EVER deleted here, for any refusal reason
      // (a prior `no-invite` cleanup was removed after an expert review —
      // see docs/architecture/admin-auth.md). It only ever fired for someone
      // who signed in through this very page with no invite; anyone who
      // created a Firebase account another way (e.g. Firebase's public REST
      // API) and never visited /login was never touched by it, so it did not
      // reliably achieve its purpose. It was also the root of three separate
      // regressions where a concurrent, legitimately-provisioned account got
      // deleted instead. An uninvited Firebase account is inert — no `User`
      // row, no session cookie, no access — so leaving it in place is both
      // safe and preserves an audit signal for the door to congregant PII. A
      // pre-existing Firebase account for an address that's being invited is
      // a server-side concern for invite CREATION (Admin SDK, a later
      // ticket), not something the client can safely resolve here.
      await signOut(getFirebaseAuth());
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
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={isSubmitting}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            {t("passwordLabel")}
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            disabled={isSubmitting}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
