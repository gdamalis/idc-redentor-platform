"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  isEmptyValue,
  type ContentStatus,
  type Locale,
  type Localized,
  type RichTextDoc,
  type SermonFields,
} from "@idcr/content";
import {
  countMissingEnglishFields,
  isNeedsReviewDraft,
} from "@src/lib/content/status-helpers";
import { formatDuration } from "@src/lib/media/policy";
import {
  normalizeLocalizedStringArray,
  normalizeSermonAudioLanguages,
} from "@src/service/content/sermons/sermon-helpers";
import type {
  BibleVersePickerItem,
  ContentPickerOption,
  SerializedContentDoc,
} from "@src/app/[locale]/(app)/content/actions";
import type { SerializedMediaDoc } from "@src/app/[locale]/(app)/content/media/actions";
import {
  confirmSermonPublishAction,
  createSermonAction,
  discardSermonChangesAction,
  getSermonPdfStatusAction,
  prepareSermonPublishAction,
  saveSermonDraftAction,
  type SerializedSermonPdfStatus,
} from "@src/app/[locale]/(app)/content/sermons/actions";
import { Checkbox } from "@src/components/ui/checkbox";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Notice } from "@src/components/ui/notice";
import { Textarea } from "@src/components/ui/textarea";
import { EntryEditor } from "@src/components/content/entry-editor";
import type {
  EntryEditorActionHandlers,
  EntryEditorPermissions,
} from "@src/components/content/entry-editor-types";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { MediaField } from "@src/components/content/media";
import { RichTextEditor } from "@src/components/content/rich-text/rich-text-editor";
import { SlugField } from "@src/components/content/slug-field";
import { SortableList } from "@src/components/content/sortable-list";
import {
  SermonEmbeddedMediaContext,
  SermonEmbeddedMediaNodeView,
  SermonRichTextToolbarExtras,
} from "./sermon-embedded-media-node-view";
import { SermonPdfStatusCard } from "./sermon-pdf-status-card";
import {
  SermonAdditionalPreachersField,
  SermonAuthorField,
  SermonRelatedPicker,
} from "./sermon-pickers";
import { SermonScriptureField } from "./sermon-scripture-field";

const EXCLUDE_FROM_PATCH: readonly (keyof SermonFields)[] = [
  "pdfSummaryMediaId",
  "contentHash",
];

/**
 * Stateful SEO accordion (`ICR-200` C3): starts collapsed, auto-opens when any
 * SEO publish validation error appears so `ErrorSummary` links can scroll to
 * and focus hidden inputs, and stays open as the user types to clear the error.
 */
