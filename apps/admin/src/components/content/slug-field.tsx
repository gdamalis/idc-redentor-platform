"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { slugify } from "@idcr/content";
import { Button } from "@src/components/ui/button";
import { ConfirmDialog } from "@src/components/ui/confirm-dialog";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";

export interface SlugFieldProps {
  readonly id?: string;
  readonly label: string;
  readonly prefix?: string;
  readonly value: string;
  readonly onChange: (next: string) => void;
  /** Optional source title used to auto-generate slug while never published and untouched. */
  readonly autoSource?: string;
  readonly isPublished: boolean;
  readonly readOnly?: boolean;
  readonly requiredToPublish?: boolean;
  readonly fieldPath?: string;
  readonly error?: string;
  readonly warningBodyOverride?: string;
}

/**
 * Shared slug control (`F-editor-ux-decisions.md` §2.2, `ICR-197` Scope):
 * - Auto-fills from `autoSource` until first publish (or manual edit).
 * - Once published, locks behind a `"Cambiar"` confirmation dialog explaining
 *   that old links stop working and likes reset to zero.
 */
export function SlugField({
  id = "slug",
  label,
  prefix,
  value,
  onChange,
  autoSource,
  isPublished,
  readOnly = false,
  requiredToPublish = true,
  fieldPath = "slug",
  error,
  warningBodyOverride,
}: SlugFieldProps) {
  const t = useTranslations("content");
  const tCommon = useTranslations("common");
  const [manuallyEdited, setManuallyEdited] = React.useState(Boolean(value));
  const [unlocked, setUnlocked] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    if (isPublished || readOnly || manuallyEdited || !autoSource) return;
    const next = slugify(autoSource);
    if (next && next !== value) {
      onChange(next);
    }
  }, [autoSource, isPublished, manuallyEdited, onChange, readOnly, value]);

  const isLocked = isPublished && !unlocked;

  return (
    <>
      <Field
        label={label}
        htmlFor={id}
        fieldPath={fieldPath}
        requiredToPublish={requiredToPublish}
        requiredMarkLabel={t("errors.requiredMark")}
        error={error}
      >
        {isLocked ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-foreground">
              <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">
                {prefix ? `${prefix}${value}` : value}
              </span>
            </span>
            {!readOnly && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2.5 text-xs"
                onClick={() => setConfirmOpen(true)}
              >
                {t("action.change")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {prefix && (
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {prefix}
              </span>
            )}
            <Input
              id={id}
              value={value}
              disabled={readOnly}
              onChange={(e) => {
                setManuallyEdited(true);
                onChange(e.target.value);
              }}
              className="font-mono text-xs"
              placeholder="mi-entrada"
            />
          </div>
        )}
      </Field>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("dialogs.slugChange.title")}
        description={warningBodyOverride ?? t("dialogs.slugChange.body")}
        closeLabel={tCommon("close")}
        cancelLabel={t("action.cancel")}
        confirmLabel={t("dialogs.slugChange.confirm")}
        variant="destructive"
        onConfirm={() => {
          setUnlocked(true);
          setManuallyEdited(true);
          setConfirmOpen(false);
        }}
      />
    </>
  );
}
