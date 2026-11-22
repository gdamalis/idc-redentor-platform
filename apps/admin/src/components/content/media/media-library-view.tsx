"use client";

import * as React from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  FileAudio,
  FileText,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@idcr/ui";
import { Link, useRouter } from "@src/i18n/routing";
import { Button } from "@src/components/ui/button";
import { Checkbox } from "@src/components/ui/checkbox";
import { ConfirmDialog } from "@src/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@src/components/ui/dialog";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Notice } from "@src/components/ui/notice";
import { Textarea } from "@src/components/ui/textarea";
import { InUseDialog } from "@src/components/content/in-use-dialog";
import { StatusChip } from "@src/components/content/status-chip";
import type { ContentReferenceUsage } from "@src/lib/content/errors";
import {
  CONTENT_DESTINATIONS,
  getEntryEditorHref,
} from "@src/lib/content/routes";
import { formatAdminTimestamp } from "@src/lib/content/status-helpers";
import {
  formatDuration,
  formatFileSize,
  type MediaKind,
} from "@src/lib/media/policy";
import {
  deleteMediaAction,
  getMediaUsagesAction,
  updateMediaDetailsAction,
  type SerializedMediaDoc,
} from "@src/app/[locale]/(app)/content/media/actions";
import { MediaUploadPanel } from "./media-upload-panel";

function pickLocalizedText(
  value: { readonly "es-AR": string; readonly "en-US"?: string } | undefined,
  locale: string,
): string {
  if (!value) return "";
  if (locale === "en-US" && value["en-US"]?.trim()) return value["en-US"];
  return value["es-AR"];
}

export interface MediaLibraryViewProps {
  readonly initialItems: readonly SerializedMediaDoc[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly currentKind: MediaKind | "";
  readonly currentUnused: boolean;
  readonly currentQuery: string;
  readonly canManageMedia: boolean;
}

export function MediaLibraryView({
  initialItems,
  total,
  page,
  pageSize,
  currentKind,
  currentUnused,
  currentQuery,
  canManageMedia,
}: MediaLibraryViewProps) {
  const t = useTranslations("contentMedia");
  const tContent = useTranslations("content");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const [items, setItems] = React.useState<SerializedMediaDoc[]>([
    ...initialItems,
  ]);
  const [searchInput, setSearchInput] = React.useState(currentQuery);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = React.useState(false);

  // Detail panel state
  const [selected, setSelected] = React.useState<SerializedMediaDoc | null>(
    null,
  );
  const [usages, setUsages] = React.useState<ContentReferenceUsage[]>([]);
  const [isLoadingUsages, setIsLoadingUsages] = React.useState(false);
  const [copiedLink, setCopiedLink] = React.useState(false);

  // Live-edit form state inside detail panel
  const [editTitleEs, setEditTitleEs] = React.useState("");
  const [editTitleEn, setEditTitleEn] = React.useState("");
  const [editAltEs, setEditAltEs] = React.useState("");
  const [editAltEn, setEditAltEn] = React.useState("");
  const [editDecorative, setEditDecorative] = React.useState(false);
  const [editDuration, setEditDuration] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveNotice, setSaveNotice] = React.useState<{
    readonly variant: "success" | "error";
    readonly text: string;
  } | null>(null);

  // Delete confirmation & in-use refusal dialogs
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [inUseDialogData, setInUseDialogData] = React.useState<{
    readonly title: string;
    readonly usedBy: readonly ContentReferenceUsage[];
  } | null>(null);

  React.useEffect(() => {
    setItems([...initialItems]);
  }, [initialItems]);

  React.useEffect(() => {
    setSearchInput(currentQuery);
  }, [currentQuery]);