function SermonSeoDetails({
  summary,
  hasError,
  children,
}: {
  readonly summary: string;
  readonly hasError: boolean;
  readonly children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(hasError);

  React.useEffect(() => {
    if (hasError) {
      setIsOpen(true);
    }
  }, [hasError]);

  return (
    <details
      open={isOpen}
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
      data-testid="sermon-seo-details"
      className="rounded-md border border-border bg-muted/10 px-4 py-3"
    >
      <summary className="cursor-pointer text-sm font-medium text-foreground select-none">
        {summary}
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

export interface SermonEditorProps {
  readonly docId?: string;
  readonly initialDoc?: SerializedContentDoc<SermonFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: SermonFields;
  readonly permissions: EntryEditorPermissions;
  readonly canManageMedia: boolean;
  readonly isTrialMode: boolean;
  readonly isPublishEmailsEnabled: boolean;
  readonly liveUrl?: string;
  readonly initialAuthors: Readonly<Record<string, ContentPickerOption>>;
  readonly initialVerses: readonly BibleVersePickerItem[];
  readonly verseUsageCounts: Readonly<Record<string, number>>;
  readonly initialRelatedSermons: Readonly<Record<string, ContentPickerOption>>;
  readonly initialMedia: Readonly<Record<string, SerializedMediaDoc>>;
  readonly initialPdfStatus: SerializedSermonPdfStatus;
}

function setLocalizedString(
  current: Localized<string> | undefined,
  locale: Locale,
  nextValue: string,
): Localized<string> {
  if (locale === "es-AR") {
    return {
      "es-AR": nextValue,
      ...(current?.["en-US"] !== undefined && { "en-US": current["en-US"] }),
    };
  }
  return {
    "es-AR": current?.["es-AR"] ?? "",
    "en-US": nextValue,
  };
}

function setLocalizedStringList(
  current: Localized<string[]> | undefined,
  locale: Locale,
  nextList: string[],
): Localized<string[]> {
  if (locale === "es-AR") {
    return {
      "es-AR": nextList,
      ...(current?.["en-US"] !== undefined && { "en-US": current["en-US"] }),
    };
  }
  return {
    "es-AR": current?.["es-AR"] ?? [],
    "en-US": nextList,
  };
}

/**
 * Strips `Object.create(null)` prototypes emitted by ProseMirror `editor.getJSON()`
 * on `heading.attrs`, `link.attrs`, `orderedList.attrs`, and `embeddedMedia.attrs`
 * so React 19 / Next.js 16 Server Action Flight serializes them as plain objects
 * instead of `"$T"` temporary references (board #271).
 */
function toPlainRichTextDoc(doc: RichTextDoc): RichTextDoc {
  return JSON.parse(JSON.stringify(doc)) as RichTextDoc;
}

function setLocalizedRichText(
  current: Localized<RichTextDoc> | undefined,
  locale: Locale,
  nextDoc: RichTextDoc,
): Localized<RichTextDoc> {
  const plain = toPlainRichTextDoc(nextDoc);
  if (locale === "es-AR") {
    return {
      "es-AR": plain,
      ...(current?.["en-US"] !== undefined && { "en-US": current["en-US"] }),
    };
  }
  return {
    "es-AR": current?.["es-AR"] ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
    "en-US": plain,
  };
}

function extractPlainTextPreview(doc: RichTextDoc | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return "";
  const parts: string[] = [];
  const stack: unknown[] = [...doc.content].reverse();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    const rec = node as Record<string, unknown>;
    if (rec.type === "text" && typeof rec.text === "string") {
      parts.push(rec.text);
    } else if (Array.isArray(rec.content)) {
      if (rec.type === "paragraph" && parts.length > 0) parts.push("\n");
      for (let i = rec.content.length - 1; i >= 0; i -= 1) {
        stack.push(rec.content[i]);
      }
    }
  }
  return parts.join("").trim();
}

function countSermonMissingEn(values: SermonFields): number {
  return countMissingEnglishFields([
    values.title,
    values.thesis,
    normalizeLocalizedStringArray(values.mainPoints),
    values.excerpt,
    values.content,
    values.seoTitle,
    values.seoDescription,
    normalizeLocalizedStringArray(values.keywords),
  ]);
}

/**
 * Full bilingual sermon editor (`ICR-200`, `F-editor-ux-decisions.md` §2.10,
 * wireframes §3.3–3.4) mounted inside `ICR-197`'s `EntryEditor`.
 */
export function SermonEditor({
  docId: initialDocId,
  initialDoc,
  initialStatus,
  initialValues,
  permissions,
  canManageMedia,
  isTrialMode,
  isPublishEmailsEnabled,
  liveUrl,
  initialAuthors,
  initialVerses,
  verseUsageCounts,
  initialRelatedSermons,
  initialMedia,
  initialPdfStatus,
}: SermonEditorProps) {
  const t = useTranslations("contentSermons");
  const tContent = useTranslations("content");

  const [currentDoc, setCurrentDoc] = React.useState<
    SerializedContentDoc<SermonFields> | undefined
  >(initialDoc);
  const [mediaMap, setMediaMap] =
    React.useState<Readonly<Record<string, SerializedMediaDoc>>>(initialMedia);
  const [pdfStatus, setPdfStatus] =
    React.useState<SerializedSermonPdfStatus>(initialPdfStatus);
  const [notifySubscribers, setNotifySubscribers] = React.useState(true);

  const handleMediaResolved = React.useCallback((doc: SerializedMediaDoc) => {
    setMediaMap((prev) =>
      prev[doc._id] === doc ? prev : { ...prev, [doc._id]: doc },
    );
  }, []);

  const syncPdfStatus = React.useCallback(
    async (
      docId: string,
      inlineStatus?: SerializedSermonPdfStatus,
    ): Promise<void> => {
      if (inlineStatus) {
        setPdfStatus(inlineStatus);
        return;
      }
      const statusRes = await getSermonPdfStatusAction({ docId });
      if (statusRes.ok) {
        setPdfStatus(statusRes.pdfStatus);
      }
    },
    [],
  );

  /**
   * Wraps all 5 `EntryEditor` lifecycle actions (`ICR-200` C2) so `currentDoc`
   * and `pdfStatus` update synchronously BEFORE `EntryEditor` renders
   * `PublishDialog` (`AC5`), clears `sermon-script-draft-notice` on direct
   * publish (`AC8`), and refreshes PDF status on discard.
   */
  const actionOverrides = React.useMemo<
    Partial<EntryEditorActionHandlers<SermonFields>>
  >(
    () => ({
      create: async (input) => {
        const res = await createSermonAction(input);
        if (res.ok) {
          setCurrentDoc(res.doc);
          await syncPdfStatus(res.doc._id, res.pdfStatus);
        }
        return res;
      },
      saveDraft: async (input) => {
        const res = await saveSermonDraftAction(input);
        if (res.ok) {
          setCurrentDoc(res.doc);
          await syncPdfStatus(res.doc._id, res.pdfStatus);
        }
        return res;
      },
      preparePublish: async (input) => {
        const res = await prepareSermonPublishAction(input);
        if (res.ok) {
          setCurrentDoc(res.doc);
          await syncPdfStatus(res.doc._id, res.pdfStatus);
        } else if (
          res.reason === "invalid" &&
          "savedDoc" in res &&
          res.savedDoc
        ) {
          setCurrentDoc(res.savedDoc);
          await syncPdfStatus(res.savedDoc._id, res.savedPdfStatus);
        }
        return res;
      },
      confirmPublish: async (input) => {
        const res = await confirmSermonPublishAction(input);
        if (res.ok) {
          setCurrentDoc(res.doc);
          await syncPdfStatus(res.doc._id, res.pdfStatus);
        }
        return res;
      },
      discardChanges: async (input) => {
        const res = await discardSermonChangesAction(input);
        if (res.ok) {
          setCurrentDoc(res.doc);
          await syncPdfStatus(res.doc._id, res.pdfStatus);
        }
        return res;
      },
    }),
    [syncPdfStatus],
  );

  const customFieldErrorMap = React.useCallback(
    (path: string, rawMessages: readonly string[]): string | undefined => {
      if (rawMessages.includes("duplicate-key")) return undefined;
      const top = path.split(".")[0] ?? path;
      const key = `errors.${top}`;
      return t.has(key as never) ? t(key as never) : undefined;
    },
    [t],
  );

  const isScriptDraft =
    currentDoc !== undefined &&
    isNeedsReviewDraft({
      published: currentDoc.published,
      updatedBy: currentDoc.updatedBy,
    });

  const persistedDocId = currentDoc?._id ?? initialDocId;

  return (
    <EntryEditor<SermonFields>
      collection="sermons"
      docId={initialDocId}
      initialDoc={initialDoc}
      initialStatus={initialStatus}
      initialValues={initialValues}
      backHref="/content/sermons"
      backLabel={tContent("types.sermons")}
      getTitle={(values) => values.title?.["es-AR"]?.trim() ?? ""}
      permissions={permissions}
      isTrialMode={isTrialMode}
      isPublishEmailsEnabled={isPublishEmailsEnabled}
      liveUrl={liveUrl}
      excludeFromPatch={EXCLUDE_FROM_PATCH}
      actionOverrides={actionOverrides}
      countMissingEn={countSermonMissingEn}
      customFieldErrorMap={customFieldErrorMap}
      topNotices={
        isScriptDraft ? (
          <Notice variant="info" data-testid="sermon-script-draft-notice">
            {t("scriptDraft")}
          </Notice>
        ) : undefined
      }
      getPublishOptions={() => ({
        notify: notifySubscribers,
      })}
      publishDialogExtras={(ctx) => (
        <div className="space-y-3">
          {pdfStatus.isPending && (
            <p
              className="text-sm text-muted-foreground"
              data-testid="publish-pdf-pending-note"
            >
              • {t("pdf.publishNote")}
            </p>
          )}
          {ctx.isFirstPublish && ctx.isPublishEmailsEnabled && (
            <Checkbox
              id="sermon-publish-notify"
              checked={notifySubscribers}
              onChange={(e) => setNotifySubscribers(e.target.checked)}
              label={t("publish.emailBox")}
            />
          )}
        </div>
      )}
      renderLocalizedFields={({ activeLocale, values, form, readOnly, getError }) => {
        const titleVal = values.title?.[activeLocale] ?? "";
        const titleEs = values.title?.["es-AR"] ?? "";

        const thesisVal = values.thesis?.[activeLocale] ?? "";
        const thesisEs = values.thesis?.["es-AR"] ?? "";

        const mainPointsList = values.mainPoints?.[activeLocale] ?? [];
        const mainPointsEs = values.mainPoints?.["es-AR"] ?? [];

        const excerptVal = values.excerpt?.[activeLocale] ?? "";
        const excerptEs = values.excerpt?.["es-AR"] ?? "";

        const contentVal = values.content?.[activeLocale];
        const contentEs = values.content?.["es-AR"];
        const contentEsPreview = extractPlainTextPreview(contentEs);

        const seoTitleVal = values.seoTitle?.[activeLocale] ?? "";
        const seoTitleEs = values.seoTitle?.["es-AR"] ?? "";

        const seoDescVal = values.seoDescription?.[activeLocale] ?? "";
        const seoDescEs = values.seoDescription?.["es-AR"] ?? "";

        const keywordsList = values.keywords?.[activeLocale] ?? [];
        const keywordsEs = values.keywords?.["es-AR"] ?? [];

        return (
          <SermonEmbeddedMediaContext.Provider
            value={{
              mediaMap,
              onMediaResolved: handleMediaResolved,
              canUpload: canManageMedia,
              readOnly,
              locale: activeLocale,
            }}
          >
            <div className="space-y-5">
              {/* Título */}
              <Field
                label={t("fields.title")}
                htmlFor={`sermon-title-${activeLocale}`}
                fieldPath={`title.${activeLocale}`}
                requiredToPublish={activeLocale === "es-AR"}
                requiredMarkLabel={tContent("errors.requiredMark")}
                error={getError(`title.${activeLocale}`) ?? getError("title")}
              >
                <Input
                  id={`sermon-title-${activeLocale}`}
                  value={titleVal}
                  disabled={readOnly}
                  placeholder={activeLocale === "en-US" ? titleEs : undefined}
                  onChange={(e) =>
                    form.setField(
                      "title",
                      setLocalizedString(
                        values.title,
                        activeLocale,
                        e.target.value,
                      ),
                    )
                  }
                />
                <LocalizedFieldReference
                  activeLocale={activeLocale}
                  spanishOriginal={titleEs}
                  isEnglishEmpty={isEmptyValue(titleVal)}
                  readOnly={readOnly}
                  onCopyFromSpanish={() =>
                    form.setField(
                      "title",
                      setLocalizedString(values.title, "en-US", titleEs),
                    )
                  }
                />
              </Field>

              {/* Tesis */}
              <Field
                label={t("fields.thesis")}
                htmlFor={`sermon-thesis-${activeLocale}`}
                fieldPath={`thesis.${activeLocale}`}
                requiredToPublish={activeLocale === "es-AR"}
                requiredMarkLabel={tContent("errors.requiredMark")}
                error={getError(`thesis.${activeLocale}`) ?? getError("thesis")}
              >
                <Textarea
                  id={`sermon-thesis-${activeLocale}`}
                  rows={2}
                  value={thesisVal}
                  disabled={readOnly}
                  placeholder={activeLocale === "en-US" ? thesisEs : undefined}
                  onChange={(e) =>
                    form.setField(
                      "thesis",
                      setLocalizedString(
                        values.thesis,
                        activeLocale,
                        e.target.value,
                      ),
                    )
                  }
                />
                <LocalizedFieldReference
                  activeLocale={activeLocale}
                  spanishOriginal={thesisEs}
                  isEnglishEmpty={isEmptyValue(thesisVal)}
                  readOnly={readOnly}
                  onCopyFromSpanish={() =>
                    form.setField(
                      "thesis",
                      setLocalizedString(values.thesis, "en-US", thesisEs),
                    )
                  }
                />
              </Field>

              {/* Puntos principales */}
              <Field
                label={t("fields.mainPoints")}
                fieldPath={`mainPoints.${activeLocale}`}
                requiredToPublish={activeLocale === "es-AR"}
                requiredMarkLabel={tContent("errors.requiredMark")}
                error={
                  getError(`mainPoints.${activeLocale}`) ??
                  getError("mainPoints")
                }
              >
                <SortableList<string>
                  items={mainPointsList}
                  getKey={(_item, idx) => `${activeLocale}-mp-${idx}`}
                  onChange={(next) =>
                    form.setField(
                      "mainPoints",
                      setLocalizedStringList(
                        values.mainPoints,
                        activeLocale,
                        next,
                      ),
                    )
                  }
                  onAdd={() =>
                    form.setField(
                      "mainPoints",
                      setLocalizedStringList(values.mainPoints, activeLocale, [
                        ...mainPointsList,
                        "",
                      ]),
                    )
                  }
                  addLabel={t("fields.addPoint")}
                  emptyMessage={t("fields.noMainPoints")}
                  moveUpLabel={t("list.moveUp")}
                  moveDownLabel={t("list.moveDown")}
                  removeLabel={t("list.remove")}
                  readOnly={readOnly}
                  renderItem={(point, index) => (
                    <Input
                      value={point}
                      disabled={readOnly}
                      placeholder={t("fields.mainPointPlaceholder")}
                      aria-label={`${t("fields.mainPoints")} ${index + 1}`}
                      onChange={(e) => {
                        const next = [...mainPointsList];
                        next[index] = e.target.value;
                        form.setField(
                          "mainPoints",
                          setLocalizedStringList(
                            values.mainPoints,
                            activeLocale,
                            next,
                          ),
                        );
                      }}
                    />
                  )}
                />
                <LocalizedFieldReference
                  activeLocale={activeLocale}
                  spanishOriginal={
                    mainPointsEs.length > 0
                      ? mainPointsEs.map((p, i) => `${i + 1}. ${p}`).join("\n")
                      : undefined
                  }
                  isEnglishEmpty={mainPointsList.every(
                    (p) => p.trim().length === 0,
                  )}
                  readOnly={readOnly}
                  onCopyFromSpanish={() =>
                    form.setField(
                      "mainPoints",
                      setLocalizedStringList(values.mainPoints, "en-US", [
                        ...mainPointsEs,
                      ]),
                    )
                  }
                />
              </Field>

              {/* Extracto */}
              <Field
                label={t("fields.excerpt")}
                htmlFor={`sermon-excerpt-${activeLocale}`}
                fieldPath={`excerpt.${activeLocale}`}
                requiredToPublish={activeLocale === "es-AR"}
                requiredMarkLabel={tContent("errors.requiredMark")}
                error={
                  getError(`excerpt.${activeLocale}`) ?? getError("excerpt")
                }
              >
                <Textarea
                  id={`sermon-excerpt-${activeLocale}`}
                  rows={3}
                  value={excerptVal}
                  disabled={readOnly}
                  placeholder={activeLocale === "en-US" ? excerptEs : undefined}
                  onChange={(e) =>
                    form.setField(
                      "excerpt",
                      setLocalizedString(
                        values.excerpt,
                        activeLocale,
                        e.target.value,
                      ),
                    )
                  }
                />
                <LocalizedFieldReference
                  activeLocale={activeLocale}
                  spanishOriginal={excerptEs}
                  isEnglishEmpty={isEmptyValue(excerptVal)}
                  readOnly={readOnly}
                  onCopyFromSpanish={() =>
                    form.setField(
                      "excerpt",
                      setLocalizedString(values.excerpt, "en-US", excerptEs),
                    )
                  }
                />
              </Field>

              {/* Contenido (TipTap sermon profile + embeddedMedia cards) */}
              <Field
                label={t("fields.content")}
                fieldPath={`content.${activeLocale}`}
                requiredToPublish={activeLocale === "es-AR"}
                requiredMarkLabel={tContent("errors.requiredMark")}
                error={
                  getError(`content.${activeLocale}`) ?? getError("content")
                }
              >
                <RichTextEditor
                  key={`sermon-content-${activeLocale}`}
                  profile="sermon"
                  value={contentVal}
                  readOnly={readOnly}
                  minHeightClassName="min-h-64"
                  embeddedMediaNodeView={SermonEmbeddedMediaNodeView}
                  toolbarExtras={(editor) => (
                    <SermonRichTextToolbarExtras
                      editor={editor}
                      readOnly={readOnly}
                      canUpload={canManageMedia}
                      onMediaResolved={handleMediaResolved}
                    />
                  )}
                  onLossyLoad={(lossy) =>
                    form.markLossyField(`content.${activeLocale}`, lossy)
                  }
                  onChange={(nextDoc) =>
                    form.setField(
                      "content",
                      setLocalizedRichText(
                        values.content,
                        activeLocale,
                        nextDoc,
                      ),
                    )
                  }
                />
                <LocalizedFieldReference
                  activeLocale={activeLocale}
                  spanishOriginal={contentEsPreview || undefined}
                  isEnglishEmpty={isEmptyValue(contentVal)}
                  collapsible
                  readOnly={readOnly}
                  onCopyFromSpanish={
                    contentEs
                      ? () =>
                          form.setField(
                            "content",
                            setLocalizedRichText(
                              values.content,
                              "en-US",
                              toPlainRichTextDoc(contentEs),
                            ),
                          )
                      : undefined
                  }
                />
              </Field>

              {/* System-managed PDF status card for active locale */}
              <SermonPdfStatusCard
                docId={persistedDocId}
                locale={activeLocale}
                status={pdfStatus}
                readOnly={readOnly}
                onStatusChange={setPdfStatus}
              />

              {/* Buscadores (SEO) — collapsed group; auto-opens on publish errors without closing on keystroke (C3) */}
              <SermonSeoDetails
                summary={t("fields.seoGroup")}
                hasError={Boolean(
                  getError("seoTitle.es-AR") ??
                    getError("seoTitle.en-US") ??
                    getError("seoTitle") ??
                    getError("seoDescription.es-AR") ??
                    getError("seoDescription.en-US") ??
                    getError("seoDescription") ??
                    getError("keywords.es-AR") ??
                    getError("keywords.en-US") ??
                    getError("keywords"),
                )}
              >
                  <Field
                    label={t("fields.seoTitle")}
                    htmlFor={`sermon-seo-title-${activeLocale}`}
                    fieldPath={`seoTitle.${activeLocale}`}
                    requiredToPublish={activeLocale === "es-AR"}
                    requiredMarkLabel={tContent("errors.requiredMark")}
                    hint={t("fields.charCount", { count: seoTitleVal.length })}
                    error={
                      getError(`seoTitle.${activeLocale}`) ??
                      getError("seoTitle")
                    }
                  >
                    <Input
                      id={`sermon-seo-title-${activeLocale}`}
                      value={seoTitleVal}
                      disabled={readOnly}
                      placeholder={
                        activeLocale === "en-US" ? seoTitleEs : undefined
                      }
                      onChange={(e) =>
                        form.setField(
                          "seoTitle",
                          setLocalizedString(
                            values.seoTitle,
                            activeLocale,
                            e.target.value,
                          ),
                        )
                      }
                    />
                    <LocalizedFieldReference
                      activeLocale={activeLocale}
                      spanishOriginal={seoTitleEs}
                      isEnglishEmpty={isEmptyValue(seoTitleVal)}
                      readOnly={readOnly}
                      onCopyFromSpanish={() =>
                        form.setField(
                          "seoTitle",
                          setLocalizedString(
                            values.seoTitle,
                            "en-US",
                            seoTitleEs,
                          ),
                        )
                      }
                    />
                  </Field>

                  <Field
                    label={t("fields.seoDescription")}
                    htmlFor={`sermon-seo-desc-${activeLocale}`}
                    fieldPath={`seoDescription.${activeLocale}`}
                    requiredToPublish={activeLocale === "es-AR"}
                    requiredMarkLabel={tContent("errors.requiredMark")}
                    hint={t("fields.charCount", { count: seoDescVal.length })}
                    error={
                      getError(`seoDescription.${activeLocale}`) ??
                      getError("seoDescription")
                    }
                  >
                    <Textarea
                      id={`sermon-seo-desc-${activeLocale}`}
                      rows={2}
                      value={seoDescVal}
                      disabled={readOnly}
                      placeholder={
                        activeLocale === "en-US" ? seoDescEs : undefined
                      }
                      onChange={(e) =>
                        form.setField(
                          "seoDescription",
                          setLocalizedString(
                            values.seoDescription,
                            activeLocale,
                            e.target.value,
                          ),
                        )
                      }
                    />
                    <LocalizedFieldReference
                      activeLocale={activeLocale}
                      spanishOriginal={seoDescEs}
                      isEnglishEmpty={isEmptyValue(seoDescVal)}
                      readOnly={readOnly}
                      onCopyFromSpanish={() =>
                        form.setField(
                          "seoDescription",
                          setLocalizedString(
                            values.seoDescription,
                            "en-US",
                            seoDescEs,
                          ),
                        )
                      }
                    />
                  </Field>

                  <Field
                    label={t("fields.keywords")}
                    fieldPath={`keywords.${activeLocale}`}
                  >
                    <SortableList<string>
                      items={keywordsList}
                      getKey={(_item, idx) => `${activeLocale}-kw-${idx}`}
                      onChange={(next) =>
                        form.setField(
                          "keywords",
                          setLocalizedStringList(
                            values.keywords,
                            activeLocale,
                            next,
                          ),
                        )
                      }
                      onAdd={() =>
                        form.setField(
                          "keywords",
                          setLocalizedStringList(
                            values.keywords,
                            activeLocale,
                            [...keywordsList, ""],
                          ),
                        )
                      }
                      addLabel={t("fields.addKeyword")}
                      moveUpLabel={t("list.moveUp")}
                      moveDownLabel={t("list.moveDown")}
                      removeLabel={t("list.remove")}
                      readOnly={readOnly}
                      renderItem={(kw, idx) => (
                        <Input
                          value={kw}
                          disabled={readOnly}
                          placeholder={t("fields.keywordPlaceholder")}
                          aria-label={`${t("fields.keywords")} ${idx + 1}`}
                          onChange={(e) => {
                            const next = [...keywordsList];
                            next[idx] = e.target.value;
                            form.setField(
                              "keywords",
                              setLocalizedStringList(
                                values.keywords,
                                activeLocale,
                                next,
                              ),
                            );
                          }}
                        />
                      )}
                    />
                    <LocalizedFieldReference
                      activeLocale={activeLocale}
                      spanishOriginal={
                        keywordsEs.length > 0 ? keywordsEs.join(", ") : undefined
                      }
                      isEnglishEmpty={keywordsList.every(
                        (k) => k.trim().length === 0,
                      )}
                      readOnly={readOnly}
                      onCopyFromSpanish={() =>
                        form.setField(
                          "keywords",
                          setLocalizedStringList(values.keywords, "en-US", [
                            ...keywordsEs,
                          ]),
                        )
                      }
                    />
                  </Field>
              </SermonSeoDetails>
            </div>
          </SermonEmbeddedMediaContext.Provider>
        );
      }}
      renderGeneralFields={({
        activeLocale,
        values,
        form,
        readOnly,
        isPublished,
        getError,
      }) => {
        const audioDoc = values.audioMediaId
          ? mediaMap[values.audioMediaId]
          : undefined;
        const audioHasStoredDuration =
          audioDoc !== undefined && audioDoc.durationSeconds !== undefined;
        const effectiveAudioLanguages = normalizeSermonAudioLanguages(
          values.audioLanguages,
        );

        const toggleAudioLanguage = (lang: Locale, checked: boolean) => {
          const nextSet = new Set<Locale>(effectiveAudioLanguages);
          if (checked) {
            nextSet.add(lang);
          } else {
            nextSet.delete(lang);
          }
          // Preserve ICR-146 semantics: never allow empty (default back to es-AR)
          const nextList: Locale[] =
            nextSet.size > 0
              ? (["es-AR", "en-US"] as const).filter((l) => nextSet.has(l))
              : ["es-AR"];
          form.setField("audioLanguages", nextList);
        };

        return (
          <div className="space-y-4">
            {/* Fecha */}
            <Field
              label={t("fields.sermonDate")}
              htmlFor="sermon-date"
              fieldPath="sermonDate"
              requiredToPublish
              requiredMarkLabel={tContent("errors.requiredMark")}
              error={getError("sermonDate")}
            >
              <Input
                id="sermon-date"
                type="date"
                value={values.sermonDate ? values.sermonDate.slice(0, 10) : ""}
                disabled={readOnly}
                onChange={(e) =>
                  form.setField("sermonDate", e.target.value || undefined)
                }
              />
            </Field>

            {/* Dirección (slug) */}
            <SlugField
              id="sermon-slug"
              label={t("fields.slug")}
              prefix="predicas/"
              value={values.slug ?? ""}
              autoSource={values.title?.["es-AR"] ?? ""}
              isPublished={isPublished}
              readOnly={readOnly}
              requiredToPublish
              fieldPath="slug"
              error={getError("slug")}
              warningBodyOverride={t("fields.slugWarning")}
              onChange={(next) => form.setField("slug", next || undefined)}
            />

            {/* Predicador */}
            <SermonAuthorField
              label={t("fields.preacher")}
              fieldPath="preacherId"
              value={values.preacherId}
              initialOption={
                values.preacherId
                  ? (initialAuthors[values.preacherId] ?? null)
                  : null
              }
              requiredToPublish
              readOnly={readOnly}
              error={getError("preacherId")}
              onChange={(nextId) => {
                form.setField("preacherId", nextId);
                if (
                  nextId &&
                  values.additionalPreacherIds?.includes(nextId)
                ) {
                  form.setField(
                    "additionalPreacherIds",
                    values.additionalPreacherIds.filter((id) => id !== nextId),
                  );
                }
              }}
            />

            {/* Predicadores adicionales */}
            <SermonAdditionalPreachersField
              value={values.additionalPreacherIds ?? []}
              primaryPreacherId={values.preacherId}
              initialOptions={initialAuthors}
              readOnly={readOnly}
              onChange={(next) =>
                form.setField(
                  "additionalPreacherIds",
                  next.length > 0 ? next : undefined,
                )
              }
            />

            {/* Intérprete */}
            <SermonAuthorField
              label={t("fields.interpreter")}
              fieldPath="interpreterId"
              value={values.interpreterId}
              initialOption={
                values.interpreterId
                  ? (initialAuthors[values.interpreterId] ?? null)
                  : null
              }
              readOnly={readOnly}
              onChange={(nextId) => form.setField("interpreterId", nextId)}
            />

            {/* Citas bíblicas */}
            <SermonScriptureField
              value={values.scriptureRefIds ?? []}
              activeLocale={activeLocale}
              initialVerses={initialVerses}
              usageCountsByVerseId={verseUsageCounts}
              canCreate={permissions.canWrite}
              readOnly={readOnly}
              error={getError("scriptureRefIds")}
              onChange={(next) =>
                form.setField(
                  "scriptureRefIds",
                  next.length > 0 ? next : undefined,
                )
              }
            />

            {/* Imagen destacada */}
            <Field
              label={t("fields.featuredImage")}
              fieldPath="featuredImageId"
              requiredToPublish
              requiredMarkLabel={tContent("errors.requiredMark")}
              error={getError("featuredImageId")}
            >
              <MediaField
                accept="image"
                value={values.featuredImageId}
                initialDoc={
                  values.featuredImageId
                    ? (mediaMap[values.featuredImageId] ?? null)
                    : null
                }
                canUpload={canManageMedia}
                readOnly={readOnly}
                onChange={(nextId) => form.setField("featuredImageId", nextId)}
                onSelectDoc={(doc) => {
                  if (doc) handleMediaResolved(doc);
                }}
              />
            </Field>

            {/* Audio */}
            <Field
              label={t("fields.audio")}
              fieldPath="audioMediaId"
              error={getError("audioMediaId")}
            >
              <MediaField
                accept="audio"
                value={values.audioMediaId}
                initialDoc={audioDoc ?? null}
                canUpload={canManageMedia}
                readOnly={readOnly}
                onChange={(nextId) => form.setField("audioMediaId", nextId)}
                onSelectDoc={(doc) => {
                  if (!doc) {
                    form.setField("durationSeconds", undefined);
                    return;
                  }
                  handleMediaResolved(doc);
                  // Edge Case #5: duration follows the newly selected audio file
                  form.setField("durationSeconds", doc.durationSeconds);
                }}
              />
            </Field>

            {/* Idiomas del audio */}
            <Field
              label={t("fields.audioLanguages")}
              fieldPath="audioLanguages"
              hint={t("fields.audioLanguagesHint")}
              error={getError("audioLanguages")}
            >
              <div className="flex flex-wrap gap-4 pt-1">
                <Checkbox
                  id="sermon-audio-lang-es"
                  checked={effectiveAudioLanguages.includes("es-AR")}
                  disabled={readOnly}
                  onChange={(e) =>
                    toggleAudioLanguage("es-AR", e.target.checked)
                  }
                  label={t("fields.audioLanguagesEs")}
                />
                <Checkbox
                  id="sermon-audio-lang-en"
                  checked={effectiveAudioLanguages.includes("en-US")}
                  disabled={readOnly}
                  onChange={(e) =>
                    toggleAudioLanguage("en-US", e.target.checked)
                  }
                  label={t("fields.audioLanguagesEn")}
                />
              </div>
            </Field>

            {/* Duración */}
            {audioHasStoredDuration ? (
              <Field
                label={t("fields.duration")}
                fieldPath="durationSeconds"
                hint={t("fields.durationFromAudio")}
              >
                <div
                  data-testid="sermon-duration-readonly"
                  className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
                >
                  {formatDuration(
                    values.durationSeconds ?? audioDoc!.durationSeconds!,
                  )}{" "}
                  (
                  {t("fields.durationMinutes", {
                    minutes: Math.max(
                      1,
                      Math.round(
                        (values.durationSeconds ?? audioDoc!.durationSeconds!) /
                          60,
                      ),
                    ),
                  })}
                  )
                </div>
              </Field>
            ) : (
              <Field
                label={t("fields.durationSecondsLabel")}
                htmlFor="sermon-duration-seconds"
                fieldPath="durationSeconds"
                hint={t("fields.durationManualHint")}
                error={getError("durationSeconds")}
              >
                <Input
                  id="sermon-duration-seconds"
                  type="number"
                  min={0}
                  max={86400}
                  disabled={readOnly}
                  value={
                    values.durationSeconds !== undefined
                      ? String(values.durationSeconds)
                      : ""
                  }
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (!raw) {
                      form.setField("durationSeconds", undefined);
                      return;
                    }
                    const parsed = Number(raw);
                    if (Number.isFinite(parsed) && parsed >= 0) {
                      form.setField("durationSeconds", Math.round(parsed));
                    }
                  }}
                />
              </Field>
            )}

            {/* Prédicas relacionadas (máx. 3) */}
            <SermonRelatedPicker
              value={values.relatedSermonIds ?? []}
              currentSermonId={persistedDocId}
              initialOptions={initialRelatedSermons}
              readOnly={readOnly}
              onChange={(next) =>
                form.setField(
                  "relatedSermonIds",
                  next.length > 0 ? next : undefined,
                )
              }
            />
          </div>
        );
      }}
    />
  );
}
