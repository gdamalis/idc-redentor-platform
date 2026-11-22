"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type {
  ContentStatus,
  EventBannerFields,
  EventInfoFields,
  Locale,
  Localized,
} from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import type { SerializedMediaDoc } from "@src/app/[locale]/(app)/content/media/actions";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Textarea } from "@src/components/ui/textarea";
import { EntryEditor } from "@src/components/content/entry-editor";
import type { EntryEditorPermissions } from "@src/components/content/entry-editor-types";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { MediaField } from "@src/components/content/media";
import { createSiteFieldErrorMapper } from "@src/lib/content/site/field-errors";
import { countEventBannerMissingEn } from "@src/lib/content/site/missing-en";
import type { SharedLocationSummary } from "@src/service/content/site/loaders";
import { FixedIdentityMeta } from "./fixed-identity-meta";
import { SharedLocationCard } from "./shared-location-card";

export interface EventBannerEditorProps {
  readonly initialDoc: SerializedContentDoc<EventBannerFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: EventBannerFields;
  readonly initialMediaById: Readonly<Record<string, SerializedMediaDoc>>;
  readonly sharedLocation: SharedLocationSummary | null;
  readonly backHref: string;
  readonly backLabel: string;
  readonly friendlyTitle: string;
  readonly machineName: string;
  readonly appearsOn: readonly string[];
  readonly liveUrl?: string;
  readonly permissions: EntryEditorPermissions;
  readonly canManageMedia: boolean;
  readonly isTrialMode: boolean;
  readonly isPublishEmailsEnabled: boolean;
}

const EXCLUDE_IMMUTABLE: readonly (keyof EventBannerFields)[] = ["machineName"];

function updateLocalizedString(
  current: Localized<string> | undefined,
  locale: Locale,
  nextValue: string,
): Localized<string> {
  return {
    "es-AR": locale === "es-AR" ? nextValue : (current?.["es-AR"] ?? ""),
    ...(locale === "en-US"
      ? { "en-US": nextValue }
      : current?.["en-US"] !== undefined
        ? { "en-US": current["en-US"] }
        : {}),
  };
}

/**
 * Direct-to-editor singleton for `event_banners` (`event-sunday-meetings`).
 * Location comes from the single shared `location` global (`SharedLocationCard`).
 */