  const buildFilterHref = React.useCallback(
    (next: {
      readonly kind?: MediaKind | "";
      readonly unused?: boolean;
      readonly q?: string;
      readonly page?: number;
    }) => {
      const params = new URLSearchParams();
      const k = next.kind !== undefined ? next.kind : currentKind;
      const u = next.unused !== undefined ? next.unused : currentUnused;
      const q = next.q !== undefined ? next.q : currentQuery;
      const p = next.page ?? 1;
      if (k) params.set("kind", k);
      if (u) params.set("unused", "1");
      if (q.trim()) params.set("q", q.trim());
      if (p > 1) params.set("page", String(p));
      const qs = params.toString();
      return qs ? `/content/media?${qs}` : "/content/media";
    },
    [currentKind, currentUnused, currentQuery],
  );

  const openDetail = (doc: SerializedMediaDoc) => {
    setSelected(doc);
    setEditTitleEs(doc.title["es-AR"] ?? "");
    setEditTitleEn(doc.title["en-US"] ?? "");
    setEditAltEs(doc.alt?.["es-AR"] ?? "");
    setEditAltEn(doc.alt?.["en-US"] ?? "");
    setEditDecorative(doc.decorative === true);
    setEditDuration(
      doc.durationSeconds !== undefined ? String(doc.durationSeconds) : "",
    );
    setSaveNotice(null);
    setCopiedLink(false);
    setUsages([]);
    setIsLoadingUsages(true);
    void getMediaUsagesAction(doc._id).then((res) => {
      if (res.ok) setUsages(res.usedBy);
      setIsLoadingUsages(false);
    });
  };

  const handleCopyLink = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(selected.url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  };

