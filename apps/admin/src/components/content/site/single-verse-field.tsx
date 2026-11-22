"use client";

import * as React from "react";
import { BookOpen } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@idcr/content";
import type { BibleVersePickerItem } from "@src/app/[locale]/(app)/content/actions";
import { formatVerseChipLabel } from "@src/lib/content/bible-books";
import { Button } from "@src/components/ui/button";
import { StatusChip } from "@src/components/content/status-chip";
import { VersePicker } from "@src/components/content/verse-picker";

export interface SingleVerseFieldProps {
  readonly value?: string;
  readonly initialVerse?: BibleVersePickerItem | null;
  readonly readOnly?: boolean;
  readonly onChange: (verseId: string | undefined) => void;
  readonly onVerseLoaded?: (verse: BibleVersePickerItem) => void;
}

/**
 * Single-verse field wrapping `ICR-197`'s `VersePicker` (consumed by
 * `BeliefCollectionEditor` items and `ContactFormEditor.bibleVerseId`).
 *
 * - Renders the verse's actual stored version label verbatim via
 *   `formatVerseChipLabel` (never a hard-coded NVI/NIV).
 * - Removing a verse unlinks `bibleVerseId` only and NEVER deletes the verse
 *   record (`ICR-198` Edge Case 3).
 */
export function SingleVerseField({
  value,
  initialVerse = null,
  readOnly = false,
  onChange,
  onVerseLoaded,
}: SingleVerseFieldProps) {
  const tSite = useTranslations("contentSite.verseField");
  const tContent = useTranslations("content");
  const locale = (useLocale() === "en-US" ? "en-US" : "es-AR") as Locale;

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [selectedVerse, setSelectedVerse] =
    React.useState<BibleVersePickerItem | null>(initialVerse);

  React.useEffect(() => {
    if (!value) {
      setSelectedVerse(null);
      return;
    }
    if (initialVerse && initialVerse.id === value) {
      setSelectedVerse(initialVerse);
    }
  }, [initialVerse, value]);

  const handleSelect = (verse: BibleVersePickerItem) => {
    setSelectedVerse(verse);
    onVerseLoaded?.(verse);
    onChange(verse.id);
  };

  const handleRemove = () => {
    setSelectedVerse(null);
    onChange(undefined);
  };

  const previewText = selectedVerse
    ? selectedVerse.fields.text?.[locale] ||
      selectedVerse.fields.text?.["es-AR"]
    : undefined;

  return (
    <div className="space-y-2">
      {!value ? (
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? (
            <p className="text-xs text-muted-foreground">{tSite("empty")}</p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
            >
              <BookOpen className="mr-1.5 size-4" aria-hidden="true" />
              {tSite("choose")}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                <BookOpen
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                {selectedVerse
                  ? formatVerseChipLabel(selectedVerse.fields, locale)
                  : value}
              </span>
              {selectedVerse && (
                <StatusChip
                  status={selectedVerse.status}
                  label={tContent(`status.${selectedVerse.status}`)}
                />
              )}
            </div>
            {previewText && (
              <p className="line-clamp-2 text-xs italic text-muted-foreground">
                “{previewText}”
              </p>
            )}
          </div>

          {!readOnly && (
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPickerOpen(true)}
              >
                {tSite("change")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
              >
                {tSite("remove")}
              </Button>
            </div>
          )}
        </div>
      )}

      {!readOnly && (
        <VersePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          selectedVerseId={value}
          canCreate={!readOnly}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}
