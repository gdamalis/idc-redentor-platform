"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { isAllowedHref } from "@idcr/content";
import { Button } from "@src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@src/components/ui/dialog";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BARE_DOMAIN_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/.*)?$/i;

/**
 * Normalizes editor-typed link inputs (`F-editor-ux-decisions.md` §2.6):
 * - Bare email -> `mailto:<email>`
 * - Bare domain -> `https://<domain>`
 * - Keeps `/...`, `https://...`, `http://...`, `mailto:...` as is.
 * Validates the result against `@idcr/content`'s `isAllowedHref`.
 */
export function normalizeUserHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (EMAIL_PATTERN.test(trimmed)) {
    candidate = `mailto:${trimmed}`;
  } else if (
    !trimmed.startsWith("/") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(trimmed) &&
    BARE_DOMAIN_PATTERN.test(trimmed)
  ) {
    candidate = `https://${trimmed}`;
  }

  return isAllowedHref(candidate) ? candidate : null;
}

export interface LinkDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialHref: string;
  readonly isEditing: boolean;
  readonly needsLinkText: boolean;
  readonly onSave: (href: string, text?: string) => void;
  readonly onRemove?: () => void;
}

/**
 * Link editor dialog with its own isolated `<form>` that calls
 * `e.stopPropagation()` so pressing Enter inside the portal NEVER submits the
 * outer entry form (`H-reference-editor-lessons.md` #2, `ICR-197` Edge case #2).
 */
export function LinkDialog({
  open,
  onOpenChange,
  initialHref,
  isEditing,
  needsLinkText,
  onSave,
  onRemove,
}: LinkDialogProps) {
  const t = useTranslations("content.richText.linkDialog");
  const tAction = useTranslations("content.action");
  const tCommon = useTranslations("common");
  const [href, setHref] = React.useState(initialHref);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (open) {
      setHref(initialHref);
      setText("");
      setError(undefined);
    }
  }, [initialHref, open]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const normalized = normalizeUserHref(href);
    if (!normalized) {
      setError(t("invalidHref"));
      return;
    }

    onSave(normalized, needsLinkText ? text.trim() || normalized : undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tCommon("close")}>
        <DialogHeader>
          <DialogTitle>{isEditing ? t("editTitle") : t("title")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label={t("hrefLabel")} htmlFor="rt-link-href" error={error}>
            <Input
              id="rt-link-href"
              value={href}
              onChange={(e) => {
                setHref(e.target.value);
                if (error) setError(undefined);
              }}
              placeholder={t("hrefPlaceholder")}
              autoFocus
            />
          </Field>

          {needsLinkText && (
            <Field label={t("textLabel")} htmlFor="rt-link-text">
              <Input
                id="rt-link-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("textPlaceholder")}
              />
            </Field>
          )}

          <DialogFooter className="sm:justify-between">
            <div>
              {isEditing && onRemove && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    onRemove();
                    onOpenChange(false);
                  }}
                >
                  {t("remove")}
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {tAction("cancel")}
              </Button>
              <Button type="submit">{t("save")}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
