"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { Locale, Localized } from "@idcr/content";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { SortableList } from "@src/components/content/sortable-list";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";

export interface KeywordsFieldProps {
  readonly activeLocale: Locale;
  readonly value?: Localized<string[]>;
  readonly onChange: (next: Localized<string[]> | undefined) => void;
  readonly readOnly?: boolean;
  readonly error?: string;
}

export function KeywordsField({
  activeLocale,
  value,
  onChange,
  readOnly = false,
  error,
}: KeywordsFieldProps) {
  const t = useTranslations("content");
  const tEd = useTranslations("contentEditorial");

  const currentItems = value?.[activeLocale] ?? [];
  const spanishItems = value?.["es-AR"] ?? [];

  const updateLocaleItems = (nextItems: string[]) => {
    const nextEs = activeLocale === "es-AR" ? nextItems : spanishItems;
    const nextEn = activeLocale === "en-US" ? nextItems : value?.["en-US"];

    if (nextEs.length === 0 && (!nextEn || nextEn.length === 0)) {
      onChange(undefined);
      return;
    }

    onChange({
      "es-AR": nextEs,
      ...(nextEn && nextEn.length > 0 ? { "en-US": nextEn } : {}),
    });
  };

  return (
    <Field
      label={tEd("posts.keywordsLabel")}
      fieldPath={`keywords.${activeLocale}`}
      error={error}
    >
      <SortableList
        items={currentItems}
        getKey={(_item, idx) => `${activeLocale}-kw-${idx}`}
        onChange={updateLocaleItems}
        onAdd={() => updateLocaleItems([...currentItems, ""])}
        addLabel={tEd("posts.keywordsAdd")}
        moveUpLabel={t("action.moveUp")}
        moveDownLabel={t("action.moveDown")}
        removeLabel={t("action.remove")}
        emptyMessage={tEd("posts.keywordsEmpty")}
        readOnly={readOnly}
        renderItem={(item, idx) => (
          <Input
            value={item}
            disabled={readOnly}
            placeholder={tEd("posts.keywordsPlaceholder")}
            onChange={(e) => {
              const next = [...currentItems];
              next[idx] = e.target.value;
              updateLocaleItems(next);
            }}
          />
        )}
      />

      <LocalizedFieldReference
        activeLocale={activeLocale}
        spanishOriginal={
          spanishItems.length > 0 ? spanishItems.join(", ") : undefined
        }
        isEnglishEmpty={currentItems.length === 0}
        readOnly={readOnly}
        onCopyFromSpanish={
          spanishItems.length > 0
            ? () => updateLocaleItems([...spanishItems])
            : undefined
        }
      />
    </Field>
  );
}
