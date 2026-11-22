"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ContentStatus, LocationFields } from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Notice } from "@src/components/ui/notice";
import { EntryEditor } from "@src/components/content/entry-editor";
import type { EntryEditorPermissions } from "@src/components/content/entry-editor-types";
import { createSiteFieldErrorMapper } from "@src/lib/content/site/field-errors";
import { normalizeOptionalNumber } from "@src/lib/content/site/normalize";
import { FixedIdentityMeta } from "./fixed-identity-meta";

export interface LocationEditorProps {
  readonly initialDoc: SerializedContentDoc<LocationFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: LocationFields;
  readonly backHref: string;
  readonly backLabel: string;
  readonly friendlyTitle: string;
  readonly machineName: string;
  readonly appearsOn: readonly string[];
  readonly liveUrl?: string;
  readonly permissions: EntryEditorPermissions;
  readonly isTrialMode: boolean;
  readonly isPublishEmailsEnabled: boolean;
}

const EXCLUDE_IMMUTABLE: readonly (keyof LocationFields)[] = [
  "kind",
  "machineName",
];

/**
 * Non-localized shared church address & map global (`globals` / `kind: "location"`).
 * Omits `renderLocalizedFields` so `EntryEditor` hides `LocaleTabs` (`D20`).
 */
export function LocationEditor({
  initialDoc,
  initialStatus,
  initialValues,
  backHref,
  backLabel,
  friendlyTitle,
  machineName,
  appearsOn,
  liveUrl,
  permissions,
  isTrialMode,
  isPublishEmailsEnabled,
}: LocationEditorProps) {
  const tContent = useTranslations("content");
  const tSite = useTranslations("contentSite");

  const [latDraft, setLatDraft] = React.useState<string>(() =>
    initialValues.lat !== undefined ? String(initialValues.lat) : "",
  );
  const [lonDraft, setLonDraft] = React.useState<string>(() =>
    initialValues.lon !== undefined ? String(initialValues.lon) : "",
  );

  const customFieldErrorMap = React.useMemo(
    () =>
      createSiteFieldErrorMapper(
        (key, values) => tSite(key as never, values as never),
        "location",
      ),
    [tSite],
  );

  const requiredMark = tContent("errors.requiredMark");

  return (
    <EntryEditor<LocationFields>
      collection="globals"
      docId={initialDoc._id}
      initialDoc={initialDoc}
      initialStatus={initialStatus}
      initialValues={initialValues}
      backHref={backHref}
      backLabel={backLabel}
      getTitle={() => friendlyTitle}
      permissions={permissions}
      isTrialMode={isTrialMode}
      isPublishEmailsEnabled={isPublishEmailsEnabled}
      fixedIdentifier={machineName}
      fixedAppearsOn={appearsOn}
      liveUrl={liveUrl}
      excludeFromPatch={EXCLUDE_IMMUTABLE}
      customFieldErrorMap={customFieldErrorMap}
      topNotices={
        <Notice variant="info">{tSite("location.sharedNotice")}</Notice>
      }
      renderGeneralFields={({ values, form, readOnly, getError }) => (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {tSite("location.addressGroup")}
              </h2>

              <Field
                label={tSite("location.addressLine1")}
                htmlFor="location-address-line1"
                fieldPath="addressLine1"
                requiredToPublish
                requiredMarkLabel={requiredMark}
                error={getError("addressLine1")}
              >
                <Input
                  id="location-address-line1"
                  disabled={readOnly}
                  value={values.addressLine1 ?? ""}
                  onChange={(e) =>
                    form.setField(
                      "addressLine1",
                      e.target.value.trim() ? e.target.value : undefined,
                    )
                  }
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field
                  label={tSite("location.neighborhood")}
                  htmlFor="location-neighborhood"
                  fieldPath="neighborhood"
                  error={getError("neighborhood")}
                >
                  <Input
                    id="location-neighborhood"
                    disabled={readOnly}
                    value={values.neighborhood ?? ""}
                    onChange={(e) =>
                      form.setField(
                        "neighborhood",
                        e.target.value.trim() ? e.target.value : undefined,
                      )
                    }
                  />
                </Field>

                <Field
                  label={tSite("location.city")}
                  htmlFor="location-city"
                  fieldPath="city"
                  requiredToPublish
                  requiredMarkLabel={requiredMark}
                  error={getError("city")}
                >
                  <Input
                    id="location-city"
                    disabled={readOnly}
                    value={values.city ?? ""}
                    onChange={(e) =>
                      form.setField(
                        "city",
                        e.target.value.trim() ? e.target.value : undefined,
                      )
                    }
                  />
                </Field>

                <Field
                  label={tSite("location.country")}
                  htmlFor="location-country"
                  fieldPath="country"
                  requiredToPublish
                  requiredMarkLabel={requiredMark}
                  error={getError("country")}
                >
                  <Input
                    id="location-country"
                    disabled={readOnly}
                    value={values.country ?? ""}
                    onChange={(e) =>
                      form.setField(
                        "country",
                        e.target.value.trim() ? e.target.value : undefined,
                      )
                    }
                  />
                </Field>
              </div>
            </div>

            <div className="space-y-4 border-t border-border pt-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {tSite("location.mapsGroup")}
              </h2>

              <Field
                label={tSite("location.googleMapsUrl")}
                htmlFor="location-google-maps-url"
                fieldPath="googleMapsUrl"
                error={getError("googleMapsUrl")}
              >
                <Input
                  id="location-google-maps-url"
                  type="url"
                  disabled={readOnly}
                  value={values.googleMapsUrl ?? ""}
                  placeholder="https://maps.google.com/..."
                  onChange={(e) =>
                    form.setField(
                      "googleMapsUrl",
                      e.target.value.trim() ? e.target.value.trim() : undefined,
                    )
                  }
                />
              </Field>

              <Field
                label={tSite("location.mapEmbedUrl")}
                htmlFor="location-map-embed-url"
                fieldPath="mapEmbedUrl"
                hint={tSite("location.mapEmbedHint")}
                error={getError("mapEmbedUrl")}
              >
                <Input
                  id="location-map-embed-url"
                  type="url"
                  disabled={readOnly}
                  value={values.mapEmbedUrl ?? ""}
                  placeholder="https://www.google.com/maps/embed?..."
                  onChange={(e) =>
                    form.setField(
                      "mapEmbedUrl",
                      e.target.value.trim() ? e.target.value.trim() : undefined,
                    )
                  }
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label={tSite("location.lat")}
                  htmlFor="location-lat"
                  fieldPath="lat"
                  error={getError("lat")}
                >
                  <Input
                    id="location-lat"
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    disabled={readOnly}
                    value={latDraft}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setLatDraft(raw);
                      form.setField("lat", normalizeOptionalNumber(raw));
                    }}
                  />
                </Field>

                <Field
                  label={tSite("location.lon")}
                  htmlFor="location-lon"
                  fieldPath="lon"
                  error={getError("lon")}
                >
                  <Input
                    id="location-lon"
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    disabled={readOnly}
                    value={lonDraft}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setLonDraft(raw);
                      form.setField("lon", normalizeOptionalNumber(raw));
                    }}
                  />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                {tSite("location.coordinatesHint")}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <FixedIdentityMeta machineName={machineName} appearsOn={appearsOn} />
          </div>
        </div>
      )}
    />
  );
}
