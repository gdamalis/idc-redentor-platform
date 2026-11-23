"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type {
  ContentStatus,
  Locale,
  Localized,
  SingleEmailFormFields,
} from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Textarea } from "@src/components/ui/textarea";
import { EntryEditor } from "@src/components/content/entry-editor";
import type { EntryEditorPermissions } from "@src/components/content/entry-editor-types";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { createSiteFieldErrorMapper } from "@src/lib/content/site/field-errors";
import { countSingleEmailFormMissingEn } from "@src/lib/content/site/missing-en";
import { normalizeSingleEmailFormDraft } from "@src/lib/content/site/normalize";
import { FixedIdentityMeta } from "./fixed-identity-meta";
import { createNormalizedSiteActions } from "./normalized-actions";

export interface SingleEmailFormEditorProps {
  readonly initialDoc: SerializedContentDoc<SingleEmailFormFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: SingleEmailFormFields;
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

const EXCLUDE_IMMUTABLE: readonly (keyof SingleEmailFormFields)[] = [
  "kind",
  "machineName",
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

/**
 * Subscribe form global editor (`globals` / `kind: "singleEmailForm"`).
 */
export function SingleEmailFormEditor({
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
}: SingleEmailFormEditorProps) {
  const tContent = useTranslations("content");
  const tSite = useTranslations("contentSite");

  const customFieldErrorMap = React.useMemo(
    () =>
      createSiteFieldErrorMapper(
        (key, values) => tSite(key as never, values as never),
        "singleEmailForm",
      ),
    [tSite],
  );

  const actionOverrides = React.useMemo(
    () =>
      createNormalizedSiteActions(
        initialValues,
        normalizeSingleEmailFormDraft,
      ),
    [initialValues],
  );

  const requiredMark = tContent("errors.requiredMark");

  return (
    <EntryEditor<SingleEmailFormFields>
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
      actionOverrides={actionOverrides}
      countMissingEn={countSingleEmailFormMissingEn}
      customFieldErrorMap={customFieldErrorMap}
      renderLocalizedFields={({ activeLocale, values, form, readOnly, getError }) => {
        const titleEs = values.title?.["es-AR"] ?? "";
        const titleVal = values.title?.[activeLocale] ?? "";
        const descEs = values.shortDescription?.["es-AR"] ?? "";
        const descVal = values.shortDescription?.[activeLocale] ?? "";
        const ctaEs = values.ctaText?.["es-AR"] ?? "";
        const ctaVal = values.ctaText?.[activeLocale] ?? "";
        const placeholderEs = values.inputPlaceholder?.["es-AR"] ?? "";
        const placeholderVal = values.inputPlaceholder?.[activeLocale] ?? "";
        const successEs = values.successMessage?.["es-AR"] ?? "";
        const successVal = values.successMessage?.[activeLocale] ?? "";

        return (
          <div className="space-y-5">
            <Field
              label={tSite("subscribeForm.title")}
              htmlFor={`sub-title-${activeLocale}`}
              fieldPath={`title.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={requiredMark}
              error={getError(`title.${activeLocale}`) ?? getError("title")}
            >
              <Input
                id={`sub-title-${activeLocale}`}
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
                  form.setField("title", { "es-AR": titleEs, "en-US": titleEs })
                }
              />
            </Field>

            <Field
              label={tSite("subscribeForm.shortDescription")}
              htmlFor={`sub-desc-${activeLocale}`}
              fieldPath={`shortDescription.${activeLocale}`}
              error={
                getError(`shortDescription.${activeLocale}`) ??
                getError("shortDescription")
              }
            >
              <Textarea
                id={`sub-desc-${activeLocale}`}
                disabled={readOnly}
                value={descVal}
                placeholder={activeLocale === "en-US" ? descEs : undefined}
                onChange={(e) =>
                  form.setField(
                    "shortDescription",
                    updateLocalizedString(
                      values.shortDescription,
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
                  form.setField("shortDescription", {
                    "es-AR": descEs,
                    "en-US": descEs,
                  })
                }
              />
            </Field>

            <Field
              label={tSite("subscribeForm.ctaText")}
              htmlFor={`sub-cta-${activeLocale}`}
              fieldPath={`ctaText.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={requiredMark}
              error={getError(`ctaText.${activeLocale}`) ?? getError("ctaText")}
            >
              <Input
                id={`sub-cta-${activeLocale}`}
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
                  form.setField("ctaText", { "es-AR": ctaEs, "en-US": ctaEs })
                }
              />
            </Field>

            <Field
              label={tSite("subscribeForm.inputPlaceholder")}
              htmlFor={`sub-placeholder-${activeLocale}`}
              fieldPath={`inputPlaceholder.${activeLocale}`}
              error={
                getError(`inputPlaceholder.${activeLocale}`) ??
                getError("inputPlaceholder")
              }
            >
              <Input
                id={`sub-placeholder-${activeLocale}`}
                disabled={readOnly}
                value={placeholderVal}
                placeholder={
                  activeLocale === "en-US" ? placeholderEs : undefined
                }
                onChange={(e) =>
                  form.setField(
                    "inputPlaceholder",
                    updateLocalizedString(
                      values.inputPlaceholder,
                      activeLocale,
                      e.target.value,
                    ),
                  )
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={placeholderEs || undefined}
                isEnglishEmpty={!placeholderVal.trim()}
                readOnly={readOnly}
                onCopyFromSpanish={() =>
                  form.setField("inputPlaceholder", {
                    "es-AR": placeholderEs,
                    "en-US": placeholderEs,
                  })
                }
              />
            </Field>

            <Field
              label={tSite("subscribeForm.successMessage")}
              htmlFor={`sub-success-${activeLocale}`}
              fieldPath={`successMessage.${activeLocale}`}
              error={
                getError(`successMessage.${activeLocale}`) ??
                getError("successMessage")
              }
            >
              <Textarea
                id={`sub-success-${activeLocale}`}
                disabled={readOnly}
                value={successVal}
                placeholder={activeLocale === "en-US" ? successEs : undefined}
                onChange={(e) =>
                  form.setField(
                    "successMessage",
                    updateLocalizedString(
                      values.successMessage,
                      activeLocale,
                      e.target.value,
                    ),
                  )
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={successEs || undefined}
                isEnglishEmpty={!successVal.trim()}
                readOnly={readOnly}
                onCopyFromSpanish={() =>
                  form.setField("successMessage", {
                    "es-AR": successEs,
                    "en-US": successEs,
                  })
                }
              />
            </Field>
          </div>
        );
      }}
      renderGeneralFields={() => (
        <FixedIdentityMeta machineName={machineName} appearsOn={appearsOn} />
      )}
    />
  );
}
