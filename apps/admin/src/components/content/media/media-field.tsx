"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowDown, ArrowUp, FileAudio, FileText, ImageIcon, Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@src/components/ui/button";
import {
  formatDuration,
  formatFileSize,
  type MediaKind,
} from "@src/lib/media/policy";
import {
  getMediaByIdsAction,
  type MediaDocLike,
  type SerializedMediaDoc,
} from "@src/app/[locale]/(app)/content/media/actions";
import { MediaPicker } from "./media-picker";

function normalizeMediaDoc(doc: MediaDocLike): SerializedMediaDoc {
  return {
    ...doc,
    createdAt:
      typeof doc.createdAt === "string"
        ? doc.createdAt
        : doc.createdAt.toISOString(),
  };
}

function pickLocalizedText(
  value: { readonly "es-AR": string; readonly "en-US"?: string } | undefined,
  locale: string,
): string {
  if (!value) return "";
  if (locale === "en-US" && value["en-US"]?.trim()) return value["en-US"];
  return value["es-AR"];
}

export interface MediaFieldProps {
  readonly accept: MediaKind;
  readonly value?: string;
  readonly initialDoc?: MediaDocLike | null;
  /** Alias for `initialDoc` (matches `ICR-199` spec). */
  readonly initialMedia?: MediaDocLike | null;
  readonly canUpload: boolean;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly onChange: (mediaId: string | undefined) => void;
  /** Optional callback delivering full media metadata (e.g. `durationSeconds` for ICR-200 sermons). */
  readonly onSelectDoc?: (doc: SerializedMediaDoc | null) => void;
}

/**
 * Reusable single-file media form field (`F-editor-ux-decisions.md` §2.7 & §7 #11)
 * consumed by Wave 4 editors (`ICR-198`, `ICR-199`, `ICR-200`).
 */
