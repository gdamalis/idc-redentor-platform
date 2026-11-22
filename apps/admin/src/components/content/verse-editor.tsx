"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import type { BibleVerseFields, ContentStatus, Locale } from "@idcr/content";
import {
  BIBLE_BOOKS,
  BIBLE_VERSIONS_EN,
  BIBLE_VERSIONS_ES,
  DEFAULT_BIBLE_VERSION_EN,
  DEFAULT_BIBLE_VERSION_ES,
  buildVersionOptions,
  findCanonicalBibleBook,
  formatVerseChipLabel,
} from "@src/lib/content/bible-books";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Notice } from "@src/components/ui/notice";
import { Select } from "@src/components/ui/select";
import { Textarea } from "@src/components/ui/textarea";
import { EntryEditor } from "./entry-editor";
import type { EntryEditorPermissions } from "./entry-editor-types";
import { LocalizedFieldReference } from "./localized-field";

export interface VerseEditorProps {
  readonly docId?: string;
  readonly initialDoc?: SerializedContentDoc<BibleVerseFields>;
  readonly initialStatus: ContentStatus;
  readonly permissions: EntryEditorPermissions;
  readonly isTrialMode: boolean;
  readonly usageCount?: number;
}

const DEFAULT_VERSE_DRAFT: BibleVerseFields = {
  book: { "es-AR": "Juan", "en-US": "John" },
  chapter: 3,
  fromVerse: 16,
  version: {
    "es-AR": DEFAULT_BIBLE_VERSION_ES,
    "en-US": DEFAULT_BIBLE_VERSION_EN,
  },
  text: { "es-AR": "" },
};

/**
 * Full Bible verse editor behind `/content/verses/[id]` and `/content/verses/new`
 * (`ICR-197` Scope #11), built on `EntryEditor<BibleVerseFields>`.
 */
