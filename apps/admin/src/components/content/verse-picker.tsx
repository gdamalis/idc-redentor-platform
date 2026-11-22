"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import type { BibleVerseFields, Locale } from "@idcr/content";
import {
  BIBLE_BOOKS,
  BIBLE_VERSIONS_EN,
  BIBLE_VERSIONS_ES,
  DEFAULT_BIBLE_VERSION_EN,
  DEFAULT_BIBLE_VERSION_ES,
  buildVersionOptions,
  findCanonicalBibleBook,
  formatVerseChipLabel,
  getVerseVersionLabel,
} from "@src/lib/content/bible-books";
import {
  createOrReuseBibleVerseAction,
  searchBibleVersesAction,
  type BibleVersePickerItem,
} from "@src/app/[locale]/(app)/content/actions";
import { Button } from "@src/components/ui/button";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Notice } from "@src/components/ui/notice";
import { Select } from "@src/components/ui/select";
import { Textarea } from "@src/components/ui/textarea";
import { PickerDialog } from "./picker-dialog";
import { StatusChip } from "./status-chip";

export interface VersePickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly selectedVerseId?: string;
  readonly canCreate?: boolean;
  /** Optional usage count warning when editing a shared verse. */
  readonly sharedUsageCount?: number;
  readonly onSelect: (verse: BibleVersePickerItem) => void;
}

/**
 * Shared Bible verse picker built on `PickerDialog` (`ICR-197` Scope #11,
 * consumed by `ICR-198` beliefs/contact form and `ICR-200` sermons).
 *
 * - Searches existing verses in ES or EN, displaying each verse's actual stored
 *   version label (never a fixed NVI/NIV).
 * - Creates a new verse using the canonical 66-book list and stored version
 *   options (`NVI`/`RVR1960` es, `NIV`/`KJV` en); reuses an existing verse on a
 *   Spanish version-scoped natural-key match without creating duplicates.
 * - Zero external Bible API calls.
 */
