"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Locale } from "@idcr/content";
import { Link } from "@src/i18n/routing";
import { formatVerseChipLabel } from "@src/lib/content/bible-books";
import type { BibleVersePickerItem } from "@src/app/[locale]/(app)/content/actions";
import { Button } from "@src/components/ui/button";
import { Field } from "@src/components/ui/field";
import { SortableList } from "@src/components/content/sortable-list";
import { VersePicker } from "@src/components/content/verse-picker";

export interface SermonScriptureFieldProps {
  readonly value: readonly string[];
  readonly activeLocale: Locale;
  readonly initialVerses: readonly BibleVersePickerItem[];
  readonly usageCountsByVerseId?: Readonly<Record<string, number>>;
  readonly canCreate: boolean;
  readonly readOnly: boolean;
  readonly error?: string;
  readonly onChange: (nextIds: string[]) => void;
}

/**
 * Reorderable Bible scripture reference chips (`ICR-200` AC2, `F` §2.10):
 * - Displays each verse's REAL stored version label for `activeLocale` verbatim
 *   (e.g. `"RVR1960"`, `"KJV"`, `"RVR"`, trailing spaces — never a fixed NVI/NIV).
 * - Uses `ICR-197`'s `VersePicker` (version-scoped lookup-or-create without duplicates).
 * - Editing a chip passes `sharedUsageCount` to show the shared-usage warning and
 *   offers a direct link to edit the shared verse record.
 */
export function SermonScriptureField({
  value,
  activeLocale,
  initialVerses,
  usageCountsByVerseId = {},
  canCreate,
  readOnly,
  error,
  onChange,
}: SermonScriptureFieldProps) {
  const t = useTranslations("contentSermons.fields");
  const tList = useTranslations("contentSermons.list");
  const tContent = useTranslations("content");

  const [versesById, setVersesById] = React.useState<
    Readonly<Record<string, BibleVersePickerItem>>
  >(() => {
    const map: Record<string, BibleVersePickerItem> = {};
    for (const v of initialVerses) map[v.id] = v;
    return map;
  });

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);

  const handleOpenAdd = () => {
    setEditingIndex(null);
    setPickerOpen(true);
  };

  const handleOpenReplace = (index: number) => {
    setEditingIndex(index);
    setPickerOpen(true);
  };

  const handleSelectVerse = (picked: BibleVersePickerItem) => {
    setVersesById((prev) => ({ ...prev, [picked.id]: picked }));

    if (editingIndex !== null) {
      const next = [...value];
      // Prevent duplicate if user picked a verse already elsewhere in the list
      const existingIdx = next.indexOf(picked.id);
      if (existingIdx !== -1 && existingIdx !== editingIndex) {
        next.splice(editingIndex, 1);
      } else {
        next[editingIndex] = picked.id;
      }
      onChange(next);
      return;
    }

    if (value.includes(picked.id)) return;
    onChange([...value, picked.id]);
  };

  const activeEditingId =
    editingIndex !== null ? value[editingIndex] : undefined;
  const activeSharedCount = activeEditingId
    ? (usageCountsByVerseId[activeEditingId] ?? 0)
    : 0;

  return (
    <>
      <Field
        label={t("scriptureReferences")}
        fieldPath="scriptureRefIds"
        error={error}
      >
        <SortableList<string>
          items={value}
          getKey={(id) => id}
          onChange={onChange}
          onAdd={handleOpenAdd}
          addLabel={t("addVerse")}
          emptyMessage={t("noVerses")}
          moveUpLabel={tList("moveUp")}
          moveDownLabel={tList("moveDown")}
          removeLabel={tList("remove")}
          readOnly={readOnly}
          renderItem={(verseId, index) => {
            const verse = versesById[verseId];
            const label = verse
              ? formatVerseChipLabel(verse.fields, activeLocale)
              : verseId;
            return (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className="text-sm font-medium text-foreground"
                  data-testid={`scripture-chip-${verseId}`}
                >
                  {label}
                </span>
                {!readOnly && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleOpenReplace(index)}
                    >
                      {tContent("action.change")}
                    </Button>
                    <Link
                      href={`/content/verses/${verseId}`}
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="size-3" aria-hidden="true" />
                      {t("editVerseLink")}
                    </Link>
                  </div>
                )}
              </div>
            );
          }}
        />
      </Field>

      <VersePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedVerseId={activeEditingId}
        canCreate={canCreate}
        sharedUsageCount={activeSharedCount}
        onSelect={handleSelectVerse}
      />
    </>
  );
}
