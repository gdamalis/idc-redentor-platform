"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  searchContentEntriesAction,
  type ContentPickerOption,
} from "@src/app/[locale]/(app)/content/actions";
import { PickerDialog } from "@src/components/content/picker-dialog";
import { SortableList } from "@src/components/content/sortable-list";
import { StatusChip } from "@src/components/content/status-chip";
import { Field } from "@src/components/ui/field";
import { formatShortDate } from "@src/lib/content/status-helpers";
import { MAX_RELATED_POSTS } from "@src/service/content/editorial/editorial-rules";
import type { RelatedPostSummary } from "@src/service/content/editorial/editorial-loaders.service";

export interface RelatedPostsFieldProps {
  readonly docId?: string;
  readonly value: readonly string[];
  readonly initialPosts?: readonly RelatedPostSummary[];
  readonly onChange: (nextIds: string[] | undefined) => void;
  readonly readOnly?: boolean;
  readonly error?: string;
}

export function RelatedPostsField({
  docId,
  value,
  initialPosts = [],
  onChange,
  readOnly = false,
  error,
}: RelatedPostsFieldProps) {
  const t = useTranslations("content");
  const tEd = useTranslations("contentEditorial");
  const tCommon = useTranslations("common");
  const panelLocale = useLocale();

  const [cache, setCache] = React.useState<Record<string, RelatedPostSummary>>(
    () => {
      const map: Record<string, RelatedPostSummary> = {};
      for (const item of initialPosts) map[item.id] = item;
      return map;
    },
  );
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<readonly ContentPickerOption[]>([]);
  const [draftSelection, setDraftSelection] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoading(true);
    void searchContentEntriesAction({
      collection: "posts",
      query: query.trim() || undefined,
      excludeId: docId,
    }).then((res) => {
      if (cancelled) return;
      if (res.ok) setOptions(res.items);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [docId, open, query]);

  const handleOpen = () => {
    setDraftSelection([...value]);
    setQuery("");
    setOpen(true);
  };

  const handleConfirm = (ids: string[]) => {
    setOpen(false);
    const deduped = Array.from(new Set(ids)).filter((id) => id !== docId);
    setCache((prev) => {
      const next = { ...prev };
      for (const opt of options) {
        if (deduped.includes(opt.id)) {
          next[opt.id] = {
            id: opt.id,
            title: opt.label,
            status: opt.status,
            publishedDate: opt.secondary?.split(" · ")[0],
          };
        }
      }
      return next;
    });
    onChange(deduped.length > 0 ? deduped : undefined);
  };

  return (
    <>
      <Field
        label={tEd("posts.relatedPostsLabel")}
        fieldPath="relatedPostIds"
        hint={tEd("posts.relatedPostsHint")}
        error={error}
      >
        <SortableList
          items={value}
          getKey={(id) => id}
          onChange={(next) => onChange(next.length > 0 ? next : undefined)}
          onAdd={handleOpen}
          addLabel={tEd("posts.relatedPostsAdd")}
          maxItems={MAX_RELATED_POSTS}
          moveUpLabel={t("action.moveUp")}
          moveDownLabel={t("action.moveDown")}
          removeLabel={t("action.remove")}
          emptyMessage={tEd("posts.relatedPostsEmpty")}
          readOnly={readOnly}
          renderItem={(id) => {
            const summary = cache[id];
            return (
              <div className="space-y-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {summary?.title ?? id}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {summary && (
                    <StatusChip
                      status={summary.status}
                      label={t(`status.${summary.status}`)}
                    />
                  )}
                  {summary?.publishedDate && (
                    <span>
                      {formatShortDate(summary.publishedDate, panelLocale)}
                    </span>
                  )}
                </div>
                {summary?.status === "draft" && (
                  <p className="text-xs italic text-muted-foreground">
                    {tEd("posts.relatedPostsUnpublishedNote")}
                  </p>
                )}
              </div>
            );
          }}
        />
      </Field>

      <PickerDialog
        open={open}
        onOpenChange={setOpen}
        title={tEd("posts.relatedPostsPickerTitle")}
        closeLabel={tCommon("close")}
        cancelLabel={t("action.cancel")}
        confirmLabel={t("picker.confirm")}
        searchPlaceholder={tEd("posts.relatedPostsSearchPlaceholder")}
        searchQuery={query}
        onSearchChange={setQuery}
        items={options}
        getKey={(item) => item.id}
        selectedIds={draftSelection}
        onSelectionChange={setDraftSelection}
        multiple
        maxSelect={MAX_RELATED_POSTS}
        isLoading={isLoading}
        emptyMessage={tEd("posts.relatedPostsPickerEmpty")}
        footerSummary={t("picker.selectedCount", {
          count: draftSelection.length,
        })}
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
