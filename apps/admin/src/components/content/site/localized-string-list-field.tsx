"use client";

import { useTranslations } from "next-intl";
import type { Locale, Localized } from "@idcr/content";
import { Input } from "@src/components/ui/input";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { SortableList } from "@src/components/content/sortable-list";

export interface LocalizedStringListFieldProps {
  readonly activeLocale: Locale;
  readonly value?: Localized<string[]>;
  readonly addLabel: string;
  readonly placeholder?: string;
  readonly emptyMessage?: string;
  readonly maxItems?: number;
  readonly readOnly?: boolean;
  readonly idPrefix: string;
  readonly onChange: (next: Localized<string[]> | undefined) => void;
}

/**
 * Reorderable localized string-array editor (`SortableList` + `LocalizedFieldReference`),
 * shared by `SeoEntryEditor` (`keywords`) and `ContactFormEditor` (`fields[].values`).
 */
export function LocalizedStringListField({
  activeLocale,
  value,
  addLabel,
  placeholder,
  emptyMessage,
  maxItems = 100,
  readOnly = false,
  idPrefix,
  onChange,
}: LocalizedStringListFieldProps) {
  const tCommon = useTranslations("contentSite.common");

  const esItems = value?.["es-AR"] ?? [];
  const currentItems =
    activeLocale === "es-AR" ? esItems : (value?.["en-US"] ?? []);

  const commitLocaleItems = (nextLocaleItems: string[]) => {
    const nextEs = activeLocale === "es-AR" ? nextLocaleItems : esItems;
    const nextEn =
      activeLocale === "en-US" ? nextLocaleItems : value?.["en-US"];
    const hasEn = nextEn !== undefined && nextEn.length > 0;
    if (nextEs.length === 0 && !hasEn) {
      onChange(undefined);
      return;
    }
    onChange(
      hasEn ? { "es-AR": nextEs, "en-US": nextEn } : { "es-AR": nextEs },
    );
  };

  const handleUpdateItem = (index: number, nextValue: string) => {
    const next = [...currentItems];
    next[index] = nextValue;
    commitLocaleItems(next);
  };

  const handleAdd = () => {
    commitLocaleItems([...currentItems, ""]);
  };

  const spanishOriginal =
    esItems.filter((item) => item.trim().length > 0).join(" · ") || undefined;
  const isEnglishEmpty =
    activeLocale === "en-US" &&
    currentItems.every((item) => item.trim().length === 0);

  return (
    <div className="space-y-2">
      <SortableList<string>
        items={currentItems}
        getKey={(_item, idx) => `${idPrefix}-${activeLocale}-${idx}`}
        onChange={commitLocaleItems}
        onAdd={handleAdd}
        addLabel={addLabel}
        maxItems={maxItems}
        moveUpLabel={tCommon("moveUp")}
        moveDownLabel={tCommon("moveDown")}
        removeLabel={tCommon("remove")}
        emptyMessage={emptyMessage}
        readOnly={readOnly}
        renderItem={(item, index) => (
          <Input
            id={`${idPrefix}-${activeLocale}-${index}`}
            disabled={readOnly}
            value={item}
            placeholder={
              activeLocale === "en-US" && esItems[index]
                ? esItems[index]
                : placeholder
            }
            onChange={(e) => handleUpdateItem(index, e.target.value)}
          />
        )}
      />

      <LocalizedFieldReference
        activeLocale={activeLocale}
        spanishOriginal={spanishOriginal}
        isEnglishEmpty={isEnglishEmpty}
        readOnly={readOnly}
        onCopyFromSpanish={() => {
          const copied = esItems.filter((s) => s.trim().length > 0);
          onChange({ "es-AR": esItems, "en-US": [...copied] });
        }}
      />
    </div>
  );
}
