"use client";

import * as React from "react";
import type { Locale } from "@idcr/content";
import type { TranslatedFieldError } from "@src/lib/content/field-errors";
import { Notice } from "@src/components/ui/notice";

export interface ErrorSummaryProps {
  readonly heading: string;
  readonly errors: readonly TranslatedFieldError[];
  readonly onSelectError: (error: TranslatedFieldError) => void;
}

/**
 * GOV.UK error-summary pattern (`F-editor-ux-decisions.md` §2.5): receives
 * keyboard focus whenever validation errors appear and links each problem
 * straight to its locale tab and form field.
 */
export const ErrorSummary = React.forwardRef<HTMLDivElement, ErrorSummaryProps>(
  ({ heading, errors, onSelectError }, ref) => {
    if (errors.length === 0) return null;

    return (
      <Notice
        ref={ref}
        variant="error"
        role="alert"
        tabIndex={-1}
        title={heading}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
      >
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {errors.map((err) => (
            <li key={`${err.path}:${err.message}`}>
              <button
                type="button"
                className="cursor-pointer text-left underline underline-offset-2 hover:opacity-80"
                onClick={() => onSelectError(err)}
              >
                {err.message}
              </button>
            </li>
          ))}
        </ul>
      </Notice>
    );
  },
);
ErrorSummary.displayName = "ErrorSummary";

export function focusFieldByPath(
  path: string,
  localeTab: Locale | "general",
  setActiveLocale: (locale: Locale) => void,
): void {
  if (localeTab === "es-AR" || localeTab === "en-US") {
    setActiveLocale(localeTab);
  }
  window.requestAnimationFrame(() => {
    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(path)
        : path.replace(/"/g, '\\"');
    const container = document.querySelector<HTMLElement>(
      `[data-field-path="${escaped}"]`,
    );
    if (!container) return;
    if (typeof container.scrollIntoView === "function") {
      container.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const focusable = container.querySelector<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [contenteditable="true"]',
    );
    focusable?.focus();
  });
}
