"use client";

import * as React from "react";
import Image from "next/image";
import { FileAudio, FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@idcr/ui";
import { ConfirmDialog } from "@src/components/ui/confirm-dialog";
import { PickerDialog } from "@src/components/content/picker-dialog";
import {
  formatDuration,
  formatFileSize,
  isMediaSelectable,
  type MediaKind,
} from "@src/lib/media/policy";
import {
  listMediaAction,
  type SerializedMediaDoc,
} from "@src/app/[locale]/(app)/content/media/actions";
import { MediaUploadPanel } from "./media-upload-panel";

export interface MediaPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Restricts both library view and upload dropzone to the accepted kind(s). */
  readonly accept: MediaKind | readonly MediaKind[];
  readonly multiple?: boolean;
  readonly maxSelect?: number;
  readonly initialSelectedIds?: readonly string[];
  /** True when the current user holds `media:manage`. Picking existing files needs only `content:write`. */
  readonly canUpload: boolean;
  readonly onSelect: (items: SerializedMediaDoc[]) => void;
}

const PAGE_SIZE = 24;

export function MediaPicker({
  open,
  onOpenChange,
  accept,
  multiple = false,
  maxSelect,
  initialSelectedIds = [],
  canUpload,
  onSelect,
}: MediaPickerProps) {
  const t = useTranslations("contentMedia");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const acceptKey = typeof accept === "string" ? accept : accept.join(",");
  const acceptKinds = React.useMemo<readonly MediaKind[]>(
    () => (acceptKey ? (acceptKey.split(",") as MediaKind[]) : []),
    [acceptKey],
  );

  const [tab, setTab] = React.useState<"library" | "upload">("library");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [items, setItems] = React.useState<SerializedMediaDoc[]>([]);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([
    ...initialSelectedIds,
  ]);
  const [isUploading, setIsUploading] = React.useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = React.useState(false);

  const wasOpenRef = React.useRef(false);
  const initialSelectedRef = React.useRef(initialSelectedIds);
  initialSelectedRef.current = initialSelectedIds;

  const loadPage = React.useCallback(
    async (targetPage: number, query: string, append: boolean) => {
      setIsLoading(true);
      try {
        const res = await listMediaAction({
          kinds: acceptKinds,
          query,
          page: targetPage,
          pageSize: PAGE_SIZE,
        });
        if (res.ok) {
          setItems((prev) => (append ? [...prev, ...res.items] : res.items));
          setHasMore(res.hasMore);
          setPage(targetPage);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [acceptKinds],
  );

  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      setTab("library");
      setSelectedIds([...initialSelectedRef.current]);
      setSearchQuery("");
    }
    wasOpenRef.current = open;
  }, [open]);

  React.useEffect(() => {
    if (!open || tab !== "library") return;
    if (searchQuery === "") {
      void loadPage(1, "", false);
      return;
    }
    const timer = setTimeout(() => {
      void loadPage(1, searchQuery, false);
    }, 200);
    return () => clearTimeout(timer);
  }, [open, tab, searchQuery, loadPage]);

  const title = React.useMemo(() => {
    if (acceptKinds.length === 1) {
      const only = acceptKinds[0];
      if (only === "image") {
        return multiple ? t("picker.titleImages") : t("picker.titleImage");
      }
      if (only === "audio") return t("picker.titleAudio");
      if (only === "pdf") return t("picker.titlePdf");
    }
    return t("picker.titleAny");
  }, [acceptKinds, multiple, t]);

  const isImageOnly =
    acceptKinds.length === 1 && acceptKinds[0] === "image";

  const selectedDocs = React.useMemo(() => {
    const byId = new Map(items.map((item) => [item._id, item]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((doc): doc is SerializedMediaDoc => doc !== undefined);
  }, [items, selectedIds]);

  const hasUnselectableSelection = selectedDocs.some(
    (doc) => !isMediaSelectable(doc),
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isUploading) {
      setShowLeaveConfirm(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleConfirmSelection = (ids: string[]) => {
    const byId = new Map(items.map((item) => [item._id, item]));
    const chosen = ids
      .map((id) => byId.get(id))
      .filter(
        (doc): doc is SerializedMediaDoc =>
          doc !== undefined && isMediaSelectable(doc),
      );
    if (chosen.length === 0) return;
    onSelect(chosen);
    onOpenChange(false);
  };

  const handleUploadComplete = (doc: SerializedMediaDoc) => {
    setItems((prev) => [doc, ...prev.filter((item) => item._id !== doc._id)]);
    if (multiple) {
      const mergedIds = [...new Set([...selectedIds, doc._id])];
      const byId = new Map(items.map((i) => [i._id, i]));
      byId.set(doc._id, doc);
      const chosen = mergedIds
        .map((id) => byId.get(id))
        .filter((d): d is SerializedMediaDoc => d !== undefined);
      onSelect(chosen);
    } else {
      onSelect([doc]);
    }
    onOpenChange(false);
  };

  const kindsLabel = acceptKinds
    .map((k) => t(`kinds.${k}` as "kinds.image" | "kinds.audio" | "kinds.pdf"))
    .join(", ");

  const headerSlot = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="tablist" className="inline-flex rounded-md border border-border p-0.5">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "library"}
          onClick={() => setTab("library")}
          className={cn(
            "rounded px-3 py-1 text-xs font-medium transition-colors",
            tab === "library"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("picker.tabLibrary")}
        </button>
        {canUpload && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "upload"}
            onClick={() => setTab("upload")}
            className={cn(
              "rounded px-3 py-1 text-xs font-medium transition-colors",
              tab === "upload"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("picker.tabUpload")}
          </button>
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {t("kinds.showing", { kinds: kindsLabel })}
      </span>
    </div>
  );

  const footerSummary = React.useMemo(() => {
    if (selectedDocs.length === 0) return null;
    if (hasUnselectableSelection) {
      return (
        <span className="font-medium text-amber-700 dark:text-amber-300">
          {t("picker.missingDescriptionHint")}
        </span>
      );
    }
    if (selectedDocs.length === 1) {
      const doc = selectedDocs[0]!;
      return (
        <div className="space-y-0.5">
          <p className="truncate font-medium text-foreground">
            {doc.filename} · {formatFileSize(doc.size, locale)}
            {doc.width && doc.height ? ` · ${doc.width}×${doc.height}` : ""}
            {doc.durationSeconds !== undefined
              ? ` · ${formatDuration(doc.durationSeconds)}`
              : ""}
          </p>
          {doc.alt?.["es-AR"] && (
            <p className="truncate text-muted-foreground">
              {doc.alt["es-AR"]}
            </p>
          )}
        </div>
      );
    }
    return t("picker.selectedCount", { count: selectedDocs.length });
  }, [selectedDocs, hasUnselectableSelection, locale, t]);

  const confirmLabel =
    multiple && selectedIds.length > 1
      ? t("picker.useMultiple", { count: selectedIds.length })
      : t("picker.use");

  return (
    <>
      <PickerDialog<SerializedMediaDoc>
        open={open}
        onOpenChange={handleOpenChange}
        title={title}
        closeLabel={tCommon("close")}
        cancelLabel={t("upload.cancel")}
        confirmLabel={confirmLabel}
        searchPlaceholder={t("picker.searchPlaceholder")}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        items={items}
        getKey={(item) => item._id}
        layout={isImageOnly ? "grid" : "list"}
        multiple={multiple}
        maxSelect={maxSelect}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        isLoading={isLoading}
        emptyMessage={t("picker.empty")}
        hasMore={hasMore}
        loadMoreLabel={t("picker.loadMore")}
        onLoadMore={() => void loadPage(page + 1, searchQuery, true)}
        headerSlot={headerSlot}
        footerSummary={footerSummary}
        confirmDisabled={hasUnselectableSelection}
        hideFooter={tab === "upload"}
        customBody={
          tab === "upload" && canUpload ? (
            <MediaUploadPanel
              acceptKinds={acceptKinds}
              submitLabel={t("upload.saveAndUse")}
              onComplete={handleUploadComplete}
              onCancel={() => setTab("library")}
              onUploadingChange={setIsUploading}
            />
          ) : undefined
        }
        onConfirm={handleConfirmSelection}
        renderItem={(item) => {
          const selectable = isMediaSelectable(item);
          if (item.contentType.startsWith("image/")) {
            return (
              <div className="space-y-1.5">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded bg-muted">
                  <Image
                    src={item.url}
                    alt={item.alt?.["es-AR"] ?? item.title["es-AR"]}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
                <p className="truncate text-xs font-medium text-foreground">
                  {item.title["es-AR"]}
                </p>
                {!selectable && (
                  <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                    {t("picker.missingDescriptionBadge")}
                  </span>
                )}
              </div>
            );
          }

          return (
            <div className="flex items-center gap-3 pr-6">
              <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                {item.contentType.startsWith("audio/") ? (
                  <FileAudio className="size-5 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.title["es-AR"]}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.filename} · {formatFileSize(item.size, locale)}
                  {item.durationSeconds !== undefined
                    ? ` · ${formatDuration(item.durationSeconds)}`
                    : ""}
                </p>
              </div>
            </div>
          );
        }}
      />

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
          onOpenChange(false);
        }}
      />
    </>
  );
}
