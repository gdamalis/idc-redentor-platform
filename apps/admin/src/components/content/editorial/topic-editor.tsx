"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ContentStatus, Locale, Localized, TopicFields } from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import {
  confirmTopicPublishAction,
  createTopicAction,
  discardTopicChangesAction,
  prepareTopicPublishAction,
  saveTopicDraftAction,
} from "@src/app/[locale]/(app)/content/topics/actions";
import { EntryEditor } from "@src/components/content/entry-editor";
import type {
  EntryEditorActionHandlers,
  EntryEditorPermissions,
} from "@src/components/content/entry-editor-types";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { RichTextEditor } from "@src/components/content/rich-text/rich-text-editor";
import { SlugField } from "@src/components/content/slug-field";
import { Checkbox } from "@src/components/ui/checkbox";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Notice } from "@src/components/ui/notice";
import { Textarea } from "@src/components/ui/textarea";
import { extractPlainTextFromRichText } from "@src/service/content/editorial/editorial-rules";

export interface TopicEditorProps {
  readonly docId?: string;
  readonly initialDoc?: SerializedContentDoc<TopicFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: TopicFields;
  readonly permissions: EntryEditorPermissions;
  readonly isTrialMode: boolean;
  readonly liveUrl?: string;
}

const EXCLUDED_TOPIC_FIELDS: readonly (keyof TopicFields)[] = [
  "featuredImageId",
];

function updateLocalizedText(
  current: Localized<string> | undefined,
  locale: Locale,
  nextVal: string,
  requiredEs: boolean,
): Localized<string> | undefined {
  const nextEs = locale === "es-AR" ? nextVal : (current?.["es-AR"] ?? "");
  const nextEn = locale === "en-US" ? nextVal : current?.["en-US"];

  if (!requiredEs && nextEs.trim() === "" && (!nextEn || nextEn.trim() === "")) {
    return undefined;
  }

  return {
    "es-AR": nextEs,
    ...(nextEn !== undefined && nextEn.trim() !== "" ? { "en-US": nextEn } : {}),
  };
}

/** Keeps lifted protected flags synchronized after recovery restore or unpublish (`C2`). */
function ProtectedStateSync({
  draftProtected,
  isPublished,
  onSyncDraft,
  onClearPublished,
}: {
  readonly draftProtected: boolean;
  readonly isPublished: boolean;
  readonly onSyncDraft: (next: boolean) => void;
  readonly onClearPublished: () => void;
}) {
  React.useEffect(() => {
    onSyncDraft(draftProtected);
  }, [draftProtected, onSyncDraft]);

  React.useEffect(() => {
    if (!isPublished) {
      onClearPublished();
    }
  }, [isPublished, onClearPublished]);

  return null;
}

/**
 * Info Topics editor (`ICR-199` — corrected `B-editors.md` §2.10 model):
 * `name`, `shortDescription`, localized `slug` (`es-AR` / `en-US`), `body`
 * (`article` profile), and `protected` flag.
 * - NO nonexistent SEO fields.
 * - NO `featuredImageId` editor field in v1 (`excludeFromPatch` preserves any imported value).
 * - Protected publish gated on `content:publish-protected` (`D15` — legal-weight dialog notice, no approval tick).
 */