export function EventBannerEditor({
  initialDoc,
  initialStatus,
  initialValues,
  initialMediaById,
  sharedLocation,
  backHref,
  backLabel,
  friendlyTitle,
  machineName,
  appearsOn,
  liveUrl,
  permissions,
  canManageMedia,
  isTrialMode,
  isPublishEmailsEnabled,
}: EventBannerEditorProps) {
  const tContent = useTranslations("content");
  const tSite = useTranslations("contentSite");

  const customFieldErrorMap = React.useMemo(
    () =>
      createSiteFieldErrorMapper(
        (key, values) => tSite(key as never, values as never),
        "eventBanner",
      ),
    [tSite],
  );

  const requiredMark = tContent("errors.requiredMark");

  return (
    <EntryEditor<EventBannerFields>
      collection="event_banners"
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
      countMissingEn={countEventBannerMissingEn}
      customFieldErrorMap={customFieldErrorMap}
      renderLocalizedFields={({ activeLocale, values, form, readOnly, getError }) => {
        const ev = values.event ?? {};
        const nameEs = ev.name?.["es-AR"] ?? "";
        const nameVal = ev.name?.[activeLocale] ?? "";
        const dayEs = ev.dayOfWeek?.["es-AR"] ?? "";
        const dayVal = ev.dayOfWeek?.[activeLocale] ?? "";
        const noteEs = ev.note?.["es-AR"] ?? "";
        const noteVal = ev.note?.[activeLocale] ?? "";

        const updateEvent = (patch: Partial<EventInfoFields>) => {
          form.setField("event", { ...ev, ...patch });
        };

        return (
          <div className="space-y-5">
            <Field
              label={tSite("eventBanner.name")}
              htmlFor={`event-name-${activeLocale}`}
              fieldPath={`event.name.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={requiredMark}
              error={
                getError(`event.name.${activeLocale}`) ?? getError("event.name")
              }
            >
              <Input
                id={`event-name-${activeLocale}`}
                disabled={readOnly}
                value={nameVal}
                placeholder={activeLocale === "en-US" ? nameEs : undefined}
                onChange={(e) =>
                  updateEvent({
                    name: updateLocalizedString(
                      ev.name,
                      activeLocale,
                      e.target.value,
                    ),
                  })
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={nameEs || undefined}
                isEnglishEmpty={!nameVal.trim()}
                readOnly={readOnly}
                onCopyFromSpanish={() =>
                  updateEvent({
                    name: { "es-AR": nameEs, "en-US": nameEs },
                  })
                }
              />
            </Field>

            <Field
              label={tSite("eventBanner.dayOfWeek")}
              htmlFor={`event-day-${activeLocale}`}
              fieldPath={`event.dayOfWeek.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={requiredMark}
              error={
                getError(`event.dayOfWeek.${activeLocale}`) ??
                getError("event.dayOfWeek")
              }
            >
              <Input
                id={`event-day-${activeLocale}`}
                disabled={readOnly}
                value={dayVal}
                placeholder={
                  activeLocale === "en-US"
                    ? dayEs || tSite("eventBanner.dayOfWeekPlaceholder")
                    : tSite("eventBanner.dayOfWeekPlaceholder")
                }
                onChange={(e) =>
                  updateEvent({
                    dayOfWeek: updateLocalizedString(
                      ev.dayOfWeek,
                      activeLocale,
                      e.target.value,
                    ),
                  })
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={dayEs || undefined}
                isEnglishEmpty={!dayVal.trim()}
                readOnly={readOnly}
                onCopyFromSpanish={() =>
                  updateEvent({
                    dayOfWeek: { "es-AR": dayEs, "en-US": dayEs },
                  })
                }
              />
            </Field>

            <Field
              label={tSite("eventBanner.note")}
              htmlFor={`event-note-${activeLocale}`}
              fieldPath={`event.note.${activeLocale}`}
              error={
                getError(`event.note.${activeLocale}`) ?? getError("event.note")
              }
            >
              <Textarea
                id={`event-note-${activeLocale}`}
                disabled={readOnly}
                value={noteVal}
                placeholder={activeLocale === "en-US" ? noteEs : undefined}
                onChange={(e) =>
                  updateEvent({
                    note: updateLocalizedString(
                      ev.note,
                      activeLocale,
                      e.target.value,
                    ),
                  })
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={noteEs || undefined}
                isEnglishEmpty={!noteVal.trim()}
                readOnly={readOnly}
                onCopyFromSpanish={() =>
                  updateEvent({
                    note: { "es-AR": noteEs, "en-US": noteEs },
                  })
                }
              />
            </Field>
          </div>
        );
      }}
      renderGeneralFields={({ values, form, readOnly, getError }) => {
        const ev = values.event ?? {};
        const updateEvent = (patch: Partial<EventInfoFields>) => {
          form.setField("event", { ...ev, ...patch });
        };

        return (
          <div className="space-y-4">
            <FixedIdentityMeta machineName={machineName} appearsOn={appearsOn} />

            <Field
              label={tSite("eventBanner.time")}
              htmlFor="event-time"
              fieldPath="event.time"
              requiredToPublish
              requiredMarkLabel={requiredMark}
              hint={tSite("eventBanner.timeHint")}
              error={getError("event.time")}
            >
              <Input
                id="event-time"
                disabled={readOnly}
                value={ev.time ?? ""}
                placeholder={tSite("eventBanner.timePlaceholder")}
                onChange={(e) =>
                  updateEvent({
                    time: e.target.value.trim() ? e.target.value : undefined,
                  })
                }
              />
            </Field>

            <Field
              label={tSite("eventBanner.date")}
              htmlFor="event-date"
              fieldPath="event.date"
              hint={tSite("eventBanner.dateHint")}
              error={getError("event.date")}
            >
              <Input
                id="event-date"
                type="date"
                disabled={readOnly}
                value={ev.date ? ev.date.slice(0, 10) : ""}
                onChange={(e) => {
                  const trimmed = e.target.value.trim();
                  updateEvent({ date: trimmed || undefined });
                }}
              />
            </Field>

            <Field
              label={tSite("eventBanner.image")}
              fieldPath="image"
              requiredToPublish
              requiredMarkLabel={requiredMark}
              error={getError("image")}
            >
              <MediaField
                accept="image"
                value={values.image}
                initialDoc={
                  values.image ? (initialMediaById[values.image] ?? null) : null
                }
                canUpload={canManageMedia}
                readOnly={readOnly}
                onChange={(id) => form.setField("image", id)}
              />
            </Field>

            <SharedLocationCard location={sharedLocation} />
          </div>
        );
      }}
    />
  );
}
