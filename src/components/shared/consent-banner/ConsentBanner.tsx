"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ShieldCheck } from "lucide-react";
import { Button } from "@src/components/ui/button";
import {
  getConsentPreference,
  setConsentPreference,
  updateGtagConsent,
} from "@src/lib/consent";

const emptySubscribe = () => () => {};

export function ConsentBanner() {
  const t = useTranslations("Consent");
  const [dismissed, setDismissed] = useState(false);

  // Read consent from localStorage synchronously via useSyncExternalStore.
  // Server snapshot returns "pending" (hides banner during SSR).
  // Client snapshot reads localStorage: null = no preference, "granted"/"denied" = saved.
  const savedPreference = useSyncExternalStore(
    emptySubscribe,
    () => getConsentPreference(),
    () => "pending" as const,
  );

  // Side effect only: apply saved consent for returning visitors
  useEffect(() => {
    if (savedPreference === "granted" || savedPreference === "denied") {
      updateGtagConsent(savedPreference);
    }
  }, [savedPreference]);

  const handleAccept = () => {
    setConsentPreference("granted");
    updateGtagConsent("granted");
    setDismissed(true);
  };

  const handleDecline = () => {
    setConsentPreference("denied");
    updateGtagConsent("denied");
    setDismissed(true);
  };

  // Hide during SSR ("pending"), when preference exists, or after user dismissed
  if (savedPreference !== null || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 animate-in slide-in-from-bottom-5 fade-in duration-500">
      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card/95 p-5 shadow-lg backdrop-blur-sm dark:bg-card/90">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          {/* Icon + Message */}
          <div className="flex items-start gap-3 sm:items-center">
            <div className="shrink-0 rounded-full bg-primary/10 p-2 text-primary dark:bg-primary-light/10 dark:text-primary-light">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("message")}
            </p>
          </div>

          {/* Buttons */}
          <div className="flex shrink-0 gap-2 sm:flex-col">
            <Button
              onClick={handleAccept}
              size="sm"
              className="flex-1 rounded-full text-sm sm:flex-none"
            >
              {t("accept")}
            </Button>
            <Button
              onClick={handleDecline}
              variant="ghost"
              size="sm"
              className="flex-1 rounded-full text-sm text-muted-foreground sm:flex-none"
            >
              {t("decline")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