export function TopicEditor({
  docId,
  initialDoc,
  initialStatus,
  initialValues,
  permissions,
  isTrialMode,
  liveUrl,
}: TopicEditorProps) {
  const t = useTranslations("content");
  const tEd = useTranslations("contentEditorial");

  const [liveDraftProtected, setLiveDraftProtected] = React.useState(
    Boolean(initialValues.protected),
  );
  const [publishedProtected, setPublishedProtected] = React.useState(
    Boolean(initialDoc?.published?.protected),
  );

  const isEffectiveProtected = publishedProtected || liveDraftProtected;

  const handleClearPublishedProtected = React.useCallback(() => {
    setPublishedProtected(false);
  }, []);

  const actionOverrides = React.useMemo<
    Partial<EntryEditorActionHandlers<TopicFields>>
  >(
    () => ({
      create: createTopicAction,
      saveDraft: saveTopicDraftAction,
      preparePublish: prepareTopicPublishAction,
      confirmPublish: async (input) => {
        const res = await confirmTopicPublishAction(input);
        if (res.ok) {
          setLiveDraftProtected(Boolean(res.doc.draft.protected));
          setPublishedProtected(Boolean(res.doc.published?.protected));
        }
        return res;
      },
      discardChanges: async (input) => {
        const res = await discardTopicChangesAction(input);
        if (res.ok) {
          setLiveDraftProtected(Boolean(res.doc.draft.protected));
          setPublishedProtected(Boolean(res.doc.published?.protected));
        }
        return res;
      },
    }),
    [],
  );

  const customFieldErrorMap = React.useCallback(
    (path: string, rawMessages: readonly string[]) => {
      if (rawMessages.includes("reserved-route-slug")) {
        return tEd("errors.reservedRouteSlug");
      }
      const isRequiredError = rawMessages.some((m) =>
        m.toLowerCase().includes("required"),
      );
      if (isEffectiveProtected && isRequiredError) {
        if (path === "name.en-US") return tEd("errors.protectedMissingEnName");
        if (path === "slug.en-US" && !rawMessages.includes("duplicate-key")) {
          return tEd("errors.protectedMissingEnSlug");
        }
        if (path === "body.en-US") return tEd("errors.protectedMissingEnBody");
        if (path === "shortDescription.en-US") {
          return tEd("errors.protectedMissingEnShortDescription");
        }
        if (path === "shortDescription.es-AR") {
          return tEd("errors.protectedMissingEsShortDescription");
        }
      }
      return undefined;
    },
    [isEffectiveProtected, tEd],
  );

  return (
    <EntryEditor<TopicFields>
      collection="topics"
      docId={docId}
      initialDoc={initialDoc}
      initialStatus={initialStatus}
      initialValues={initialValues}
      backHref="/content/topics"
      backLabel={t("types.topics")}
      getTitle={(vals) => vals.name["es-AR"] || vals.name["en-US"] || ""}
      permissions={permissions}
      isTrialMode={isTrialMode}
      isProtected={isEffectiveProtected}
      protectedKind="legal"
      liveUrl={liveUrl}
      excludeFromPatch={EXCLUDED_TOPIC_FIELDS}
      actionOverrides={actionOverrides}
      customFieldErrorMap={customFieldErrorMap}
      onAfterSave={(saved) => {
        setLiveDraftProtected(Boolean(saved.draft.protected));
        setPublishedProtected(Boolean(saved.published?.protected));
      }}
      publishDialogExtras={() => {
        if (!isEffectiveProtected) return null;
        return (
          <Notice variant="warning" data-testid="protected-publish-legal-notice">
            {tEd("topics.protectedPublishWarning")}
          </Notice>
        );
      }}
      renderLocalizedFields={({
        activeLocale,
        values,
        form,
        readOnly,
        isPublished,
        getError,
      }) => {
        const nameValue = values.name[activeLocale] ?? "";
        const descValue = values.shortDescription?.[activeLocale] ?? "";
        const slugValue = values.slug?.[activeLocale] ?? "";
        const bodyValue = values.body?.[activeLocale];
        const spanishBodyPreview = extractPlainTextFromRichText(
          values.body?.["es-AR"],
        );
        const isLocaleRequired = activeLocale === "es-AR" || isEffectiveProtected;
        const isShortDescRequired =
          isEffectiveProtected &&
          Boolean(
            activeLocale === "en-US"
              ? values.shortDescription?.["es-AR"]?.trim()
              : values.shortDescription?.["en-US"]?.trim(),
          );

        return (
          <>
            <Field
              label={tEd("topics.nameLabel")}
              htmlFor={`topic-name-${activeLocale}`}
              fieldPath={`name.${activeLocale}`}
              requiredToPublish={isLocaleRequired}
              requiredMarkLabel={t("errors.requiredMark")}
              error={getError(`name.${activeLocale}`) ?? getError("name")}
            >
              <Input
                id={`topic-name-${activeLocale}`}
                value={nameValue}
                disabled={readOnly}
                placeholder={
                  activeLocale === "en-US" && values.name["es-AR"]
                    ? values.name["es-AR"]
                    : tEd("topics.namePlaceholder")
                }
                onChange={(e) => {
                  const next = updateLocalizedText(
                    values.name,
                    activeLocale,
                    e.target.value,
                    true,
                  );
                  if (next) form.setField("name", next);
                }}
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={values.name["es-AR"] || undefined}
                isEnglishEmpty={nameValue.trim() === ""}
                readOnly={readOnly}
                onCopyFromSpanish={
                  values.name["es-AR"]
                    ? () =>
                        form.setField("name", {
                          "es-AR": values.name["es-AR"],
                          "en-US": values.name["es-AR"],
                        })
                    : undefined
                }
              />
            </Field>

            <Field
              label={tEd("topics.shortDescriptionLabel")}
              htmlFor={`topic-short-desc-${activeLocale}`}
              fieldPath={`shortDescription.${activeLocale}`}
              requiredToPublish={isShortDescRequired}
              requiredMarkLabel={t("errors.requiredMark")}
              error={
                getError(`shortDescription.${activeLocale}`) ??
                getError("shortDescription")
              }
            >
              <Textarea
                id={`topic-short-desc-${activeLocale}`}
                rows={3}
                value={descValue}
                disabled={readOnly}
                placeholder={
                  activeLocale === "en-US" && values.shortDescription?.["es-AR"]
                    ? values.shortDescription["es-AR"]
                    : tEd("topics.shortDescriptionPlaceholder")
                }
                onChange={(e) => {
                  form.setField(
                    "shortDescription",
                    updateLocalizedText(
                      values.shortDescription,
                      activeLocale,
                      e.target.value,
                      false,
                    ),
                  );
                }}
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={values.shortDescription?.["es-AR"] || undefined}
                isEnglishEmpty={descValue.trim() === ""}
                readOnly={readOnly}
                onCopyFromSpanish={
                  values.shortDescription?.["es-AR"]
                    ? () =>
                        form.setField("shortDescription", {
                          "es-AR": values.shortDescription!["es-AR"],
                          "en-US": values.shortDescription!["es-AR"],
                        })
                    : undefined
                }
              />
            </Field>

            <div className="space-y-1.5">
              <SlugField
                key={`topic-slug-${activeLocale}`}
                id={`topic-slug-${activeLocale}`}
                label={tEd("topics.slugLabel")}
                prefix={`/${activeLocale}/`}
                value={slugValue}
                onChange={(nextVal) => {
                  form.setField(
                    "slug",
                    updateLocalizedText(values.slug, activeLocale, nextVal, false),
                  );
                }}
                autoSource={values.name[activeLocale]}
                isPublished={isPublished}
                readOnly={readOnly}
                requiredToPublish={isLocaleRequired}
                fieldPath={`slug.${activeLocale}`}
                error={getError(`slug.${activeLocale}`) ?? getError("slug")}
              />
              <p className="text-xs text-muted-foreground">
                {tEd("topics.slugHint")}
              </p>
              {activeLocale === "en-US" && values.slug?.["es-AR"] && (
                <LocalizedFieldReference
                  activeLocale={activeLocale}
                  spanishOriginal={`/es-AR/${values.slug["es-AR"]}`}
                  isEnglishEmpty={slugValue.trim() === ""}
                  readOnly={readOnly}
                />
              )}
            </div>

            <Field
              label={tEd("topics.bodyLabel")}
              fieldPath={`body.${activeLocale}`}
              requiredToPublish={isLocaleRequired}
              requiredMarkLabel={t("errors.requiredMark")}
              error={getError(`body.${activeLocale}`) ?? getError("body")}
            >
              <RichTextEditor
                key={`topic-body-${activeLocale}`}
                profile="article"
                value={bodyValue}
                readOnly={readOnly}
                minHeightClassName="min-h-64"
                onLossyLoad={(lossy) =>
                  form.markLossyField(`body.${activeLocale}`, lossy)
                }
                onChange={(nextDoc) => {
                  const nextEs =
                    activeLocale === "es-AR"
                      ? nextDoc
                      : (values.body?.["es-AR"] ?? {
                          type: "doc",
                          content: [{ type: "paragraph" }],
                        });
                  const nextEn =
                    activeLocale === "en-US" ? nextDoc : values.body?.["en-US"];
                  form.setField("body", {
                    "es-AR": nextEs,
                    ...(nextEn !== undefined ? { "en-US": nextEn } : {}),
                  });
                }}
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={spanishBodyPreview || undefined}
                isEnglishEmpty={
                  extractPlainTextFromRichText(bodyValue).trim() === ""
                }
                collapsible
                readOnly={readOnly}
                onCopyFromSpanish={
                  values.body?.["es-AR"]
                    ? () =>
                        form.setField("body", {
                          "es-AR": values.body!["es-AR"],
                          "en-US": structuredClone(values.body!["es-AR"]),
                        })
                    : undefined
                }
              />
            </Field>
          </>
        );
      }}
      renderGeneralFields={({ values, form, readOnly, isPublished, getError }) => {
        const canToggleProtected = !readOnly && permissions.canPublishProtected;
        return (
          <>
            <ProtectedStateSync
              draftProtected={Boolean(values.protected)}
              isPublished={isPublished}
              onSyncDraft={setLiveDraftProtected}
              onClearPublished={handleClearPublishedProtected}
            />
            <Field
              label={tEd("topics.protectedLabel")}
              fieldPath="protected"
              hint={
                permissions.canPublishProtected
                  ? tEd("topics.protectedHint")
                  : tEd("topics.protectedReadOnlyHint")
              }
              error={getError("protected")}
            >
              <Checkbox
                id="topic-protected"
                checked={Boolean(values.protected)}
                disabled={!canToggleProtected}
                onChange={(e) => {
                  const next = e.target.checked;
                  setLiveDraftProtected(next);
                  form.setField("protected", next);
                }}
                label={tEd("topics.protectedLabel")}
              />
            </Field>
          </>
        );
      }}
    />
  );
}
