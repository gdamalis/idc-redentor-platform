"use client";

import * as React from "react";
import { Button } from "@src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@src/components/ui/dialog";

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly closeLabel: string;
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  readonly variant?: "default" | "destructive";
  readonly isPending?: boolean;
  readonly confirmDisabled?: boolean;
  readonly hideCancel?: boolean;
  readonly onConfirm: () => void;
  readonly children?: React.ReactNode;
}

/**
 * Shared confirmation dialog primitive (`F-editor-ux-decisions.md` §7 #4).
 * Publish, Discard, Unpublish, Delete, Conflict, In-use, and Unsaved-leave
 * dialogs are all instances of this primitive.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  cancelLabel,
  confirmLabel,
  variant = "default",
  isPending = false,
  confirmDisabled = false,
  hideCancel = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={closeLabel}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {children && <div className="space-y-3 text-sm">{children}</div>}

        <DialogFooter>
          {!hideCancel && (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
          )}
          <Button
            type="button"
            variant={variant === "destructive" ? "destructive" : "default"}
            disabled={isPending || confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
