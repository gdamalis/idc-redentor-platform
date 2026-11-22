"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  isEmptyValue,
  type ContactFormFieldItem,
  type ContactFormFields,
  type ContentStatus,
  type Locale,
  type Localized,
  type RichTextDoc,
} from "@idcr/content";
import type {
  BibleVersePickerItem,
  SerializedContentDoc,
} from "@src/app/[locale]/(app)/content/actions";
import type { SerializedMediaDoc } from "@src/app/[locale]/(app)/content/media/actions";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Notice } from "@src/components/ui/notice";
import { Textarea } from "@src/components/ui/textarea";
import { EntryEditor } from "@src/components/content/entry-editor";
import type { EntryEditorPermissions } from "@src/components/content/entry-editor-types";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { MediaField } from "@src/components/content/media";
import { RichTextEditor } from "@src/components/content/rich-text/rich-text-editor";
import {
  createSiteFieldErrorMapper,
  findRichTextFieldError,
} from "@src/lib/content/site/field-errors";
import { countContactFormMissingEn } from "@src/lib/content/site/missing-en";
import {
  EMPTY_RICH_TEXT_DOC,
  extractRichTextPlainText,
  normalizeContactFormDraft,
  toPlainRichTextDoc,
} from "@src/lib/content/site/normalize";
import { FixedIdentityMeta } from "./fixed-identity-meta";
import { LocalizedStringListField } from "./localized-string-list-field";
import { createNormalizedSiteActions } from "./normalized-actions";
import { SingleVerseField } from "./single-verse-field";

