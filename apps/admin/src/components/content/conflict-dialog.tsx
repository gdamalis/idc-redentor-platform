"use client";

import { useLocale, useTranslations } from "next-intl";
import { Button } from "@src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@src/components/ui/dialog";
import { formatAdminTimestamp } from "@src/lib/content/status-helpers";

export interface ConflictInfo {
  readonly updatedBy: string;
  readonly updatedByLabel?: string;
  readonly updatedAt: string;
  readonly currentRevision: number;
}

export interface ConflictDialogProps {
  readonly conflict: ConflictInfo | null;
  readonly onOpenChange: (open: boolean) => void;
  readonly isPending: boolean;
  readonly onReload: () => void;
  readonly onOverwrite: () => void;
}

/**
 * Optimistic-lock conflict dialog (`F-editor-ux-decisions.md` §2.3, `ICR-197` AC3):
 * offers Reload (preserving local recovery) or explicit Overwrite (destructive).
 */
export function ConflictDialog({
  conflict,
  onOpenChange,
  isPending,
  onReload,
  onOverwrite,
}: ConflictDialogProps) {
  const t = useTranslations("content");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const name = conflict?.updatedByLabel || conflict?.updatedBy || "";
  const when = conflict
    ? formatAdminTimestamp(conflict.updatedAt, locale)
    : "";

  return (
    <Dialog open={conflict !== null} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon("close")}>
        <DialogHeader>
          <DialogTitle>{t("dialogs.conflict.title")}</DialogTitle>
          <DialogDescription>
            {t("dialogs.conflict.body", { name, when })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={onReload}
          >
            {t("dialogs.conflict.reload")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={onOverwrite}
          >
            {t("dialogs.conflict.overwrite")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
