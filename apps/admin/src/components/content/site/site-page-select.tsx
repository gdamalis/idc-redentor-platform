"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  SITE_PAGES,
  SITE_PAGE_SLUGS,
  isSitePageSlug,
  type Locale,
  type SitePageSlug,
} from "@idcr/content";
import { Select } from "@src/components/ui/select";

export interface SitePageSelectProps {
  readonly id?: string;
  readonly value?: SitePageSlug;
  readonly allowEmpty?: boolean;
  readonly disabled?: boolean;
  readonly onChange: (slug: SitePageSlug | undefined) => void;
}

/**
 * Closed select strictly driven by `@idcr/content`'s `SITE_PAGES` registry
 * (`ICR-198` AC7, PM `D20` Q1 Option A).
 */
export function SitePageSelect({
  id,
  value,
  allowEmpty = false,
  disabled = false,
  onChange,
}: SitePageSelectProps) {
  const t = useTranslations("contentSite.common");
  const panelLocale = (useLocale() === "en-US" ? "en-US" : "es-AR") as Locale;

  return (
    <Select
      id={id}
      disabled={disabled}
      value={value ?? ""}
      onChange={(e) => {
        const next = e.target.value;
        if (!next) {
          onChange(undefined);
          return;
        }
        if (isSitePageSlug(next)) {
          onChange(next);
        }
      }}
    >
      <option value="">
        {allowEmpty ? t("noTargetPage") : t("pagePlaceholder")}
      </option>
      {SITE_PAGE_SLUGS.map((slug) => {
        const page = SITE_PAGES[slug];
        const pathLabel = page.path || "/";
        return (
          <option key={slug} value={slug}>
            {`${page.label[panelLocale]} (${pathLabel})`}
          </option>
        );
      })}
    </Select>
  );
}