export interface ContactFormEditorProps {
  readonly initialDoc: SerializedContentDoc<ContactFormFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: ContactFormFields;
  readonly initialMediaById: Readonly<Record<string, SerializedMediaDoc>>;
  readonly initialVersesById: Readonly<Record<string, BibleVersePickerItem>>;
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

const EXCLUDE_IMMUTABLE: readonly (keyof ContactFormFields)[] = [
  "kind",
  "machineName",
];

const KNOWN_FIELD_TYPES = new Set([
  "Short text",
  "Email",
  "Dropdown",
  "Long text",
]);

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
 * Contact form global editor (`globals` / `kind: "contactForm"`):
 * - Required `bibleVerseId` via `SingleVerseField` (`VersePicker`).
 * - `agreementNote` uses `inlineLink` rich-text profile (paragraphs, bold, italic, links).
 * - `fields[]` are strictly structure-locked: `inputId`, `type`, `required`,
 *   count, and order are read-only and never mutated; only `name`, `placeholder`,
 *   and dropdown `values` are editable (`ICR-198` AC3, Edge Case 7).
 */
export function ContactFormEditor({
  initialDoc,
  initialStatus,
  initialValues,
  initialMediaById,
  initialVersesById,
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
}: ContactFormEditorProps) {
  const tContent = useTranslations("content");
  const tSite = useTranslations("contentSite");

  const [versesById, setVersesById] = React.useState<
    Readonly<Record<string, BibleVersePickerItem>>
  >(initialVersesById);

  const customFieldErrorMap = React.useMemo(
    () =>
      createSiteFieldErrorMapper(
        (key, values) => tSite(key as never, values as never),
        "contactForm",
      ),
    [tSite],
  );

  const actionOverrides = React.useMemo(
    () =>
      createNormalizedSiteActions(initialValues, (merged) =>
        normalizeContactFormDraft(merged, initialDoc.draft.fields),
      ),
    [initialDoc.draft.fields, initialValues],
  );

  const requiredMark = tContent("errors.requiredMark");

  return (
    <EntryEditor<ContactFormFields>
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
      countMissingEn={countContactFormMissingEn}
      customFieldErrorMap={customFieldErrorMap}
      renderLocalizedFields={({ activeLocale, values, form, readOnly, getError }) => {
        const titleEs = values.title?.["es-AR"] ?? "";
        const titleVal = values.title?.[activeLocale] ?? "";
        const descEs = values.description?.["es-AR"] ?? "";
        const descVal = values.description?.[activeLocale] ?? "";
        const ctaEs = values.ctaText?.["es-AR"] ?? "";
        const ctaVal = values.ctaText?.[activeLocale] ?? "";
        const agreementEsDoc = values.agreementNote?.["es-AR"];
        const agreementActiveDoc = values.agreementNote?.[activeLocale];
        const agreementEsPlain = extractRichTextPlainText(agreementEsDoc);
        const fields = values.fields ?? [];

        const updateLockedField = (
          index: number,
          updater: (
            field: ContactFormFieldItem,
          ) => Pick<ContactFormFieldItem, "name" | "placeholder" | "values">,
        ) => {
          const next = fields.map((item, i) => {
            if (i !== index) return item;
            const editable = updater(item);
            return {
              // Strictly preserve locked structural properties verbatim:
              inputId: item.inputId,
              type: item.type,
              required: item.required,
              ...(editable.name !== undefined ? { name: editable.name } : {}),
              ...(editable.placeholder !== undefined
                ? { placeholder: editable.placeholder }
                : {}),
              ...(editable.values !== undefined
                ? { values: editable.values }
                : {}),
            };
          });
          form.setField("fields", next);
        };

        return (
          <div className="space-y-6">
            <Field
              label={tSite("contactForm.title")}
              htmlFor={`contact-title-${activeLocale}`}
              fieldPath={`title.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={requiredMark}
              error={getError(`title.${activeLocale}`) ?? getError("title")}
            >
              <Input
                id={`contact-title-${activeLocale}`}
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
              label={tSite("contactForm.description")}
              htmlFor={`contact-desc-${activeLocale}`}
              fieldPath={`description.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={requiredMark}
              hint={tSite("contactForm.descriptionHint")}
              error={
                getError(`description.${activeLocale}`) ??
                getError("description")
              }
            >
              <Textarea
                id={`contact-desc-${activeLocale}`}
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
              label={tSite("contactForm.ctaText")}
              htmlFor={`contact-cta-${activeLocale}`}
              fieldPath={`ctaText.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={requiredMark}
              error={getError(`ctaText.${activeLocale}`) ?? getError("ctaText")}
            >
              <Input
                id={`contact-cta-${activeLocale}`}
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
              label={tSite("contactForm.agreementNote")}
              fieldPath={`agreementNote.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={requiredMark}
              hint={tSite("contactForm.agreementNoteHint")}
              error={findRichTextFieldError(
                getError,
                form.fieldErrors,
                `agreementNote.${activeLocale}`,
                "agreementNote",
              )}
            >
              <RichTextEditor
                key={`contact-agreement-${activeLocale}`}
                profile="inlineLink"
                value={agreementActiveDoc}
                readOnly={readOnly}
                minHeightClassName="min-h-24"
                onLossyLoad={(lossy) =>
                  form.markLossyField(`agreementNote.${activeLocale}`, lossy)
                }
                onChange={(nextDoc) =>
                  form.setField(
                    "agreementNote",
                    updateLocalizedRichText(
                      values.agreementNote,
                      activeLocale,
                      nextDoc,
                    ),
                  )
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={agreementEsPlain || undefined}
                isEnglishEmpty={isEmptyValue(agreementActiveDoc)}
                collapsible
                readOnly={readOnly}
                onCopyFromSpanish={() => {
                  if (!agreementEsDoc) return;
                  form.setField("agreementNote", {
                    "es-AR": agreementEsDoc,
                    "en-US": structuredClone(agreementEsDoc),
                  });
                }}
              />
            </Field>

            <div
              data-testid="contact-form-locked-fields"
              className="space-y-4 border-t border-border pt-5"
            >
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {tSite("contactForm.fieldsGroup")}
                </h2>
                <Notice variant="info">
                  {tSite("contactForm.fieldsLockedNote")}
                </Notice>
              </div>

              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {tSite("contactForm.emptyFields")}
                </p>
              ) : (
                <ol className="space-y-4">
                  {fields.map((field, idx) => {
                    const nameEs = field.name?.["es-AR"] ?? "";
                    const nameVal = field.name?.[activeLocale] ?? "";
                    const phEs = field.placeholder?.["es-AR"] ?? "";
                    const phVal = field.placeholder?.[activeLocale] ?? "";
                    const isDropdown =
                      field.type === "Dropdown" || field.values !== undefined;
                    const typeLabel = KNOWN_FIELD_TYPES.has(field.type)
                      ? tSite(`contactForm.fieldTypes.${field.type}` as never)
                      : field.type;

                    return (
                      <li
                        key={field.inputId}
                        data-testid={`contact-field-${field.inputId}`}
                        className="space-y-3 rounded-md border border-border bg-background p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-2 text-xs">
                          <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 font-mono font-medium text-foreground">
                            <Lock
                              className="size-3 text-muted-foreground"
                              aria-hidden="true"
                            />
                            {field.inputId}
                          </span>
                          <span className="rounded border border-border px-2 py-0.5 text-muted-foreground">
                            {typeLabel}
                          </span>
                          <span className="rounded border border-border px-2 py-0.5 text-muted-foreground">
                            {field.required
                              ? tSite("contactForm.requiredYes")
                              : tSite("contactForm.requiredNo")}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <Field
                            label={tSite("contactForm.fieldLabel")}
                            htmlFor={`cf-name-${field.inputId}-${activeLocale}`}
                            fieldPath={`fields.${idx}.name.${activeLocale}`}
                            requiredToPublish={activeLocale === "es-AR"}
                            requiredMarkLabel={requiredMark}
                            error={
                              getError(`fields.${idx}.name.${activeLocale}`) ??
                              getError(`fields.${idx}.name`)
                            }
                          >
                            <Input
                              id={`cf-name-${field.inputId}-${activeLocale}`}
                              disabled={readOnly}
                              value={nameVal}
                              placeholder={
                                activeLocale === "en-US" ? nameEs : undefined
                              }
                              onChange={(e) =>
                                updateLockedField(idx, (prev) => ({
                                  name: updateLocalizedString(
                                    prev.name,
                                    activeLocale,
                                    e.target.value,
                                  ),
                                  placeholder: prev.placeholder,
                                  values: prev.values,
                                }))
                              }
                            />
                            <LocalizedFieldReference
                              activeLocale={activeLocale}
                              spanishOriginal={nameEs || undefined}
                              isEnglishEmpty={!nameVal.trim()}
                              readOnly={readOnly}
                              onCopyFromSpanish={() =>
                                updateLockedField(idx, (prev) => ({
                                  name: { "es-AR": nameEs, "en-US": nameEs },
                                  placeholder: prev.placeholder,
                                  values: prev.values,
                                }))
                              }
                            />
                          </Field>

                          <Field
                            label={tSite("contactForm.fieldPlaceholder")}
                            htmlFor={`cf-ph-${field.inputId}-${activeLocale}`}
                            fieldPath={`fields.${idx}.placeholder.${activeLocale}`}
                            error={getError(
                              `fields.${idx}.placeholder.${activeLocale}`,
                            )}
                          >
                            <Input
                              id={`cf-ph-${field.inputId}-${activeLocale}`}
                              disabled={readOnly}
                              value={phVal}
                              placeholder={
                                activeLocale === "en-US" ? phEs : undefined
                              }
                              onChange={(e) =>
                                updateLockedField(idx, (prev) => ({
                                  name: prev.name,
                                  placeholder: updateLocalizedString(
                                    prev.placeholder,
                                    activeLocale,
                                    e.target.value,
                                  ),
                                  values: prev.values,
                                }))
                              }
                            />
                            <LocalizedFieldReference
                              activeLocale={activeLocale}
                              spanishOriginal={phEs || undefined}
                              isEnglishEmpty={!phVal.trim()}
                              readOnly={readOnly}
                              onCopyFromSpanish={() =>
                                updateLockedField(idx, (prev) => ({
                                  name: prev.name,
                                  placeholder: { "es-AR": phEs, "en-US": phEs },
                                  values: prev.values,
                                }))
                              }
                            />
                          </Field>
                        </div>

                        {isDropdown && (
                          <Field
                            label={tSite("contactForm.fieldOptions")}
                            fieldPath={`fields.${idx}.values.${activeLocale}`}
                            error={getError(
                              `fields.${idx}.values.${activeLocale}`,
                            )}
                          >
                            <LocalizedStringListField
                              activeLocale={activeLocale}
                              value={field.values}
                              addLabel={tSite("contactForm.addOption")}
                              placeholder={tSite(
                                "contactForm.optionPlaceholder",
                              )}
                              emptyMessage={tSite("contactForm.emptyOptions")}
                              readOnly={readOnly}
                              idPrefix={`cf-opt-${field.inputId}`}
                              onChange={(nextValues) =>
                                updateLockedField(idx, (prev) => ({
                                  name: prev.name,
                                  placeholder: prev.placeholder,
                                  values: nextValues,
                                }))
                              }
                            />
                          </Field>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        );
      }}
      renderGeneralFields={({ values, form, readOnly, getError }) => (
        <div className="space-y-4">
          <FixedIdentityMeta machineName={machineName} appearsOn={appearsOn} />

          <Field
            label={tSite("contactForm.bibleVerse")}
            fieldPath="bibleVerseId"
            requiredToPublish
            requiredMarkLabel={requiredMark}
            error={getError("bibleVerseId")}
          >
            <SingleVerseField
              value={values.bibleVerseId}
              initialVerse={
                values.bibleVerseId
                  ? (versesById[values.bibleVerseId] ?? null)
                  : null
              }
              readOnly={readOnly}
              onVerseLoaded={(verse) =>
                setVersesById((prev) => ({ ...prev, [verse.id]: verse }))
              }
              onChange={(verseId) => form.setField("bibleVerseId", verseId)}
            />
          </Field>

          <Field
            label={tSite("contactForm.image")}
            fieldPath="image"
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
        </div>
      )}
    />
  );
}
