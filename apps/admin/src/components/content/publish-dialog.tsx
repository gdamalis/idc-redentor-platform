"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@src/components/ui/confirm-dialog";
import { TrialModeBanner } from "./trial-mode-banner";
import type { PublishDialogContext } from "./entry-editor-types";

export interface PublishDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly context: PublishDialogContext;
  readonly appearsOn?: readonly string[];
  readonly extras?: React.ReactNode;
  readonly isPending: boolean;
  readonly onConfirm: () => void;
}

/**
 * Always-confirm publish dialog (`F-editor-ux-decisions.md` §2.2, §2.3, §4.3):
 * lists trial-mode banner (when active), affected pages, cascade-published
 * verses/authors, missing-English notice, and domain-specific slots (`ICR-199`/`200`).
 */
export function PublishDialog({
  open,
  onOpenChange,
  title,
  context,
  appearsOn,
  extras,
  isPending,
  onConfirm,
}: PublishDialogProps) {
  const t = useTranslations("content");
  const tCommon = useTranslations("common");

  const dialogTitle = context.isFirstPublish
    ? t("dialogs.publishFirst.title", { title })
    : t("dialogs.publishChanges.title", { title });
  const dialogBody = context.isFirstPublish
    ? t("dialogs.publishFirst.body")
    : t("dialogs.publishChanges.body");

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={dialogTitle}
      description={dialogBody}
      closeLabel={tCommon("close")}
      cancelLabel={t("action.cancel")}
      confirmLabel={
        isPending ? t("action.publishing") : t("dialogs.publish.confirm")
      }
      isPending={isPending}
      onConfirm={onConfirm}
    >
      {context.isTrialMode && (
        <TrialModeBanner message={t("trial.banner")} />
      )}

      {appearsOn && appearsOn.length > 0 && (
        <p className="text-muted-foreground">
          {t("dialogs.publish.appearsOn", { pages: appearsOn.join(", ") })}
        </p>
      )}

      {extras}

      {(context.willCascade.length > 0 || context.missingEnCount > 0) && (
        <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
          {context.willCascade.length > 0 && (
            <li>
              {t("dialogs.publish.cascade", {
                list: context.willCascade.map((c) => c.label).join(", "),
              })}
            </li>
          )}
          {context.missingEnCount > 0 && (
            <li>
              {t("dialogs.publish.missingEnglish", {
                count: context.missingEnCount,
              })}
            </li>
          )}
        </ul>
      )}
    </ConfirmDialog>
  );
}
