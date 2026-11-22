"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@idcr/ui";
import { Button } from "@src/components/ui/button";

export interface ActionMenuItem {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly variant?: "default" | "destructive";
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

export interface ActionMenuProps {
  readonly triggerLabel: string;
  readonly items: readonly ActionMenuItem[];
  readonly align?: "start" | "center" | "end";
}

/**
 * Shared `"⋯"` action menu built on `@radix-ui/react-dropdown-menu`
 * (`F-editor-ux-decisions.md` §7 #5). Renders nothing when `items` is empty.
 */
export function ActionMenu({
  triggerLabel,
  items,
  align = "end",
}: ActionMenuProps) {
  const didSelectItemRef = React.useRef(false);

  if (items.length === 0) return null;

  return (
    <DropdownMenuPrimitive.Root modal={false}>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={triggerLabel}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          sideOffset={4}
          onCloseAutoFocus={(event) => {
            if (didSelectItemRef.current) {
              // Prevent focus return to the trigger button from racing with a
              // Dialog opened by the selected action (Radix focusOutside bug).
              event.preventDefault();
              didSelectItemRef.current = false;
            }
          }}
          className="z-50 min-w-52 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {items.map((item) => (
            <DropdownMenuPrimitive.Item
              key={item.id}
              disabled={item.disabled}
              onSelect={() => {
                if (!item.disabled) {
                  didSelectItemRef.current = true;
                  window.setTimeout(() => {
                    item.onSelect();
                  }, 0);
                }
              }}
              className={cn(
                "relative flex cursor-pointer select-none flex-col rounded-sm px-2.5 py-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                item.variant === "destructive" &&
                  "text-destructive focus:bg-destructive/10 focus:text-destructive",
              )}
            >
              <span>{item.label}</span>
              {item.hint && (
                <span className="text-xs text-muted-foreground">
                  {item.hint}
                </span>
              )}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