export function MediaField({
  accept,
  value,
  initialDoc = null,
  initialMedia = null,
  canUpload,
  disabled = false,
  readOnly = false,
  onChange,
  onSelectDoc,
}: MediaFieldProps) {
  const t = useTranslations("contentMedia");
  const locale = useLocale();

  const seedDoc = initialDoc ?? initialMedia;
  const [doc, setDoc] = React.useState<SerializedMediaDoc | null>(() =>
    seedDoc ? normalizeMediaDoc(seedDoc) : null,
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!value) {
      setDoc(null);
      return;
    }
    if (doc?._id === value) return;
    let cancelled = false;
    setIsLoading(true);
    void getMediaByIdsAction([value]).then((res) => {
      if (cancelled) return;
      if (res.ok && res.items[0]) {
        setDoc(res.items[0]);
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [value, doc?._id]);

  const chooseLabel =
    accept === "image"
      ? t("field.chooseImage")
      : accept === "audio"
        ? t("field.chooseAudio")
        : t("field.choosePdf");

  const isLocked = disabled || readOnly;

  const handleSelect = (chosen: SerializedMediaDoc[]) => {
    const first = chosen[0];
    if (!first) return;
    setDoc(first);
    onChange(first._id);
    onSelectDoc?.(first);
  };

  const handleRemove = () => {
    setDoc(null);
    onChange(undefined);
    onSelectDoc?.(null);
  };

  return (
    <div className="space-y-2">
      {!value ? (
        <Button
          type="button"
          variant="outline"
          disabled={isLocked}
          onClick={() => setPickerOpen(true)}
          className="w-full justify-center sm:w-auto"
        >
          {accept === "image" ? (
            <ImageIcon className="mr-1.5 size-4" aria-hidden="true" />
          ) : accept === "audio" ? (
            <FileAudio className="mr-1.5 size-4" aria-hidden="true" />
          ) : (
            <FileText className="mr-1.5 size-4" aria-hidden="true" />
          )}
          {chooseLabel}
        </Button>
      ) : isLoading && !doc ? (
        <div className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">
          {t("field.loading")}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center">
          {doc?.contentType.startsWith("image/") ? (
            <div className="relative size-16 shrink-0 overflow-hidden rounded border border-border bg-muted">
              <Image
                src={doc.url}
                alt={
                  pickLocalizedText(doc.alt, locale) ||
                  pickLocalizedText(doc.title, locale)
                }
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          ) : doc?.contentType.startsWith("audio/") ? (
            <div className="flex size-12 shrink-0 items-center justify-center rounded border border-border bg-muted">
              <FileAudio className="size-6 text-muted-foreground" aria-hidden="true" />
            </div>
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded border border-border bg-muted">
              <FileText className="size-6 text-muted-foreground" aria-hidden="true" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-sm font-medium text-foreground">
              {doc ? pickLocalizedText(doc.title, locale) : value}
            </p>
            {doc && (
              <p className="truncate text-xs text-muted-foreground">
                {doc.filename} · {formatFileSize(doc.size, locale)}
                {doc.width && doc.height ? ` · ${doc.width}×${doc.height}` : ""}
                {doc.durationSeconds !== undefined
                  ? ` · ${formatDuration(doc.durationSeconds)}`
                  : ""}
              </p>
            )}
            {doc?.contentType.startsWith("audio/") && (
              <audio
                controls
                preload="metadata"
                src={doc.url}
                className="mt-1 h-8 w-full max-w-xs"
              />
            )}
          </div>

          {!isLocked && (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPickerOpen(true)}
              >
                {t("field.change")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
              >
                {t("field.remove")}
              </Button>
            </div>
          )}
        </div>
      )}

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        accept={accept}
        initialSelectedIds={value ? [value] : []}
        canUpload={canUpload}
        onSelect={handleSelect}
      />
    </div>
  );
}

export interface MediaListFieldProps {
  readonly accept?: MediaKind;
  readonly values: readonly string[];
  readonly initialDocs?: readonly MediaDocLike[];
  readonly canUpload: boolean;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly onChange: (mediaIds: string[]) => void;
}

/**
 * Reusable ordered multi-media field (`ICR-198` `section.images`).
 * Supports adding multiple files via `MediaPicker`, move-up/move-down, and removal.
 */
export function MediaListField({
  accept = "image",
  values,
  initialDocs = [],
  canUpload,
  disabled = false,
  readOnly = false,
  onChange,
}: MediaListFieldProps) {
  const t = useTranslations("contentMedia");
  const locale = useLocale();
  const [docsById, setDocsById] = React.useState<
    Readonly<Record<string, SerializedMediaDoc>>
  >(() =>
    Object.fromEntries(
      initialDocs.map((doc) => [doc._id, normalizeMediaDoc(doc)]),
    ),
  );
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const requestedIdsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const missing = values.filter(
      (id) => !docsById[id] && !requestedIdsRef.current.has(id),
    );
    if (missing.length === 0) return;
    for (const id of missing) requestedIdsRef.current.add(id);
    let cancelled = false;
    void getMediaByIdsAction(missing).then((res) => {
      if (cancelled || !res.ok) return;
      setDocsById((prev) => {
        const next = { ...prev };
        for (const item of res.items) next[item._id] = item;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [values, docsById]);

  const isLocked = disabled || readOnly;

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onChange(next);
  };

  const removeItem = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const handleSelect = (chosen: SerializedMediaDoc[]) => {
    setDocsById((prev) => {
      const next = { ...prev };
      for (const item of chosen) next[item._id] = item;
      return next;
    });
    onChange(chosen.map((item) => item._id));
  };

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <ul className="space-y-2">
          {values.map((id, idx) => {
            const doc = docsById[id];
            return (
              <li
                key={`${id}-${idx}`}
                className="flex items-center gap-3 rounded-md border border-border p-2.5"
              >
                {doc?.contentType.startsWith("image/") ? (
                  <div className="relative size-12 shrink-0 overflow-hidden rounded border border-border bg-muted">
                    <Image
                      src={doc.url}
                      alt={
                        pickLocalizedText(doc.alt, locale) ||
                        pickLocalizedText(doc.title, locale)
                      }
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded border border-border bg-muted">
                    <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {doc ? pickLocalizedText(doc.title, locale) : id}
                  </p>
                  {doc && (
                    <p className="truncate text-xs text-muted-foreground">
                      {doc.filename} · {formatFileSize(doc.size, locale)}
                    </p>
                  )}
                </div>

                {!isLocked && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={idx === 0}
                      aria-label={t("field.moveUp")}
                      onClick={() => moveItem(idx, -1)}
                    >
                      <ArrowUp className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={idx === values.length - 1}
                      aria-label={t("field.moveDown")}
                      onClick={() => moveItem(idx, 1)}
                    >
                      <ArrowDown className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("field.remove")}
                      onClick={() => removeItem(idx)}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!isLocked && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="mr-1.5 size-4" aria-hidden="true" />
          {t("field.addImages")}
        </Button>
      )}

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        accept={accept}
        multiple
        initialSelectedIds={values}
        canUpload={canUpload}
        onSelect={handleSelect}
      />
    </div>
  );
}
