"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { Locale } from "@idcr/content";
import { Button } from "@src/components/ui/button";

export interface LocalizedFieldReferenceProps {
  readonly activeLocale: Locale;
  /** Muted Spanish original shown below the English field (`F-editor-ux-decisions.md` §2.4). */
  readonly spanishOriginal?: React.ReactNode;
  readonly isEnglishEmpty?: boolean;
  /** Collapsible for long rich-text fields. */
  readonly collapsible?: boolean;
  readonly readOnly?: boolean;
  readonly onCopyFromSpanish?: () => void;
}

/**
 * Helper block rendered beneath localized inputs when editing the `en-US` tab:
 * displays the Spanish original, fallback hint when empty, and a one-click
 * `"Copiar del español"` action.
 */
export function LocalizedFieldReference({
  activeLocale,
  spanishOriginal,
  isEnglishEmpty = false,
  collapsible = false,
  readOnly = false,
  onCopyFromSpanish,
}: LocalizedFieldReferenceProps) {
  const t = useTranslations("content.locale");
  const [expanded, setExpanded] = React.useState(!collapsible);

  if (activeLocale !== "en-US") return null;

  return (
    <div className="space-y-1.5 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{t("original")}</span>
        <div className="flex items-center gap-2">
          {collapsible && spanishOriginal && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? t("hideOriginal") : t("showOriginal")}
            </Button>
          )}
          {isEnglishEmpty && !readOnly && onCopyFromSpanish && spanishOriginal && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onCopyFromSpanish}
            >
              {t("copy")}
            </Button>
          )}
        </div>
      </div>

      {expanded && spanishOriginal && (
        <div className="whitespace-pre-wrap break-words text-foreground/80">
          {spanishOriginal}
        </div>
      )}

      {isEnglishEmpty && <p className="italic">{t("fallbackHint")}</p>}
    </div>
  );
}
