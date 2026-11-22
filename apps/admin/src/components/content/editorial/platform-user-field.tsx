"use client";

import * as React from "react";
import { Link2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { searchPlatformUsersAction } from "@src/app/[locale]/(app)/content/authors/actions";
import { PickerDialog } from "@src/components/content/picker-dialog";
import { Button } from "@src/components/ui/button";
import { Field } from "@src/components/ui/field";
import type { LinkedPlatformUser } from "@src/service/content/editorial/editorial-loaders.service";

export interface PlatformUserFieldProps {
  readonly value?: string;
  readonly initialUser?: LinkedPlatformUser | null;
  readonly canReadUsers: boolean;
  readonly onChange: (userId: string | undefined) => void;
  readonly readOnly?: boolean;
  readonly error?: string;
}

/**
 * Optional link from an `author` to a platform `AdminUser` (`userId` plain string).
 * Strictly honors `users:read`: editors without `users:read` never query
 * `admin.users` and see only a safe ID indicator / clear action.
 */
export function PlatformUserField({
  value,
  initialUser = null,
  canReadUsers,
  onChange,
  readOnly = false,
  error,
}: PlatformUserFieldProps) {
  const t = useTranslations("content");
  const tEd = useTranslations("contentEditorial");
  const tCommon = useTranslations("common");

  const [selected, setSelected] = React.useState<LinkedPlatformUser | null>(
    initialUser,
  );
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState<readonly LinkedPlatformUser[]>([]);
  const [draftSelection, setDraftSelection] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (!value) {
      setSelected(null);
    } else if (initialUser && initialUser.id === value) {
      setSelected(initialUser);
    }
  }, [initialUser, value]);

  React.useEffect(() => {
    if (!open || !canReadUsers) return;
    let cancelled = false;
    setIsLoading(true);
    void searchPlatformUsersAction({
      query: query.trim() || undefined,
    }).then((res) => {
      if (cancelled) return;
      if (res.ok) setOptions(res.items);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [canReadUsers, open, query]);

  const handleOpen = () => {
    setDraftSelection(value ? [value] : []);
    setQuery("");
    setOpen(true);
  };

  const handleConfirm = (ids: string[]) => {
    const pickedId = ids[0];
    setOpen(false);
    if (!pickedId) return;
    const hit = options.find((u) => u.id === pickedId) ?? null;
    setSelected(hit);
    onChange(pickedId);
  };

  return (
    <>
      <Field
        label={tEd("authors.userIdLabel")}
        fieldPath="userId"
        hint={
          canReadUsers
            ? tEd("authors.userIdHint")
            : tEd("authors.userIdNoPermission")
        }
        error={error}
      >
        {!canReadUsers ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            <span className="truncate font-mono text-xs">
              {value
                ? tEd("authors.userIdLinkedId", { id: value })
                : tEd("authors.notLinked")}
            </span>
            {value && !readOnly && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => onChange(undefined)}
              >
                {t("action.remove")}
              </Button>
            )}
          </div>
        ) : !value ? (
          <Button
            type="button"
            variant="outline"
            disabled={readOnly}
            onClick={handleOpen}
            className="w-full justify-center sm:w-auto"
          >
            <Link2 className="size-4" aria-hidden="true" />
            <span>{tEd("authors.userChoose")}</span>
          </Button>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {selected?.displayName || selected?.email || value}
              </div>
              {selected?.displayName && (
                <div className="truncate text-xs text-muted-foreground">
                  {selected.email}
                </div>
              )}
            </div>

            {!readOnly && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleOpen}
                >
                  {tEd("authors.userChange")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label={t("action.remove")}
                  onClick={() => {
                    setSelected(null);
                    onChange(undefined);
                  }}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Field>

      {canReadUsers && (
        <PickerDialog
          open={open}
          onOpenChange={setOpen}
          title={tEd("authors.userPickerTitle")}
          closeLabel={tCommon("close")}
          cancelLabel={t("action.cancel")}
          confirmLabel={t("picker.confirm")}
          searchPlaceholder={tEd("authors.userSearchPlaceholder")}
          searchQuery={query}
          onSearchChange={setQuery}
          items={options}
          getKey={(u) => u.id}
          selectedIds={draftSelection}
          onSelectionChange={setDraftSelection}
          isLoading={isLoading}
          emptyMessage={tEd("authors.userEmpty")}
          onConfirm={handleConfirm}
          renderItem={(user) => (
            <div className="min-w-0 pr-6">
              <div className="truncate text-sm font-medium text-foreground">
                {user.displayName || user.email}
              </div>
              {user.displayName && (
                <div className="truncate text-xs text-muted-foreground">
                  {user.email}
                </div>
              )}
            </div>
          )}
        />
      )}
    </>
  );
}