export function VersePicker({
  open,
  onOpenChange,
  selectedVerseId,
  canCreate = true,
  sharedUsageCount = 0,
  onSelect,
}: VersePickerProps) {
  const t = useTranslations("content");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;

  const [tab, setTab] = React.useState<"search" | "create">("search");
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<readonly BibleVersePickerItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>(
    selectedVerseId ? [selectedVerseId] : [],
  );

  // Create form state
  const [bookEs, setBookEs] = React.useState(BIBLE_BOOKS[42]!.es); // Juan
  const [chapter, setChapter] = React.useState("3");
  const [fromVerse, setFromVerse] = React.useState("16");
  const [toVerse, setToVerse] = React.useState("");
  const [versionEs, setVersionEs] = React.useState<string>(
    DEFAULT_BIBLE_VERSION_ES,
  );
  const [versionEn, setVersionEn] = React.useState<string>(
    DEFAULT_BIBLE_VERSION_EN,
  );
  const [textEs, setTextEs] = React.useState("");
  const [textEn, setTextEn] = React.useState("");
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [reusedNotice, setReusedNotice] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSelectedIds(selectedVerseId ? [selectedVerseId] : []);
    setReusedNotice(false);
    setCreateError(null);
  }, [open, selectedVerseId]);

  React.useEffect(() => {
    if (!open || tab !== "search") return;
    let active = true;
    setIsLoading(true);
    void searchBibleVersesAction({ query }).then((res) => {
      if (!active) return;
      setIsLoading(false);
      if (res.ok) {
        setItems(res.items);
      }
    });
    return () => {
      active = false;
    };
  }, [open, query, tab]);

  const handleConfirmExisting = (ids: string[]) => {
    const picked = items.find((item) => item.id === ids[0]);
    if (!picked) return;
    onSelect(picked);
    onOpenChange(false);
  };

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setCreateError(null);
    setReusedNotice(false);

    const canonical = findCanonicalBibleBook(bookEs);
    const chNum = Number(chapter);
    const fromNum = Number(fromVerse);
    const toNum = toVerse.trim() ? Number(toVerse) : undefined;

    if (
      !canonical ||
      !Number.isInteger(chNum) ||
      chNum < 1 ||
      !Number.isInteger(fromNum) ||
      fromNum < 1 ||
      (toNum !== undefined && (!Number.isInteger(toNum) || toNum < fromNum))
    ) {
      setCreateError(t("errors.genericField"));
      return;
    }

    const draft: BibleVerseFields = {
      book: { "es-AR": canonical.es, "en-US": canonical.en },
      chapter: chNum,
      fromVerse: fromNum,
      ...(toNum !== undefined && { toVerse: toNum }),
      version: {
        "es-AR": versionEs,
        ...(versionEn.trim() ? { "en-US": versionEn } : {}),
      },
      ...(textEs.trim() || textEn.trim()
        ? {
            text: {
              "es-AR": textEs.trim(),
              ...(textEn.trim() ? { "en-US": textEn.trim() } : {}),
            },
          }
        : {}),
    };

    setIsCreating(true);
    try {
      const res = await createOrReuseBibleVerseAction({ draft });
      if (!res.ok) {
        setCreateError(t("errors.genericAction"));
        return;
      }
      if (res.reused) {
        setReusedNotice(true);
      }
      onSelect(res.verse);
      onOpenChange(false);
    } finally {
      setIsCreating(false);
    }
  };

  const esVersionOptions = buildVersionOptions(BIBLE_VERSIONS_ES, versionEs);
  const enVersionOptions = buildVersionOptions(BIBLE_VERSIONS_EN, versionEn);

  const headerSlot = (
    <div className="space-y-2">
      {sharedUsageCount > 0 && (
        <Notice variant="warning">
          {t("verses.sharedWarning", { count: sharedUsageCount })}
        </Notice>
      )}
      {canCreate && (
        <div role="tablist" className="inline-flex rounded-md border border-border bg-muted/40 p-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "search"}
            onClick={() => setTab("search")}
            className={`cursor-pointer rounded-sm px-3 py-1 text-xs font-medium ${
              tab === "search"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("verses.tabSearch")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "create"}
            onClick={() => setTab("create")}
            className={`cursor-pointer rounded-sm px-3 py-1 text-xs font-medium ${
              tab === "create"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("verses.tabCreate")}
          </button>
        </div>
      )}
    </div>
  );

  const createBody = (
    <form onSubmit={(e) => void handleCreateSubmit(e)} className="space-y-4">
      {reusedNotice && (
        <Notice variant="info">{t("verses.reusedExisting")}</Notice>
      )}
      {createError && <Notice variant="error">{createError}</Notice>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Field label={t("verses.fields.book")} htmlFor="vp-book" className="sm:col-span-2">
          <Select
            id="vp-book"
            value={bookEs}
            onChange={(e) => setBookEs(e.target.value)}
          >
            {BIBLE_BOOKS.map((book) => (
              <option key={book.order} value={book.es}>
                {locale === "en-US" ? book.en : book.es}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("verses.fields.chapter")} htmlFor="vp-chapter">
          <Input
            id="vp-chapter"
            type="number"
            min={1}
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("verses.fields.fromVerse")} htmlFor="vp-from">
            <Input
              id="vp-from"
              type="number"
              min={1}
              value={fromVerse}
              onChange={(e) => setFromVerse(e.target.value)}
            />
          </Field>
          <Field label={t("verses.fields.toVerse")} htmlFor="vp-to">
            <Input
              id="vp-to"
              type="number"
              min={1}
              value={toVerse}
              onChange={(e) => setToVerse(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("verses.fields.versionEs")} htmlFor="vp-ver-es">
          <Select
            id="vp-ver-es"
            value={versionEs}
            onChange={(e) => setVersionEs(e.target.value)}
          >
            {esVersionOptions.map((ver) => (
              <option key={ver} value={ver}>
                {ver}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("verses.fields.versionEn")} htmlFor="vp-ver-en">
          <Select
            id="vp-ver-en"
            value={versionEn}
            onChange={(e) => setVersionEn(e.target.value)}
          >
            {enVersionOptions.map((ver) => (
              <option key={ver} value={ver}>
                {ver}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t("verses.fields.textEs")} htmlFor="vp-text-es">
        <Textarea
          id="vp-text-es"
          value={textEs}
          onChange={(e) => setTextEs(e.target.value)}
        />
      </Field>

      <Field label={t("verses.fields.textEn")} htmlFor="vp-text-en">
        <Textarea
          id="vp-text-en"
          value={textEn}
          onChange={(e) => setTextEn(e.target.value)}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          disabled={isCreating}
          onClick={() => onOpenChange(false)}
        >
          {t("action.cancel")}
        </Button>
        <Button type="submit" disabled={isCreating}>
          {t("verses.createAndUse")}
        </Button>
      </div>
    </form>
  );

  return (
    <PickerDialog<BibleVersePickerItem>
      open={open}
      onOpenChange={onOpenChange}
      title={t("verses.pickerTitle")}
      closeLabel={tCommon("close")}
      cancelLabel={t("action.cancel")}
      confirmLabel={t("verses.useVerse")}
      searchPlaceholder={t("verses.searchPlaceholder")}
      searchQuery={query}
      onSearchChange={setQuery}
      items={items}
      getKey={(item) => item.id}
      selectedIds={selectedIds}
      onSelectionChange={setSelectedIds}
      isLoading={isLoading}
      emptyMessage={t("verses.noResults")}
      headerSlot={headerSlot}
      customBody={tab === "create" ? createBody : undefined}
      hideFooter={tab === "create"}
      onConfirm={handleConfirmExisting}
      renderItem={(item) => (
        <div className="space-y-1 pr-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {formatVerseChipLabel(item.fields, locale)}
            </span>
            <StatusChip
              status={item.status}
              label={t(`status.${item.status}`)}
            />
          </div>
          {item.fields.text?.[locale] || item.fields.text?.["es-AR"] ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {item.fields.text?.[locale] || item.fields.text?.["es-AR"]}
            </p>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            {getVerseVersionLabel(item.fields, locale)}
          </p>
        </div>
      )}
    />
  );
}
