"use client";

import * as React from "react";
import Image from "next/image";
import { User, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  searchContentEntriesAction,
  type ContentPickerOption,
} from "@src/app/[locale]/(app)/content/actions";
import { PickerDialog } from "@src/components/content/picker-dialog";
import { StatusChip } from "@src/components/content/status-chip";
import { Button } from "@src/components/ui/button";
import { Field } from "@src/components/ui/field";
import { buildPersonInitials } from "@src/service/content/editorial/editorial-rules";
import type { AuthorSummary } from "@src/service/content/editorial/editorial-loaders.service";

export interface AuthorPickerFieldProps {
  readonly value?: string;
  readonly initialAuthor?: AuthorSummary | null;
  readonly onChange: (authorId: string | undefined) => void;
  readonly readOnly?: boolean;
  readonly requiredToPublish?: boolean;
  readonly error?: string;
}

export function AuthorPickerField({
  value,
  initialAuthor = null,
  onChange,
  readOnly = false,
  requiredToPublish = false,
  error,
}: AuthorPickerFieldProps) {
  const t = useTranslations("content");
  const tEd = useTranslations("contentEditorial");
  const tCommon = useTranslations("common");

  const [selected, setSelected] = React.useState<AuthorSummary | null>(
    initialAuthor,
  );
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<readonly ContentPickerOption[]>([]);
  const [draftSelection, setDraftSelection] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!value) {
      setSelected(null);
    } else if (initialAuthor && initialAuthor.id === value) {
      setSelected(initialAuthor);
    } else if (selected && selected.id !== value) {
      setSelected(null);
    }
  }, [initialAuthor, selected, value]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    void searchContentEntriesAction({
      collection: "authors",
      query: query.trim() || undefined,
    }).then((res) => {
      if (cancelled) return;
      if (res.ok) setOptions(res.items);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  const handleOpen = () => {
    setDraftSelection(value ? [value] : []);
    setQuery("");
    setOpen(true);
  };

  const handleConfirm = (ids: string[]) => {
    const pickedId = ids[0];
    setOpen(false);
    if (!pickedId) return;
    const opt = options.find((o) => o.id === pickedId);
    if (opt) {
      setSelected({
        id: opt.id,
        name: opt.label,
        status: opt.status,
      });
    }
    onChange(pickedId);
  };

  const activeSelected = selected?.id === value ? selected : null;
  const displayName = activeSelected?.name ?? value ?? "";

  return (
    <>
      <Field
        label={tEd("posts.authorLabel")}
        fieldPath="authorId"
        requiredToPublish={requiredToPublish}
        requiredMarkLabel={t("errors.requiredMark")}
        error={error}
      >
        {!value ? (
          <Button
            type="button"
            variant="outline"
            disabled={readOnly}
            onClick={handleOpen}
            className="w-full justify-center sm:w-auto"
          >
            <User className="size-4" aria-hidden="true" />
            <span>{tEd("posts.authorChoose")}</span>
          </Button>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              {activeSelected?.avatarUrl ? (
                <div className="relative size-8 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
                  <Image
                    src={activeSelected.avatarUrl}
                    alt={displayName}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
              ) : (
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
                  aria-hidden="true"
                >
                  {buildPersonInitials(displayName)}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">
                  {displayName}
                </div>
                {activeSelected && (
                  <div className="mt-0.5">
                    <StatusChip
                      status={activeSelected.status}
                      label={t(`status.${activeSelected.status}`)}
                    />
                  </div>
                )}
              </div>
            </div>

            {!readOnly && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpen}
                >
                  {tEd("posts.authorChange")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label={t("action.remove")}
                  onClick={() => {
                    setSelected(null);
                    onChange(undefined);
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Field>

      <PickerDialog
        open={open}
        onOpenChange={setOpen}
        title={tEd("posts.authorPickerTitle")}
        closeLabel={tCommon("close")}
        cancelLabel={t("action.cancel")}
        confirmLabel={t("picker.confirm")}
        searchPlaceholder={tEd("posts.authorSearchPlaceholder")}
        searchQuery={query}
        onSearchChange={setQuery}
        items={options}
        getKey={(item) => item.id}
        selectedIds={draftSelection}
        onSelectionChange={setDraftSelection}
        isLoading={isLoading}
        emptyMessage={tEd("posts.authorEmpty")}
        onConfirm={handleConfirm}
        renderItem={(item) => (
          <div className="flex items-center justify-between gap-2 pr-6">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {item.label}
              </div>
              {item.secondary && (
                <div className="truncate text-xs text-muted-foreground">
                  {item.secondary}
                </div>
              )}
            </div>
            <StatusChip
              status={item.status}
              label={t(`status.${item.status}`)}
            />
          </div>
        )}
      />
    </>
  );
}
