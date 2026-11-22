"use client";

import { useTranslations } from "next-intl";
import type { ContentReferenceUsage } from "@src/lib/content/errors";
import { ConfirmDialog } from "@src/components/ui/confirm-dialog";

export interface InUseDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly entryTitle: string;
  readonly usedBy: readonly ContentReferenceUsage[];
}

/** Refusal dialog listing every entry referencing the target (no override — `F` §2.2). */
export function InUseDialog({
  open,
  onOpenChange,
  entryTitle,
  usedBy,
}: InUseDialogProps) {
  const t = useTranslations("content");
  const tCommon = useTranslations("common");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("dialogs.inUse.title")}
      description={t("dialogs.inUse.body", {
        title: entryTitle,
        list: usedBy.map((u) => u.label).join(", "),
      })}
      closeLabel={tCommon("close")}
      cancelLabel={t("action.cancel")}
      confirmLabel={t("dialogs.inUse.confirm")}
      hideCancel
      onConfirm={() => onOpenChange(false)}
    />
  );
}