export function VerseEditor({
  docId,
  initialDoc,
  initialStatus,
  permissions,
  isTrialMode,
  usageCount = 0,
}: VerseEditorProps) {
  const t = useTranslations("content");
  const panelLocale = useLocale() as Locale;
  const initialValues = initialDoc?.draft ?? DEFAULT_VERSE_DRAFT;

  return (
    <EntryEditor<BibleVerseFields>
      collection="bible_verses"
      docId={docId}
      initialDoc={initialDoc}
      initialStatus={initialStatus}
      initialValues={initialValues}
      backHref="/content/verses"
      backLabel={t("types.verses")}
      getTitle={(v) => formatVerseChipLabel(v, panelLocale)}
      permissions={permissions}
      isTrialMode={isTrialMode}
      topNotices={
        usageCount > 0 ? (
          <Notice variant="warning">
            {t("verses.sharedWarning", { count: usageCount })}
          </Notice>
        ) : undefined
      }
      renderLocalizedFields={({ activeLocale, values, form, readOnly, getError }) => {
        const versionOptions =
          activeLocale === "es-AR"
            ? buildVersionOptions(BIBLE_VERSIONS_ES, values.version?.["es-AR"])
            : buildVersionOptions(BIBLE_VERSIONS_EN, values.version?.["en-US"]);

        const currentVersion =
          values.version?.[activeLocale] ??
          (activeLocale === "es-AR"
            ? DEFAULT_BIBLE_VERSION_ES
            : DEFAULT_BIBLE_VERSION_EN);

        const currentText = values.text?.[activeLocale] ?? "";

        return (
          <div className="space-y-5">
            <Field
              label={
                activeLocale === "es-AR"
                  ? t("verses.fields.versionEs")
                  : t("verses.fields.versionEn")
              }
              htmlFor={`verse-version-${activeLocale}`}
              fieldPath={`version.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={t("errors.requiredMark")}
              error={
                getError(`version.${activeLocale}`) ?? getError("version")
              }
            >
              <Select
                id={`verse-version-${activeLocale}`}
                disabled={readOnly}
                value={currentVersion}
                onChange={(e) => {
                  const nextVersion = {
                    "es-AR":
                      values.version?.["es-AR"] ?? DEFAULT_BIBLE_VERSION_ES,
                    ...(values.version?.["en-US"]
                      ? { "en-US": values.version["en-US"] }
                      : {}),
                    [activeLocale]: e.target.value,
                  };
                  form.setField("version", nextVersion);
                }}
              >
                {versionOptions.map((ver) => (
                  <option key={ver} value={ver}>
                    {ver}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={t("verses.fields.text")}
              htmlFor={`verse-text-${activeLocale}`}
              fieldPath={`text.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={t("errors.requiredMark")}
              error={getError(`text.${activeLocale}`) ?? getError("text")}
            >
              <Textarea
                id={`verse-text-${activeLocale}`}
                disabled={readOnly}
                rows={5}
                value={currentText}
                placeholder={
                  activeLocale === "en-US" ? values.text?.["es-AR"] : undefined
                }
                onChange={(e) => {
                  form.setField("text", {
                    "es-AR": values.text?.["es-AR"] ?? "",
                    ...(values.text?.["en-US"] !== undefined
                      ? { "en-US": values.text["en-US"] }
                      : {}),
                    [activeLocale]: e.target.value,
                  });
                }}
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={values.text?.["es-AR"]}
                isEnglishEmpty={!currentText.trim()}
                readOnly={readOnly}
                onCopyFromSpanish={() => {
                  const es = values.text?.["es-AR"] ?? "";
                  form.setField("text", { "es-AR": es, "en-US": es });
                }}
              />
            </Field>
          </div>
        );
      }}
      renderGeneralFields={({ values, form, readOnly, getError }) => {
        const currentBookEs = values.book["es-AR"];
        const bookInCanonical = BIBLE_BOOKS.some((b) => b.es === currentBookEs);

        return (
          <div className="space-y-4">
            <Field
              label={t("verses.fields.book")}
              htmlFor="verse-book"
              fieldPath="book.es-AR"
              requiredToPublish
              requiredMarkLabel={t("errors.requiredMark")}
              error={getError("book.es-AR") ?? getError("book")}
            >
              <Select
                id="verse-book"
                disabled={readOnly}
                value={currentBookEs}
                onChange={(e) => {
                  const selected = findCanonicalBibleBook(e.target.value);
                  form.setField(
                    "book",
                    selected
                      ? { "es-AR": selected.es, "en-US": selected.en }
                      : { "es-AR": e.target.value },
                  );
                }}
              >
                {!bookInCanonical && currentBookEs && (
                  <option value={currentBookEs}>{currentBookEs}</option>
                )}
                {BIBLE_BOOKS.map((book) => (
                  <option key={book.order} value={book.es}>
                    {panelLocale === "en-US" ? book.en : book.es}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={t("verses.fields.chapter")}
              htmlFor="verse-chapter"
              fieldPath="chapter"
              requiredToPublish
              requiredMarkLabel={t("errors.requiredMark")}
              error={getError("chapter")}
            >
              <Input
                id="verse-chapter"
                type="number"
                min={1}
                disabled={readOnly}
                value={values.chapter}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  if (Number.isFinite(parsed)) {
                    form.setField("chapter", parsed);
                  }
                }}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t("verses.fields.fromVerse")}
                htmlFor="verse-from"
                fieldPath="fromVerse"
                requiredToPublish
                requiredMarkLabel={t("errors.requiredMark")}
                error={getError("fromVerse")}
              >
                <Input
                  id="verse-from"
                  type="number"
                  min={1}
                  disabled={readOnly}
                  value={values.fromVerse}
                  onChange={(e) => {
                    const parsed = Number(e.target.value);
                    if (Number.isFinite(parsed)) {
                      form.setField("fromVerse", parsed);
                    }
                  }}
                />
              </Field>

              <Field
                label={t("verses.fields.toVerse")}
                htmlFor="verse-to"
                fieldPath="toVerse"
                error={getError("toVerse")}
              >
                <Input
                  id="verse-to"
                  type="number"
                  min={1}
                  disabled={readOnly}
                  value={values.toVerse ?? ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    form.setField(
                      "toVerse",
                      raw ? Number(raw) : undefined,
                    );
                  }}
                />
              </Field>
            </div>
          </div>
        );
      }}
    />
  );
}
