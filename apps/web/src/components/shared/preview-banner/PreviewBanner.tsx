"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export interface PreviewBannerProps {
  /**
   * True when the deployment always renders drafts (staging, PR preview, or local dev),
   * computed server-side via `isAlwaysDraftEnvironment()`. Hides the exit button because
   * clearing the Draft Mode cookie does not disable drafts in those environments.
   */
  readonly isAlwaysDraftEnv: boolean;
  /** Optional pathname override (primarily for tests); defaults to `usePathname()`. */
  readonly currentPathOverride?: string;
}

/**
 * Sticky high-contrast Draft Mode banner (built dormant in `ICR-201`; mounted in
 * `apps/web/src/app/[locale]/layout.tsx` by `ICR-205`).
 */
export function PreviewBanner({
  isAlwaysDraftEnv,
  currentPathOverride,
}: PreviewBannerProps) {
  const pathname = usePathname();
  const t = useTranslations("preview");
  const currentPath = currentPathOverride ?? pathname ?? "";

  return (
    <div
      role="region"
      aria-label={isAlwaysDraftEnv ? t("staging") : t("banner")}
      className="sticky top-0 z-50 border-b border-amber-700 bg-amber-950 px-4 py-2.5 text-sm text-amber-50 shadow-sm"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p className="font-medium">
          {isAlwaysDraftEnv ? t("staging") : t("banner")}
        </p>

        {!isAlwaysDraftEnv && (
          <form method="POST" action="/api/preview/exit">
            <input type="hidden" name="path" value={currentPath} />
            <button
              type="submit"
              className="cursor-pointer rounded-md border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-950 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
            >
              {t("exit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
