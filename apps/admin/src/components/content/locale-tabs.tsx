"use client";

import type { Locale } from "@idcr/content";
import { cn } from "@idcr/ui";

export interface LocaleTabsProps {
  readonly activeLocale: Locale;
  readonly onChange: (locale: Locale) => void;
  readonly caption: string;
  readonly esLabel: string;
  readonly enLabel: string;
  readonly missingEnCount: number;
  readonly missingEnText?: string;
  readonly errorCounts?: Readonly<Record<Locale, number>>;
}

/**
 * Two-tab content language switcher (`Español` / `English`, `F-editor-ux-decisions.md`
 * §2.4 & §7 #6). Clearly labelled `"Idioma del contenido"` so it stays distinct
 * from the top-bar panel-language switcher.
 */
export function LocaleTabs({
  activeLocale,
  onChange,
  caption,
  esLabel,
  enLabel,
  missingEnCount,
  missingEnText,
  errorCounts,
}: LocaleTabsProps) {
  const esErrors = errorCounts?.["es-AR"] ?? 0;
  const enErrors = errorCounts?.["en-US"] ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {caption}
      </span>
      <div
        role="tablist"
        aria-label={caption}
        className="inline-flex rounded-md border border-border bg-muted/40 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeLocale === "es-AR"}
          onClick={() => onChange("es-AR")}
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
            activeLocale === "es-AR"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span>{esLabel}</span>
          {esErrors > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-semibold text-destructive-foreground">
              {esErrors}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeLocale === "en-US"}
          onClick={() => onChange("en-US")}
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
            activeLocale === "en-US"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span>{enLabel}</span>
          {missingEnCount > 0 && missingEnText && (
            <span className="text-xs text-muted-foreground">
              · {missingEnText}
            </span>
          )}
          {enErrors > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-xs font-semibold text-destructive-foreground">
              {enErrors}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
