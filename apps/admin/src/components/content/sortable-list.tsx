"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { cn } from "@idcr/ui";
import { Button } from "@src/components/ui/button";

export interface SortableListProps<T> {
  readonly items: readonly T[];
  readonly getKey: (item: T, index: number) => string;
  readonly onChange: (next: T[]) => void;
  readonly renderItem: (item: T, index: number) => React.ReactNode;
  readonly onAdd?: () => void;
  readonly addLabel?: string;
  readonly maxItems?: number;
  readonly moveUpLabel: string;
  readonly moveDownLabel: string;
  readonly removeLabel: string;
  readonly emptyMessage?: string;
  readonly readOnly?: boolean;
  readonly className?: string;
}

/**
 * Reorderable list with explicit Add / Move Up / Move Down / Remove controls
 * (zero drag-and-drop library — `F-editor-ux-decisions.md` §7 #7).
 */
export function SortableList<T>({
  items,
  getKey,
  onChange,
  renderItem,
  onAdd,
  addLabel,
  maxItems,
  moveUpLabel,
  moveDownLabel,
  removeLabel,
  emptyMessage,
  readOnly = false,
  className,
}: SortableListProps<T>) {
  const handleMove = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onChange(next);
  };

  const handleRemove = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange(next);
  };

  const canAdd =
    !readOnly &&
    onAdd !== undefined &&
    (maxItems === undefined || items.length < maxItems);

  return (
    <div className={cn("space-y-2", className)}>
      {items.length === 0 && emptyMessage && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}

      {items.length > 0 && (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <li
              key={getKey(item, index)}
              className="flex items-start gap-2 rounded-md border border-border bg-background p-2.5"
            >
              <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
              {!readOnly && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={index === 0}
                    aria-label={moveUpLabel}
                    onClick={() => handleMove(index, index - 1)}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={index === items.length - 1}
                    aria-label={moveDownLabel}
                    onClick={() => handleMove(index, index + 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive hover:text-destructive"
                    aria-label={removeLabel}
                    onClick={() => handleRemove(index)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {canAdd && addLabel && (
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}
