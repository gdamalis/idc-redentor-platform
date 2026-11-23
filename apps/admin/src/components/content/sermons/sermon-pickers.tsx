"use client";

import * as React from "react";
import { User, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  searchContentEntriesAction,
  type ContentPickerOption,
} from "@src/app/[locale]/(app)/content/actions";
import { Button } from "@src/components/ui/button";
import { Field } from "@src/components/ui/field";
import { PickerDialog } from "@src/components/content/picker-dialog";
import { SortableList } from "@src/components/content/sortable-list";
import { StatusChip } from "@src/components/content/status-chip";

const MAX_RELATED_SERMONS = 3;
const EMPTY_IDS: readonly string[] = [];

export interface SermonAuthorFieldProps {
  readonly label: string;
  readonly fieldPath: string;
  readonly value?: string;
  readonly initialOption?: ContentPickerOption | null;
  readonly excludeIds?: readonly string[];
  readonly requiredToPublish?: boolean;
  readonly readOnly: boolean;
  readonly error?: string;
  readonly onChange: (nextId: string | undefined) => void;
}

/** Single-select person picker for `preacherId` and `interpreterId`. */
export function SermonAuthorField({
  label,
  fieldPath,
  value,
  initialOption = null,
  excludeIds = EMPTY_IDS,
  requiredToPublish = false,
  readOnly,
  error,
  onChange,
}: SermonAuthorFieldProps) {
  const t = useTranslations("contentSermons.fields");
  const tList = useTranslations("contentSermons.list");
  const tContent = useTranslations("content");
  const tCommon = useTranslations("common");

  const [knownById, setKnownById] = React.useState<
    Readonly<Record<string, ContentPickerOption>>
  >(() => (initialOption ? { [initialOption.id]: initialOption } : {}));
  const [selectedOption, setSelectedOption] =
    React.useState<ContentPickerOption | null>(initialOption);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<readonly ContentPickerOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [draftSelection, setDraftSelection] = React.useState<string[]>(
    value ? [value] : [],
  );

  React.useEffect(() => {
    if (initialOption) {
      setKnownById((prev) =>
        prev[initialOption.id] === initialOption
          ? prev
          : { ...prev, [initialOption.id]: initialOption },
      );
    }
  }, [initialOption]);

  React.useEffect(() => {
    if (!value) {
      setSelectedOption(null);
      return;
    }
    setSelectedOption((prev) => {
      if (prev?.id === value) return prev;
      if (initialOption?.id === value) return initialOption;
      return knownById[value] ?? null;
    });
  }, [initialOption, knownById, value]);

  React.useEffect(() => {
    if (!open) return;
    setDraftSelection(value ? [value] : []);
  }, [open, value]);

  const excludeKey = excludeIds.join("\u0000");

  React.useEffect(() => {
    if (!open) return;
    let active = true;
    setIsLoading(true);
    void searchContentEntriesAction({ collection: "authors", query }).then(
      (res) => {
        if (!active) return;
        setIsLoading(false);
        if (res.ok) {
          const excluded = new Set(excludeKey ? excludeKey.split("\u0000") : []);
          setItems(res.items.filter((item) => !excluded.has(item.id)));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [excludeKey, open, query]);

  return (
    <>
      <Field
        label={label}
        fieldPath={fieldPath}
        requiredToPublish={requiredToPublish}
        requiredMarkLabel={tContent("errors.requiredMark")}
        error={error}
      >
        {!value ? (
          <Button
            type="button"
            variant="outline"
            disabled={readOnly}
            onClick={() => setOpen(true)}
            className="w-full justify-center sm:w-auto"
          >
            <User className="mr-1.5 size-4" aria-hidden="true" />
            {t("choosePerson")}
          </Button>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            <span className="truncate font-medium text-foreground">
              {selectedOption?.label || value}
            </span>
            {!readOnly && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setOpen(true)}
                >
                  {tContent("action.change")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive hover:text-destructive"
                  aria-label={tList("remove")}
                  onClick={() => {
                    setSelectedOption(null);
                    onChange(undefined);
                  }}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Field>

      <PickerDialog<ContentPickerOption>
        open={open}
        onOpenChange={setOpen}
        title={t("personPickerTitle")}
        closeLabel={tCommon("close")}
        cancelLabel={tContent("action.cancel")}
        confirmLabel={t("usePerson")}
        searchPlaceholder={t("personSearchPlaceholder")}
        searchQuery={query}
        onSearchChange={setQuery}
        items={items}
        getKey={(item) => item.id}
        selectedIds={draftSelection}
        onSelectionChange={setDraftSelection}
        isLoading={isLoading}
        emptyMessage={t("noPeopleResults")}
        onConfirm={(ids) => {
          const picked = items.find((item) => item.id === ids[0]);
          if (picked) {
            setKnownById((prev) => ({ ...prev, [picked.id]: picked }));
            setSelectedOption(picked);
            onChange(picked.id);
          }
          setOpen(false);
        }}
        renderItem={(item) => (
          <div className="flex items-center justify-between gap-2 pr-6">
            <span className="text-sm font-medium">{item.label}</span>
            <StatusChip
              status={item.status}
              label={tContent(`status.${item.status}`)}
            />
          </div>
        )}
      />
    </>
  );
}

export interface SermonAdditionalPreachersFieldProps {
  readonly value: readonly string[];
  readonly primaryPreacherId?: string;
  readonly initialOptions: Readonly<Record<string, ContentPickerOption>>;
  readonly readOnly: boolean;
  readonly onChange: (nextIds: string[]) => void;
}

/** Reorderable list of additional co-preachers (`additionalPreacherIds`). */
export function SermonAdditionalPreachersField({
  value,
  primaryPreacherId,
  initialOptions,
  readOnly,
  onChange,
}: SermonAdditionalPreachersFieldProps) {
  const t = useTranslations("contentSermons.fields");
  const tList = useTranslations("contentSermons.list");
  const tContent = useTranslations("content");
  const tCommon = useTranslations("common");

  const [known, setKnown] =
    React.useState<Readonly<Record<string, ContentPickerOption>>>(
      initialOptions,
    );
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<readonly ContentPickerOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [draftSelection, setDraftSelection] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setDraftSelection([]);
    let active = true;
    setIsLoading(true);
    void searchContentEntriesAction({ collection: "authors", query }).then(
      (res) => {
        if (!active) return;
        setIsLoading(false);
        if (res.ok) {
          const excluded = new Set(value);
          if (primaryPreacherId) excluded.add(primaryPreacherId);
          setItems(res.items.filter((item) => !excluded.has(item.id)));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [open, primaryPreacherId, query, value]);

  return (
    <>
      <Field
        label={t("additionalPreachers")}
        fieldPath="additionalPreacherIds"
      >
        <SortableList<string>
          items={value}
          getKey={(id) => id}
          onChange={onChange}
          onAdd={() => setOpen(true)}
          addLabel={t("addPreacher")}
          moveUpLabel={tList("moveUp")}
          moveDownLabel={tList("moveDown")}
          removeLabel={tList("remove")}
          readOnly={readOnly}
          renderItem={(id) => (
            <span className="text-sm font-medium text-foreground">
              {known[id]?.label || id}
            </span>
          )}
        />
      </Field>

      <PickerDialog<ContentPickerOption>
        open={open}
        onOpenChange={setOpen}
        title={t("personPickerTitle")}
        closeLabel={tCommon("close")}
        cancelLabel={tContent("action.cancel")}
        confirmLabel={t("usePerson")}
        searchPlaceholder={t("personSearchPlaceholder")}
        searchQuery={query}
        onSearchChange={setQuery}
        items={items}
        getKey={(item) => item.id}
        selectedIds={draftSelection}
        onSelectionChange={setDraftSelection}
        isLoading={isLoading}
        emptyMessage={t("noPeopleResults")}
        onConfirm={(ids) => {
          const picked = items.find((item) => item.id === ids[0]);
          if (picked && !value.includes(picked.id)) {
            setKnown((prev) => ({ ...prev, [picked.id]: picked }));
            onChange([...value, picked.id]);
          }
          setOpen(false);
        }}
        renderItem={(item) => (
          <div className="flex items-center justify-between gap-2 pr-6">
            <span className="text-sm font-medium">{item.label}</span>
            <StatusChip
              status={item.status}
              label={tContent(`status.${item.status}`)}
            />
          </div>
        )}
      />
    </>
  );
}

export interface SermonRelatedPickerProps {
  readonly value: readonly string[];
  readonly currentSermonId?: string;
  readonly initialOptions: Readonly<Record<string, ContentPickerOption>>;
  readonly readOnly: boolean;
  readonly onChange: (nextIds: string[]) => void;
}

/**
 * Reorderable related sermons selector (max 3; displays each sermon's status
 * chip per `F-editor-ux-decisions.md` §2.10).
 */
export function SermonRelatedPicker({
  value,
  currentSermonId,
  initialOptions,
  readOnly,
  onChange,
}: SermonRelatedPickerProps) {
  const t = useTranslations("contentSermons.fields");
  const tList = useTranslations("contentSermons.list");
  const tContent = useTranslations("content");
  const tCommon = useTranslations("common");

  const [known, setKnown] =
    React.useState<Readonly<Record<string, ContentPickerOption>>>(
      initialOptions,
    );
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [items, setItems] = React.useState<readonly ContentPickerOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [draftSelection, setDraftSelection] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setDraftSelection([]);
    let active = true;
    setIsLoading(true);
    void searchContentEntriesAction({
      collection: "sermons",
      query,
      excludeId: currentSermonId,
    }).then((res) => {
      if (!active) return;
      setIsLoading(false);
      if (res.ok) {
        const chosen = new Set(value);
        setItems(res.items.filter((item) => !chosen.has(item.id)));
      }
    });
    return () => {
      active = false;
    };
  }, [currentSermonId, open, query, value]);

  return (
    <>
      <Field label={t("relatedSermons")} fieldPath="relatedSermonIds">
        <SortableList<string>
          items={value}
          getKey={(id) => id}
          onChange={onChange}
          onAdd={() => setOpen(true)}
          addLabel={t("addRelated")}
          maxItems={MAX_RELATED_SERMONS}
          emptyMessage={t("noRelated")}
          moveUpLabel={tList("moveUp")}
          moveDownLabel={tList("moveDown")}
          removeLabel={tList("remove")}
          readOnly={readOnly}
          renderItem={(id) => {
            const opt = known[id];
            return (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {opt?.label || id}
                  </p>
                  {opt?.secondary && (
                    <p className="truncate text-xs text-muted-foreground">
                      {opt.secondary}
                    </p>
                  )}
                </div>
                {opt && (
                  <StatusChip
                    status={opt.status}
                    label={tContent(`status.${opt.status}`)}
                  />
                )}
              </div>
            );
          }}
        />
      </Field>

      <PickerDialog<ContentPickerOption>
        open={open}
        onOpenChange={setOpen}
        title={t("relatedPickerTitle")}
        closeLabel={tCommon("close")}
        cancelLabel={tContent("action.cancel")}
        confirmLabel={t("useRelated")}
        searchPlaceholder={t("relatedSearchPlaceholder")}
        searchQuery={query}
        onSearchChange={setQuery}
        items={items}
        getKey={(item) => item.id}
        selectedIds={draftSelection}
        onSelectionChange={setDraftSelection}
        isLoading={isLoading}
        emptyMessage={t("noRelatedResults")}
        onConfirm={(ids) => {
          const picked = items.find((item) => item.id === ids[0]);
          if (
            picked &&
            !value.includes(picked.id) &&
            value.length < MAX_RELATED_SERMONS
          ) {
            setKnown((prev) => ({ ...prev, [picked.id]: picked }));
            onChange([...value, picked.id]);
          }
          setOpen(false);
        }}
        renderItem={(item) => (
          <div className="flex items-center justify-between gap-2 pr-6">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.label}</p>
              {item.secondary && (
                <p className="truncate text-xs text-muted-foreground">
                  {item.secondary}
                </p>
              )}
            </div>
            <StatusChip
              status={item.status}
              label={tContent(`status.${item.status}`)}
            />
          </div>
        )}
      />
    </>
  );
}
