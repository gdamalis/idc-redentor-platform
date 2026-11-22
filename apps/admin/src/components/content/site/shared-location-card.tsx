"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@src/i18n/routing";
import type { SharedLocationSummary } from "@src/service/content/site/loaders";

export interface SharedLocationCardProps {
  readonly location: SharedLocationSummary | null;
}

/**
 * Read-only summary of the shared `"Dirección y mapa"` global rendered inside
 * `FooterEditor` and `EventBannerEditor` with a direct `"Editar dirección"`
 * link (`F-editor-ux-decisions.md` §2.13, `ICR-198` Scope).
 */
export function SharedLocationCard({ location }: SharedLocationCardProps) {
  const t = useTranslations("contentSite.common");

  const hasAddress = Boolean(
    location?.addressLine1 || location?.city || location?.country,
  );
  const localityLine = [
    location?.neighborhood,
    location?.city,
    location?.country,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(", ");

  return (
    <div
      data-testid="shared-location-card"
      className="space-y-2.5 rounded-md border border-border bg-background p-3.5 text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{t("sharedAddressTitle")}</span>
        </div>
        <Link
          href="/content/location"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <span>{t("sharedAddressEdit")}</span>
          <ExternalLink className="size-3" aria-hidden="true" />
        </Link>
      </div>

      {hasAddress ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          {location?.addressLine1 && (
            <p className="font-medium text-foreground">{location.addressLine1}</p>
          )}
          {localityLine && <p>{localityLine}</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            {location?.googleMapsUrl && (
              <span className="rounded bg-muted px-2 py-0.5 text-[11px]">
                {t("sharedAddressHasMapsLink")}
              </span>
            )}
            {location?.mapEmbedUrl && (
              <span className="rounded bg-muted px-2 py-0.5 text-[11px]">
                {t("sharedAddressHasEmbed")}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("sharedAddressEmpty")}</p>
      )}
    </div>
  );
}
