"use client";

import { Button } from "@src/components/ui/button";
import { routing, usePathname, useRouter } from "@src/i18n/routing";
import { cn } from "@idcr/ui";
import { useLocale, useTranslations } from "next-intl";

type SupportedLocale = (typeof routing.locales)[number];

const LOCALE_LABEL_KEYS: Record<SupportedLocale, "es" | "en"> = {
  "es-AR": "es",
  "en-US": "en",
};

export function LocaleSwitcher() {
  const t = useTranslations("localeSwitcher");
  const activeLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function handleSelectLocale(nextLocale: SupportedLocale) {
    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <div
      role="group"
      aria-label={t("ariaLabel")}
      className="inline-flex items-center gap-0.5 rounded-md border border-input p-0.5"
    >
      {routing.locales.map((locale) => {
        const isActive = locale === activeLocale;
        return (
          <Button
            key={locale}
            type="button"
            variant={isActive ? "default" : "ghost"}
            size="sm"
            aria-pressed={isActive}
            className={cn("h-7 px-2 text-xs", isActive && "pointer-events-none")}
            onClick={() => handleSelectLocale(locale)}
          >
            {t(LOCALE_LABEL_KEYS[locale])}
          </Button>
        );
      })}
    </div>
  );
}
