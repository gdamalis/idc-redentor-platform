"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type {
  ContentStatus,
  Locale,
  Localized,
  SeoEntryFields,
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
import { countSeoEntryMissingEn } from "@src/lib/content/site/missing-en";
import { FixedIdentityMeta } from "./fixed-identity-meta";
import { LocalizedStringListField } from "./localized-string-list-field";

export interface SeoEntryEditorProps {
  readonly initialDoc: SerializedContentDoc<SeoEntryFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: SeoEntryFields;
  readonly initialMediaById: Readonly<Record<string, SerializedMediaDoc>>;
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

const EXCLUDE_IMMUTABLE: readonly (keyof SeoEntryFields)[] = ["machineName"];
const RECOMMENDED_TITLE_MAX = 60;
const RECOMMENDED_DESC_MAX = 160;

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
 * Page SEO editor (`seo_entries`; `seo-predicas` excluded by registry).
 * Shows live advisory character counts on title (60) and description (160)
 * that never block saving or publishing (`F-editor-ux-decisions.md` §2.5).
 */
export function SeoEntryEditor({
  initialDoc,
  initialStatus,
  initialValues,
  initialMediaById,
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
}: SeoEntryEditorProps) {
  const tContent = useTranslations("content");
  const tSite = useTranslations("contentSite");

  const customFieldErrorMap = React.useMemo(
    () =>
      createSiteFieldErrorMapper(
        (key, values) => tSite(key as never, values as never),
        "seoEntry",
      ),
    [tSite],
  );

  const requiredMark = tContent("errors.requiredMark");

  return (
    <EntryEditor<SeoEntryFields>
      collection="seo_entries"
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
      countMissingEn={countSeoEntryMissingEn}
      customFieldErrorMap={customFieldErrorMap}
      renderLocalizedFields={({ activeLocale, values, form, readOnly, getError }) => {
        const titleEs = values.title?.["es-AR"] ?? "";
        const titleVal = values.title?.[activeLocale] ?? "";
        const descEs = values.description?.["es-AR"] ?? "";
        const descVal = values.description?.[activeLocale] ?? "";
        const siteNameEs = values.siteName?.["es-AR"] ?? "";
        const siteNameVal = values.siteName?.[activeLocale] ?? "";

        const titleLen = titleVal.length;
        const descLen = descVal.length;
        const titleOver = titleLen > RECOMMENDED_TITLE_MAX;
        const descOver = descLen > RECOMMENDED_DESC_MAX;

        return (
          <div className="space-y-5">
            <Field
              label={tSite("seo.title")}
              htmlFor={`seo-title-${activeLocale}`}
              fieldPath={`title.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={requiredMark}
              hint={
                <span
                  data-testid="seo-title-char-count"
                  className={titleOver ? "font-medium text-amber-600 dark:text-amber-400" : undefined}
                >
                  {tSite(titleOver ? "seo.charCountOver" : "seo.charCount", {
                    count: titleLen,
                    recommended: RECOMMENDED_TITLE_MAX,
                  })}
                </span>
              }
              error={getError(`title.${activeLocale}`) ?? getError("title")}
            >
              <Input
                id={`seo-title-${activeLocale}`}
                disabled={readOnly}
                value={titleVal}
                placeholder={activeLocale === "en-US" ? titleEs : undefined}
                onChange={(e) =>
                  form.setField(
                    "title",
                    updateLocalizedString(
                      values.title,
                      activeLocale,
                      e.target.value,
                    ),
                  )
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={titleEs || undefined}
                isEnglishEmpty={!titleVal.trim()}
                readOnly={readOnly}
                onCopyFromSpanish={() =>
                  form.setField("title", {
                    "es-AR": titleEs,
                    "en-US": titleEs,
                  })
                }
              />
            </Field>

            <Field
              label={tSite("seo.description")}
              htmlFor={`seo-description-${activeLocale}`}
              fieldPath={`description.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={requiredMark}
              hint={
                <span
                  data-testid="seo-description-char-count"
                  className={descOver ? "font-medium text-amber-600 dark:text-amber-400" : undefined}
                >
                  {tSite(descOver ? "seo.charCountOver" : "seo.charCount", {
                    count: descLen,
                    recommended: RECOMMENDED_DESC_MAX,
                  })}
                </span>
              }
              error={
                getError(`description.${activeLocale}`) ??
                getError("description")
              }
            >
              <Textarea
                id={`seo-description-${activeLocale}`}
                disabled={readOnly}
                value={descVal}
                placeholder={activeLocale === "en-US" ? descEs : undefined}
                onChange={(e) =>
                  form.setField(
                    "description",
                    updateLocalizedString(
                      values.description,
                      activeLocale,
                      e.target.value,
                    ),
                  )
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={descEs || undefined}
                isEnglishEmpty={!descVal.trim()}
                readOnly={readOnly}
                onCopyFromSpanish={() =>
                  form.setField("description", {
                    "es-AR": descEs,
                    "en-US": descEs,
                  })
                }
              />
            </Field>

            <Field
              label={tSite("seo.keywords")}
              fieldPath={`keywords.${activeLocale}`}
              error={
                getError(`keywords.${activeLocale}`) ?? getError("keywords")
              }
            >
              <LocalizedStringListField
                activeLocale={activeLocale}
                value={values.keywords}
                addLabel={tSite("seo.addKeyword")}
                placeholder={tSite("seo.keywordPlaceholder")}
                emptyMessage={tSite("seo.emptyKeywords")}
                readOnly={readOnly}
                idPrefix="seo-keyword"
                onChange={(next) => form.setField("keywords", next)}
              />
            </Field>

            <Field
              label={tSite("seo.siteName")}
              htmlFor={`seo-sitename-${activeLocale}`}
              fieldPath={`siteName.${activeLocale}`}
              error={
                getError(`siteName.${activeLocale}`) ?? getError("siteName")
              }
            >
              <Input
                id={`seo-sitename-${activeLocale}`}
                disabled={readOnly}
                value={siteNameVal}
                placeholder={activeLocale === "en-US" ? siteNameEs : undefined}
                onChange={(e) =>
                  form.setField(
                    "siteName",
                    updateLocalizedString(
                      values.siteName,
                      activeLocale,
                      e.target.value,
                    ),
                  )
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={siteNameEs || undefined}
                isEnglishEmpty={!siteNameVal.trim()}
                readOnly={readOnly}
                onCopyFromSpanish={() =>
                  form.setField("siteName", {
                    "es-AR": siteNameEs,
                    "en-US": siteNameEs,
                  })
                }
              />
            </Field>
          </div>
        );
      }}
      renderGeneralFields={({ values, form, readOnly, getError }) => (
        <div className="space-y-4">
          <FixedIdentityMeta machineName={machineName} appearsOn={appearsOn} />

          <Field
            label={tSite("seo.image")}
            fieldPath="imageId"
            hint={tSite("seo.imageHint")}
            error={getError("imageId")}
          >
            <MediaField
              accept="image"
              value={values.imageId}
              initialDoc={
                values.imageId
                  ? (initialMediaById[values.imageId] ?? null)
                  : null
              }
              canUpload={canManageMedia}
              readOnly={readOnly}
              onChange={(id) => form.setField("imageId", id)}
            />
          </Field>

          <Field
            label={tSite("seo.type")}
            htmlFor="seo-type"
            fieldPath="type"
            hint={tSite("seo.typeHint")}
            error={getError("type")}
          >
            <Input
              id="seo-type"
              disabled={readOnly}
              value={values.type ?? ""}
              placeholder={tSite("seo.typePlaceholder")}
              onChange={(e) => {
                const next = e.target.value;
                form.setField("type", next.trim() ? next : undefined);
              }}
            />
          </Field>
        </div>
      )}
    />
  );
}
