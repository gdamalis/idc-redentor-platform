"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  isEmptyValue,
  type ContentStatus,
  type Locale,
  type Localized,
  type RichTextDoc,
  type SectionFields,
} from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import type { SerializedMediaDoc } from "@src/app/[locale]/(app)/content/media/actions";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { EntryEditor } from "@src/components/content/entry-editor";
import type { EntryEditorPermissions } from "@src/components/content/entry-editor-types";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { MediaField, MediaListField } from "@src/components/content/media";
import { RichTextEditor } from "@src/components/content/rich-text/rich-text-editor";
import {
  createSiteFieldErrorMapper,
  findRichTextFieldError,
} from "@src/lib/content/site/field-errors";
import { countSectionMissingEn } from "@src/lib/content/site/missing-en";
import {
  EMPTY_RICH_TEXT_DOC,
  extractRichTextPlainText,
  normalizeSectionDraft,
  toPlainRichTextDoc,
} from "@src/lib/content/site/normalize";
import { getSectionLayoutFieldConfig } from "@src/lib/content/site/section-layout";
import { FixedIdentityMeta } from "./fixed-identity-meta";
import { createNormalizedSiteActions } from "./normalized-actions";
import { SitePageSelect } from "./site-page-select";

export interface SectionEditorProps {
  readonly initialDoc: SerializedContentDoc<SectionFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: SectionFields;
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

const EXCLUDE_IMMUTABLE: readonly (keyof SectionFields)[] = [
  "machineName",
  "layout",
];

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

function updateLocalizedRichText(
  current: Localized<RichTextDoc> | undefined,
  locale: Locale,
  nextDoc: RichTextDoc,
): Localized<RichTextDoc> {
  const plain = toPlainRichTextDoc(nextDoc);
  return {
    "es-AR":
      locale === "es-AR" ? plain : (current?.["es-AR"] ?? EMPTY_RICH_TEXT_DOC),
    ...(locale === "en-US"
      ? { "en-US": plain }
      : current?.["en-US"] !== undefined
        ? { "en-US": current["en-US"] }
        : {}),
  };
}

/**
 * Layout-keyed fixed section editor (`hero`, `cta`, `textBlock` — no `duplex`).
 * `machineName` and `layout` are read-only and excluded from patches (`ICR-198` AC2).
 */
export function SectionEditor({
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
}: SectionEditorProps) {
  const tContent = useTranslations("content");
  const tSite = useTranslations("contentSite");

  const customFieldErrorMap = React.useMemo(
    () =>
      createSiteFieldErrorMapper(
        (key, values) => tSite(key as never, values as never),
        "section",
      ),
    [tSite],
  );

  const actionOverrides = React.useMemo(
    () => createNormalizedSiteActions(initialValues, normalizeSectionDraft),
    [initialValues],
  );

  const requiredMark = tContent("errors.requiredMark");

  return (
    <EntryEditor<SectionFields>
      collection="sections"
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
      actionOverrides={actionOverrides}
      countMissingEn={countSectionMissingEn}
      customFieldErrorMap={customFieldErrorMap}
      renderLocalizedFields={({ activeLocale, values, form, readOnly, getError }) => {
        const cfg = getSectionLayoutFieldConfig(values.layout, values);
        const headlineEs = values.headline?.["es-AR"] ?? "";
        const headlineVal = values.headline?.[activeLocale] ?? "";
        const subHeadlineEs = values.subHeadline?.["es-AR"] ?? "";
        const subHeadlineVal = values.subHeadline?.[activeLocale] ?? "";
        const ctaEs = values.ctaText?.["es-AR"] ?? "";
        const ctaVal = values.ctaText?.[activeLocale] ?? "";
        const bodyEsDoc = values.body?.["es-AR"];
        const bodyActiveDoc = values.body?.[activeLocale];
        const bodyEsPlain = extractRichTextPlainText(bodyEsDoc);

        return (
          <div className="space-y-5">
            {cfg.showHeadline && (
              <Field
                label={tSite("sections.headline")}
                htmlFor={`section-headline-${activeLocale}`}
                fieldPath={`headline.${activeLocale}`}
                requiredToPublish={
                  cfg.requireHeadlineEs && activeLocale === "es-AR"
                }
                requiredMarkLabel={requiredMark}
                error={
                  getError(`headline.${activeLocale}`) ?? getError("headline")
                }
              >
                <Input
                  id={`section-headline-${activeLocale}`}
                  disabled={readOnly}
                  value={headlineVal}
                  placeholder={activeLocale === "en-US" ? headlineEs : undefined}
                  onChange={(e) =>
                    form.setField(
                      "headline",
                      updateLocalizedString(
                        values.headline,
                        activeLocale,
                        e.target.value,
                      ),
                    )
                  }
                />
                <LocalizedFieldReference
                  activeLocale={activeLocale}
                  spanishOriginal={headlineEs || undefined}
                  isEnglishEmpty={!headlineVal.trim()}
                  readOnly={readOnly}
                  onCopyFromSpanish={() =>
                    form.setField("headline", {
                      "es-AR": headlineEs,
                      "en-US": headlineEs,
                    })
                  }
                />
              </Field>
            )}

            {cfg.showSubHeadline && (
              <Field
                label={tSite("sections.subHeadline")}
                htmlFor={`section-subheadline-${activeLocale}`}
                fieldPath={`subHeadline.${activeLocale}`}
                error={
                  getError(`subHeadline.${activeLocale}`) ??
                  getError("subHeadline")
                }
              >
                <Input
                  id={`section-subheadline-${activeLocale}`}
                  disabled={readOnly}
                  value={subHeadlineVal}
                  placeholder={
                    activeLocale === "en-US" ? subHeadlineEs : undefined
                  }
                  onChange={(e) =>
                    form.setField(
                      "subHeadline",
                      updateLocalizedString(
                        values.subHeadline,
                        activeLocale,
                        e.target.value,
                      ),
                    )
                  }
                />
                <LocalizedFieldReference
                  activeLocale={activeLocale}
                  spanishOriginal={subHeadlineEs || undefined}
                  isEnglishEmpty={!subHeadlineVal.trim()}
                  readOnly={readOnly}
                  onCopyFromSpanish={() =>
                    form.setField("subHeadline", {
                      "es-AR": subHeadlineEs,
                      "en-US": subHeadlineEs,
                    })
                  }
                />
              </Field>
            )}

            {cfg.showBody && (
              <Field
                label={tSite("sections.body")}
                fieldPath={`body.${activeLocale}`}
                requiredToPublish={cfg.requireBodyEs && activeLocale === "es-AR"}
                requiredMarkLabel={requiredMark}
                hint={tSite("sections.bodyHint")}
                error={findRichTextFieldError(
                  getError,
                  form.fieldErrors,
                  `body.${activeLocale}`,
                  "body",
                )}
              >
                <RichTextEditor
                  key={`section-body-${activeLocale}`}
                  profile="inline"
                  value={bodyActiveDoc}
                  readOnly={readOnly}
                  onLossyLoad={(lossy) =>
                    form.markLossyField(`body.${activeLocale}`, lossy)
                  }
                  onChange={(nextDoc) =>
                    form.setField(
                      "body",
                      updateLocalizedRichText(values.body, activeLocale, nextDoc),
                    )
                  }
                />
                <LocalizedFieldReference
                  activeLocale={activeLocale}
                  spanishOriginal={bodyEsPlain || undefined}
                  isEnglishEmpty={isEmptyValue(bodyActiveDoc)}
                  collapsible
                  readOnly={readOnly}
                  onCopyFromSpanish={() => {
                    if (!bodyEsDoc) return;
                    form.setField("body", {
                      "es-AR": bodyEsDoc,
                      "en-US": structuredClone(bodyEsDoc),
                    });
                  }}
                />
              </Field>
            )}

            {cfg.showCtaText && (
              <Field
                label={tSite("sections.ctaText")}
                htmlFor={`section-cta-${activeLocale}`}
                fieldPath={`ctaText.${activeLocale}`}
                requiredToPublish={
                  cfg.requireCtaTextEs && activeLocale === "es-AR"
                }
                requiredMarkLabel={requiredMark}
                error={
                  getError(`ctaText.${activeLocale}`) ?? getError("ctaText")
                }
              >
                <Input
                  id={`section-cta-${activeLocale}`}
                  disabled={readOnly}
                  value={ctaVal}
                  placeholder={activeLocale === "en-US" ? ctaEs : undefined}
                  onChange={(e) =>
                    form.setField(
                      "ctaText",
                      updateLocalizedString(
                        values.ctaText,
                        activeLocale,
                        e.target.value,
                      ),
                    )
                  }
                />
                <LocalizedFieldReference
                  activeLocale={activeLocale}
                  spanishOriginal={ctaEs || undefined}
                  isEnglishEmpty={!ctaVal.trim()}
                  readOnly={readOnly}
                  onCopyFromSpanish={() =>
                    form.setField("ctaText", {
                      "es-AR": ctaEs,
                      "en-US": ctaEs,
                    })
                  }
                />
              </Field>
            )}
          </div>
        );
      }}
      renderGeneralFields={({ values, form, readOnly, getError }) => {
        const cfg = getSectionLayoutFieldConfig(values.layout, values);
        const initialImageDocs = (values.images ?? [])
          .map((id) => initialMediaById[id])
          .filter((doc): doc is SerializedMediaDoc => doc !== undefined);

        return (
          <div className="space-y-4">
            <FixedIdentityMeta
              machineName={machineName}
              layout={values.layout}
              appearsOn={appearsOn}
            />

            {cfg.showTargetPage && (
              <Field
                label={tSite("sections.targetPage")}
                htmlFor="section-target-page"
                fieldPath="targetPage"
                requiredToPublish={cfg.requireTargetPage}
                requiredMarkLabel={requiredMark}
                error={getError("targetPage")}
              >
                <SitePageSelect
                  id="section-target-page"
                  value={values.targetPage}
                  allowEmpty={!cfg.requireTargetPage}
                  disabled={readOnly}
                  onChange={(slug) => form.setField("targetPage", slug)}
                />
              </Field>
            )}

            {cfg.showUrlParameters && (
              <Field
                label={tSite("sections.urlParameters")}
                htmlFor="section-url-params"
                fieldPath="urlParameters"
                hint={tSite("sections.urlParametersHint")}
                error={getError("urlParameters")}
              >
                <Input
                  id="section-url-params"
                  disabled={readOnly}
                  value={values.urlParameters ?? ""}
                  onChange={(e) => {
                    const next = e.target.value;
                    form.setField(
                      "urlParameters",
                      next.trim().length > 0 ? next : undefined,
                    );
                  }}
                />
              </Field>
            )}

            {cfg.showSingleImage && (
              <Field
                label={tSite("sections.image")}
                fieldPath="image"
                requiredToPublish={cfg.requireSingleImage}
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
            )}

            {cfg.showImageList && (
              <Field
                label={tSite("sections.images")}
                fieldPath="images"
                hint={tSite("sections.imagesHint")}
                error={getError("images")}
              >
                <MediaListField
                  accept="image"
                  values={values.images ?? []}
                  initialDocs={initialImageDocs}
                  canUpload={canManageMedia}
                  readOnly={readOnly}
                  onChange={(ids) =>
                    form.setField("images", ids.length > 0 ? ids : undefined)
                  }
                />
              </Field>
            )}
          </div>
        );
      }}
    />
  );
}
