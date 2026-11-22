"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@idcr/content";
import { Button } from "@src/components/ui/button";
import { formatAdminTimestamp } from "@src/lib/content/status-helpers";
import {
  getSermonPdfStatusAction,
  requestSermonPdfRegenAction,
  type SerializedSermonPdfStatus,
} from "@src/app/[locale]/(app)/content/sermons/actions";

const POLL_INTERVAL_MS = 15_000;

export interface SermonPdfStatusCardProps {
  readonly docId?: string;
  readonly locale: Locale;
  readonly status: SerializedSermonPdfStatus;
  readonly readOnly: boolean;
  readonly onStatusChange: (next: SerializedSermonPdfStatus) => void;
  readonly pollIntervalMs?: number;
}

/**
 * System-managed sermon PDF status card (`F-editor-ux-decisions.md` §2.10, AC4):
 * - Zero manual upload control.
 * - Shows one of 4 states: `ok`, `pending`, `failed`, `none`.
 * - Polls every 15s while `pending` and page is visible; updates live without
 *   touching `useEntryForm` dirty state or editor revision.
 */
export function SermonPdfStatusCard({
  docId,
  locale,
  status,
  readOnly,
  onStatusChange,
  pollIntervalMs = POLL_INTERVAL_MS,
}: SermonPdfStatusCardProps) {
  const t = useTranslations("contentSermons.pdf");
  const panelLocale = useLocale();
  const [isTriggering, setIsTriggering] = React.useState(false);

  const state = status.stateByLocale[locale];
  const pdfDoc = status.pdfs[locale];
  const label = locale === "es-AR" ? t("labelEs") : t("labelEn");

  const onStatusChangeRef = React.useRef(onStatusChange);
  React.useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  // Poll every 15s while any locale PDF is pending
  React.useEffect(() => {
    if (!docId || !status.isPending) return;

    const pollOnce = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const res = await getSermonPdfStatusAction({ docId });
      if (res.ok) {
        onStatusChangeRef.current(res.pdfStatus);
      }
    };

    const timer = window.setInterval(() => {
      void pollOnce();
    }, pollIntervalMs);

    const handleVisibility = () => {
      if (!document.hidden) {
        void pollOnce();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [docId, pollIntervalMs, status.isPending]);

  const handleRegen = async () => {
    if (!docId || readOnly || isTriggering) return;
    setIsTriggering(true);
    try {
      const res = await requestSermonPdfRegenAction({ docId });
      if (res.ok) {
        onStatusChange(res.pdfStatus);
      }
    } finally {
      setIsTriggering(false);
    }
  };

  const generatedAt = status.lastRenderedAt ?? pdfDoc?.createdAt;
  const formattedWhen = generatedAt
    ? formatAdminTimestamp(generatedAt, panelLocale)
    : "";

  return (
    <div
      className="space-y-1.5"
      data-testid={`sermon-pdf-status-${locale}`}
      data-pdf-state={state}
    >
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2.5 text-sm"
      >
        <div className="flex min-w-0 items-center gap-2">
          {state === "ok" && (
            <>
              <CheckCircle2
                className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span className="text-foreground">
                {formattedWhen ? t("ok", { when: formattedWhen }) : t("okNoDate")}
              </span>
            </>
          )}
          {state === "pending" && (
            <>
              <Loader2
                className="size-4 shrink-0 animate-spin text-primary"
                aria-hidden="true"
              />
              <span className="text-foreground">{t("pending")}</span>
            </>
          )}
          {state === "failed" && (
            <>
              <AlertCircle
                className="size-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <span className="text-destructive">{t("failed")}</span>
            </>
          )}
          {state === "none" && (
            <>
              <FileText
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-muted-foreground">{t("none")}</span>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {pdfDoc && state !== "pending" && (
            <a
              href={pdfDoc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              {t("open")}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}

          {!readOnly && state !== "pending" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2.5 text-xs"
              disabled={!docId || isTriggering}
              title={!docId ? t("saveFirstHint") : undefined}
              onClick={() => void handleRegen()}
            >
              <RefreshCw
                className={`size-3.5 ${isTriggering ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {state === "ok"
                ? t("regenerate")
                : state === "failed"
                  ? t("retry")
                  : t("generate")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