  const handleSaveDetails = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected || !canManageMedia) return;
    setSaveNotice(null);

    const isImage = selected.contentType.startsWith("image/");
    const isAudio = selected.contentType.startsWith("audio/");
    if (!editTitleEs.trim()) {
      setSaveNotice({ variant: "error", text: t("errors.nameRequired") });
      return;
    }
    if (isImage && !editDecorative && !editAltEs.trim()) {
      setSaveNotice({ variant: "error", text: t("errors.altRequired") });
      return;
    }

    const patch: {
      title: { "es-AR": string; "en-US"?: string };
      alt?: { "es-AR": string; "en-US"?: string };
      decorative?: boolean;
      durationSeconds?: number;
    } = {
      title: {
        "es-AR": editTitleEs.trim(),
        ...(editTitleEn.trim() ? { "en-US": editTitleEn.trim() } : {}),
      },
    };

    if (isImage) {
      patch.decorative = editDecorative;
      patch.alt = editDecorative
        ? undefined
        : {
            "es-AR": editAltEs.trim(),
            ...(editAltEn.trim() ? { "en-US": editAltEn.trim() } : {}),
          };
    }

    if (
      isAudio &&
      selected.durationSeconds === undefined &&
      editDuration.trim() !== ""
    ) {
      const parsedDuration = Number(editDuration);
      if (Number.isFinite(parsedDuration) && parsedDuration >= 0) {
        patch.durationSeconds = Math.round(parsedDuration);
      }
    }

    setIsSaving(true);
    try {
      const res = await updateMediaDetailsAction({
        mediaId: selected._id,
        patch,
      });
      if (!res.ok) {
        setSaveNotice({
          variant: "error",
          text:
            res.reason === "invalid" && res.fieldErrors["alt.es-AR"]
              ? t("errors.altRequired")
              : t("errors.saveFailed"),
        });
        return;
      }

      setSelected(res.doc);
      setItems((prev) =>
        prev.map((item) => (item._id === res.doc._id ? res.doc : item)),
      );
      setSaveNotice({ variant: "success", text: t("details.saved") });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestDelete = () => {
    if (!selected) return;
    if (usages.length > 0) {
      setInUseDialogData({
        title: pickLocalizedText(selected.title, locale),
        usedBy: usages,
      });
      return;
    }
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selected) return;
    setIsDeleting(true);
    try {
      const res = await deleteMediaAction(selected._id);
      if (!res.ok) {
        setDeleteDialogOpen(false);
        if (res.reason === "in-use") {
          setUsages([...res.usedBy]);
          setInUseDialogData({
            title: pickLocalizedText(selected.title, locale),
            usedBy: res.usedBy,
          });
          return;
        }
        setSaveNotice({ variant: "error", text: t("errors.deleteFailed") });
        return;
      }

      setDeleteDialogOpen(false);
      setItems((prev) => prev.filter((item) => item._id !== selected._id));
      setSelected(null);
      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  };

  const hasFilters = Boolean(currentKind || currentUnused || currentQuery);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, (page - 1) * pageSize + items.length);

  const filterKinds: readonly { readonly value: MediaKind | ""; readonly label: string }[] = [
    { value: "", label: t("library.filters.all") },
    { value: "image", label: t("library.filters.image") },
    { value: "audio", label: t("library.filters.audio") },
    { value: "pdf", label: t("library.filters.pdf") },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Link
            href="/content"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            <span>{tContent("header.backToHub")}</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("library.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("library.subtitle")}
          </p>
        </div>

        {canManageMedia && (
          <Button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="w-full sm:w-auto"
          >
            <Upload className="mr-1.5 size-4" aria-hidden="true" />
            {t("library.uploadButton")}
          </Button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push(buildFilterHref({ q: searchInput, page: 1 }));
          }}
          className="relative w-full md:max-w-sm"
        >
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("library.searchPlaceholder")}
            className="pl-9"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5">
            {filterKinds.map((opt) => (
              <Link
                key={opt.value || "all"}
                href={buildFilterHref({ kind: opt.value, page: 1 })}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  currentKind === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </Link>
            ))}
          </div>

          <Link
            href={buildFilterHref({ unused: !currentUnused, page: 1 })}
            aria-pressed={currentUnused}
            className={cn(
              "inline-flex items-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              currentUnused
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t("library.filters.unused")}
          </Link>
        </div>
      </div>

      {/* Grid / Empty States */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border py-14 text-center">
          <p className="text-sm text-muted-foreground">
            {currentUnused && !currentKind && !currentQuery
              ? t("library.empty.unused")
              : hasFilters
                ? t("library.empty.filtered")
                : t("library.empty.all")}
          </p>
          {hasFilters && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/content/media">{t("library.filters.clear")}</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((doc) => {
            const isImg = doc.contentType.startsWith("image/");
            const isAudio = doc.contentType.startsWith("audio/");
            return (
              <button
                key={doc._id}
                type="button"
                onClick={() => openDetail(doc)}
                className="group flex cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-card text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-muted">
                  {isImg ? (
                    <Image
                      src={doc.url}
                      alt={
                        pickLocalizedText(doc.alt, locale) ||
                        pickLocalizedText(doc.title, locale)
                      }
                      fill
                      unoptimized
                      className="object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  ) : isAudio ? (
                    <FileAudio
                      className="size-10 text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileText
                      className="size-10 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="space-y-0.5 p-2.5">
                  <p className="truncate text-xs font-medium text-foreground">
                    {pickLocalizedText(doc.title, locale)}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {formatFileSize(doc.size, locale)}
                    {doc.durationSeconds !== undefined
                      ? ` · ${formatDuration(doc.durationSeconds)}`
                      : ""}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
          <span>{t("library.showingCount", { from, to, total })}</span>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={buildFilterHref({ page: page - 1 })}>
                  {t("library.previous")}
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                {t("library.previous")}
              </Button>
            )}
            {page < totalPages ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={buildFilterHref({ page: page + 1 })}>
                  {t("library.next")}
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled>
                {t("library.next")}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(next) => {
          if (!next && isUploading) {
            setShowLeaveConfirm(true);
            return;
          }
          setUploadOpen(next);
        }}
      >
        <DialogContent
          closeLabel={tCommon("close")}
          className="max-h-[90vh] max-w-xl overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{t("library.uploadButton")}</DialogTitle>
          </DialogHeader>
          <MediaUploadPanel
            submitLabel={t("upload.saveToLibrary")}
            onUploadingChange={setIsUploading}
            onCancel={() => setUploadOpen(false)}
            onComplete={(doc) => {
              setUploadOpen(false);
              setItems((prev) => [
                doc,
                ...prev.filter((item) => item._id !== doc._id),
              ]);
              openDetail(doc);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showLeaveConfirm}
        onOpenChange={setShowLeaveConfirm}
        title={t("upload.leaveConfirmTitle")}
        description={t("upload.leaveConfirmBody")}
        closeLabel={tCommon("close")}
        cancelLabel={t("upload.leaveKeep")}
        confirmLabel={t("upload.leaveAbort")}
        variant="destructive"
        onConfirm={() => {
          setShowLeaveConfirm(false);
          setIsUploading(false);
          setUploadOpen(false);
        }}
      />

      {/* Detail Side Panel Dialog */}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected && (
          <DialogContent
            closeLabel={tCommon("close")}
            className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 rounded-none p-0 sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-screen sm:max-w-lg sm:translate-x-0 sm:translate-y-0 sm:rounded-none sm:border-l"
          >
            <DialogHeader className="border-b border-border px-5 py-4">
              <DialogTitle className="truncate pr-6">
                {pickLocalizedText(selected.title, locale)}
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {/* Preview */}
              {selected.contentType.startsWith("image/") ? (
                <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-muted">
                  <Image
                    src={selected.url}
                    alt={
                      pickLocalizedText(selected.alt, locale) ||
                      pickLocalizedText(selected.title, locale)
                    }
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </div>
              ) : selected.contentType.startsWith("audio/") ? (
                <div className="space-y-2 rounded-md border border-border bg-muted/30 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FileAudio className="size-5 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{selected.filename}</span>
                  </div>
                  <audio
                    controls
                    preload="metadata"
                    src={selected.url}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-4">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{selected.filename}</span>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={selected.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-1.5 size-3.5" aria-hidden="true" />
                      {t("details.openFile")}
                    </a>
                  </Button>
                </div>
              )}

              {/* Technical info & Copy link */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <div className="space-y-0.5">
                  <p className="font-mono">{selected.filename}</p>
                  <p>
                    {formatFileSize(selected.size, locale)}
                    {selected.width && selected.height
                      ? ` · ${t("details.dimensions", {
                          width: selected.width,
                          height: selected.height,
                        })}`
                      : ""}
                    {selected.durationSeconds !== undefined
                      ? ` · ${t("details.duration", {
                          duration: formatDuration(selected.durationSeconds),
                        })}`
                      : ""}
                  </p>
                  <p>
                    {t("details.uploadedAt", {
                      date: formatAdminTimestamp(
                        new Date(selected.createdAt),
                        locale,
                      ),
                    })}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopyLink()}
                >
                  {copiedLink ? (
                    <>
                      <Check className="mr-1.5 size-3.5" aria-hidden="true" />
                      {t("details.linkCopied")}
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 size-3.5" aria-hidden="true" />
                      {t("details.copyLink")}
                    </>
                  )}
                </Button>
              </div>

              {/* Live-edit metadata form */}
              <form onSubmit={handleSaveDetails} className="space-y-3 border-t border-border pt-4">
                <Notice variant="info">{t("details.liveEdit")}</Notice>

                {saveNotice && (
                  <Notice variant={saveNotice.variant}>{saveNotice.text}</Notice>
                )}

                <Field label={t("details.nameLabel")} htmlFor="detail-title-es">
                  <Input
                    id="detail-title-es"
                    value={editTitleEs}
                    onChange={(e) => setEditTitleEs(e.target.value)}
                    disabled={!canManageMedia || isSaving}
                  />
                </Field>

                <Field label={t("details.nameEnLabel")} htmlFor="detail-title-en">
                  <Input
                    id="detail-title-en"
                    value={editTitleEn}
                    onChange={(e) => setEditTitleEn(e.target.value)}
                    disabled={!canManageMedia || isSaving}
                  />
                </Field>

                {selected.contentType.startsWith("image/") && (
                  <>
                    <Field
                      label={t("details.altEsLabel")}
                      htmlFor="detail-alt-es"
                      hint={t("details.altHelp")}
                    >
                      <Textarea
                        id="detail-alt-es"
                        value={editAltEs}
                        onChange={(e) => setEditAltEs(e.target.value)}
                        disabled={!canManageMedia || isSaving || editDecorative}
                        rows={2}
                        className="min-h-16"
                      />
                    </Field>

                    <Field label={t("details.altEnLabel")} htmlFor="detail-alt-en">
                      <Input
                        id="detail-alt-en"
                        value={editAltEn}
                        onChange={(e) => setEditAltEn(e.target.value)}
                        disabled={!canManageMedia || isSaving || editDecorative}
                      />
                    </Field>

                    <Checkbox
                      id="detail-decorative"
                      checked={editDecorative}
                      onChange={(e) => setEditDecorative(e.target.checked)}
                      disabled={!canManageMedia || isSaving}
                      label={t("details.decorative")}
                    />
                  </>
                )}

                {selected.contentType.startsWith("audio/") &&
                  selected.durationSeconds === undefined && (
                    <Field
                      label={t("details.durationLabel")}
                      htmlFor="detail-duration"
                      hint={t("details.durationHelp")}
                    >
                      <Input
                        id="detail-duration"
                        type="number"
                        min={0}
                        value={editDuration}
                        onChange={(e) => setEditDuration(e.target.value)}
                        disabled={!canManageMedia || isSaving}
                      />
                    </Field>
                  )}

                {canManageMedia && (
                  <Button type="submit" size="sm" disabled={isSaving}>
                    {isSaving ? t("upload.saving") : t("details.saveChanges")}
                  </Button>
                )}
              </form>

              {/* Used in */}
              <div className="space-y-2 border-t border-border pt-4">
                <h2 className="text-sm font-semibold">
                  {t("details.usedInTitle")}
                </h2>
                {isLoadingUsages ? (
                  <p className="text-xs text-muted-foreground">
                    {t("details.usedInLoading")}
                  </p>
                ) : usages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("details.usedInEmpty")}
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {usages.map((usage) => {
                      const globalKind =
                        usage.collection === "globals"
                          ? CONTENT_DESTINATIONS.find(
                              (d) =>
                                d.collection === "globals" &&
                                d.fixedMachineName === usage.label,
                            )?.globalKind
                          : undefined;
                      return (
                        <li
                          key={`${usage.collection}:${usage.docId}`}
                          className="flex items-center justify-between gap-2 rounded border border-border px-3 py-2 text-xs"
                        >
                          <Link
                            href={getEntryEditorHref(
                              usage.collection,
                              usage.docId,
                              globalKind,
                            )}
                            className="truncate font-medium text-primary hover:underline"
                          >
                            {usage.label}
                          </Link>
                          <StatusChip
                            status={usage.isPublished ? "published" : "draft"}
                            label={
                              usage.isPublished
                                ? t("details.statusPublished")
                                : t("details.statusDraft")
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {canManageMedia && (
              <div className="flex items-center justify-end border-t border-border px-5 py-3">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isLoadingUsages}
                  onClick={handleRequestDelete}
                >
                  <Trash2 className="mr-1.5 size-3.5" aria-hidden="true" />
                  {t("details.delete")}
                </Button>
              </div>
            )}
          </DialogContent>
        )}
      </Dialog>

      {/* Guarded Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t("details.deleteTitle", {
          name: selected ? pickLocalizedText(selected.title, locale) : "",
        })}
        description={t("details.deleteBody")}
        closeLabel={tCommon("close")}
        cancelLabel={t("upload.cancel")}
        confirmLabel={t("details.deleteConfirm")}
        variant="destructive"
        isPending={isDeleting}
        onConfirm={() => void handleConfirmDelete()}
      />

      {/* In-use Refusal Dialog (no override) */}
      <InUseDialog
        open={inUseDialogData !== null}
        onOpenChange={(open) => {
          if (!open) setInUseDialogData(null);
        }}
        entryTitle={inUseDialogData?.title ?? ""}
        usedBy={inUseDialogData?.usedBy ?? []}
      />
    </div>
  );
}
