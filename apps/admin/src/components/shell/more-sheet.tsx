"use client";

import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@src/components/ui/dialog";

interface MoreSheetProps {
  readonly triggerLabel: string;
  readonly title: string;
  readonly closeLabel: string;
  readonly children: ReactNode;
}

/**
 * Overflow nav for the bottom tab bar. Owns disclosure state ONLY — the links
 * themselves are server-rendered by MobileNav and passed in as `children`, so
 * no nav data or icon component ever crosses the RSC boundary.
 *
 * Built on the shared Radix Dialog for a real focus trap + Escape handling;
 * the className override displaces the primitive's centered geometry into a
 * bottom sheet (cn() is tailwind-merge, so the later values win).
 */
export function MoreSheet({
  triggerLabel,
  title,
  closeLabel,
  children,
}: MoreSheetProps) {
  return (
    <Dialog>
      <DialogTrigger className="flex h-full min-h-11 flex-col items-center justify-center gap-1 text-xs font-medium text-foreground/70 transition-colors hover:text-foreground">
        <MoreHorizontal className="h-5 w-5 shrink-0" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent
        closeLabel={closeLabel}
        className="bottom-0 left-0 top-auto max-w-none translate-x-0 translate-y-0 gap-2 rounded-b-none rounded-t-xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <DialogTitle>{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
