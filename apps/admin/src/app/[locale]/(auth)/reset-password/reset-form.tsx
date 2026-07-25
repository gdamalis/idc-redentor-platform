"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@src/i18n/routing";
import { i18n, isValidLocale } from "@src/i18n/config";
import { Button } from "@src/components/ui/button";
import { requestPasswordReset } from "./actions";

interface ResetRequestState {
  submitted: boolean;
}

const INITIAL_STATE: ResetRequestState = { submitted: false };

/**
 * Reset-request form (R10). Always shows the generic
 * `auth.resetPassword.successGeneric` message once submitted — the server
 * action is enumeration-safe (`{ ok: true }` regardless of whether the
 * address is registered), so the client has nothing more specific to show.
 */
export function ResetForm() {
  const t = useTranslations("auth.resetPassword");
  const locale = useLocale();
  const [state, formAction, isPending] = useActionState<ResetRequestState, FormData>(
    async (_previous, formData) => {
      const email = String(formData.get("email") ?? "");
      const resolvedLocale = isValidLocale(locale) ? locale : i18n.defaultLocale;
      await requestPasswordReset(email, resolvedLocale);
      return { submitted: true };
    },
    INITIAL_STATE,
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
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
            disabled={isPending}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {t("submit")}
        </Button>
      </form>

      {state.submitted && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {t("successGeneric")}
        </p>
      )}

      <Link
        href="/login"
        className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t("backToLogin")}
      </Link>
    </div>
  );
}
