"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@idcr/ui";
import { Button } from "@src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@src/components/ui/dialog";
import { Input } from "@src/components/ui/input";

export interface PickerDialogProps<T> {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly closeLabel: string;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  readonly searchPlaceholder?: string;
  readonly searchQuery?: string;
  readonly onSearchChange?: (query: string) => void;
  readonly items: readonly T[];
  readonly getKey: (item: T) => string;
  readonly renderItem: (item: T, selected: boolean) => React.ReactNode;
  readonly selectedIds: readonly string[];
  readonly onSelectionChange: (ids: string[]) => void;
  readonly multiple?: boolean;
  readonly maxSelect?: number;
  readonly layout?: "list" | "grid";
  readonly isLoading?: boolean;
  readonly emptyMessage?: string;
  readonly hasMore?: boolean;
  readonly loadMoreLabel?: string;
  readonly onLoadMore?: () => void;
  /** Optional top tabs slot (e.g. Biblioteca / Subir in ICR-196 or Search / Create in VersePicker). */
  readonly headerSlot?: React.ReactNode;
  /** Optional custom body replacing the standard search+items view (e.g. upload or create tab). */
  readonly customBody?: React.ReactNode;
  /** Optional preview / summary slot in the sticky footer. */
  readonly footerSummary?: React.ReactNode;
  /** Hide default Cancel / Confirm footer when `customBody` supplies its own submit controls. */
  readonly hideFooter?: boolean;
  /** Optional extra disable condition on the confirm button (e.g. undescribed image in ICR-196). */
  readonly confirmDisabled?: boolean;
  readonly onConfirm: (selectedIds: string[]) => void;
}

/**
 * Shared search + list/grid picker dialog (`F-editor-ux-decisions.md` §7 #8).
 * Full-screen on phones, wide dialog on desktop. Base for `VersePicker`,
 * people/related-entry pickers (`ICR-199`/`200`), and `MediaPicker` (`ICR-196`).
 */
export function PickerDialog<T>({
  open,
  onOpenChange,
  title,
  closeLabel,
  cancelLabel,
  confirmLabel,
  searchPlaceholder,
  searchQuery,
  onSearchChange,
  items,
  getKey,
  renderItem,
  selectedIds,
  onSelectionChange,
  multiple = false,
  maxSelect,
  layout = "list",
  isLoading = false,
  emptyMessage,
  hasMore = false,
  loadMoreLabel,
  onLoadMore,
  headerSlot,
  customBody,
  footerSummary,
  hideFooter = false,
  confirmDisabled = false,
  onConfirm,
}: PickerDialogProps<T>) {
  const toggleItem = (id: string) => {
    if (!multiple) {
      onSelectionChange([id]);
      return;
    }
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((existing) => existing !== id));
      return;
    }
    if (maxSelect !== undefined && selectedIds.length >= maxSelect) {
      return;
    }
    onSelectionChange([...selectedIds, id]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={closeLabel}
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 rounded-none p-0 sm:h-auto sm:max-h-[85vh] sm:max-w-3xl sm:rounded-md"
      >
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          {headerSlot && <div className="pt-2">{headerSlot}</div>}
        </DialogHeader>

        {customBody ? (
          <div className="flex-1 overflow-y-auto px-5 py-4">{customBody}</div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {onSearchChange && (
              <div className="border-b border-border px-5 py-3">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={searchQuery ?? ""}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="pl-9"
                  />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {isLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  …
                </div>
              ) : items.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </div>
              ) : (
                <div
                  className={cn(
                    layout === "grid"
                      ? "grid grid-cols-2 gap-3 sm:grid-cols-4"
                      : "flex flex-col gap-2",
                  )}
                >
                  {items.map((item) => {
                    const id = getKey(item);
                    const selected = selectedIds.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleItem(id)}
                        className={cn(
                          "relative cursor-pointer rounded-md border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:bg-muted/50",
                        )}
                      >
                        {selected && (
                          <span
                            className="absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                            aria-hidden="true"
                          >
                            <Check className="size-3" />
                          </span>
                        )}
                        {renderItem(item, selected)}
                      </button>
                    );
                  })}
                </div>
              )}

              {hasMore && onLoadMore && loadMoreLabel && (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onLoadMore}
                  >
                    {loadMoreLabel}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {!hideFooter && (
          <div className="flex flex-col gap-3 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-xs text-muted-foreground">
              {footerSummary}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {cancelLabel}
              </Button>
              <Button
                type="button"
                disabled={selectedIds.length === 0 || confirmDisabled}
                onClick={() => onConfirm([...selectedIds])}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
