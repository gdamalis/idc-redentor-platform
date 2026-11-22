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
  getMediaByIdsAction,
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
  /** Alias for `initialSelectedIds` (matches `ICR-196` spec & Wave 4 callers). */
  readonly selectedIds?: readonly string[];
  /** True when the current user holds `media:manage`. Picking existing files needs only `content:write`. */
  readonly canUpload: boolean;
  readonly onSelect: (items: SerializedMediaDoc[]) => void;
}

const PAGE_SIZE = 24;

function pickLocalizedText(
  value: { readonly "es-AR": string; readonly "en-US"?: string } | undefined,
  locale: string,
): string {
  if (!value) return "";
  if (locale === "en-US" && value["en-US"]?.trim()) return value["en-US"];
  return value["es-AR"];
}

export function MediaPicker({
  open,
  onOpenChange,
  accept,
  multiple = false,
  maxSelect,
  initialSelectedIds,
  selectedIds: selectedIdsProp,
  canUpload,
  onSelect,
}: MediaPickerProps) {
  const t = useTranslations("contentMedia");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const resolvedInitialSelected = selectedIdsProp ?? initialSelectedIds ?? [];
  const acceptKey = typeof accept === "string" ? accept : accept.join(",");
  const acceptKinds = React.useMemo<readonly MediaKind[]>(
    () => (acceptKey ? (acceptKey.split(",") as MediaKind[]) : []),
    [acceptKey],
  );

  const [tab, setTab] = React.useState<"library" | "upload">("library");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [items, setItems] = React.useState<SerializedMediaDoc[]>([]);
  const [hydratedById, setHydratedById] = React.useState<
    Readonly<Record<string, SerializedMediaDoc>>
  >({});
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([
    ...resolvedInitialSelected,
  ]);
  const [hydratingCount, setHydratingCount] = React.useState(0);
  const [isUploading, setIsUploading] = React.useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = React.useState(false);

  const wasOpenRef = React.useRef(false);
  const initialSelectedRef = React.useRef(resolvedInitialSelected);
  initialSelectedRef.current = resolvedInitialSelected;
  const requestedHydrationRef = React.useRef<Set<string>>(new Set());
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const hydratedByIdRef = React.useRef(hydratedById);
  hydratedByIdRef.current = hydratedById;
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
          setHydratedById((prev) => {
            const next = { ...prev };
            for (const item of res.items) next[item._id] = item;
            return next;
          });
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
      requestedHydrationRef.current.clear();
    }
    wasOpenRef.current = open;
  }, [open]);

  // C1: hydrate pre-selected IDs that live on page 2+ (or before library loads) so multi-select never drops them.
  React.useEffect(() => {
    if (!open || selectedIds.length === 0) return;
    const loadedIds = new Set(itemsRef.current.map((item) => item._id));
    const missing = selectedIds.filter(
      (id) =>
        !loadedIds.has(id) &&
        !hydratedByIdRef.current[id] &&
        !requestedHydrationRef.current.has(id),
    );
    if (missing.length === 0) return;
    for (const id of missing) requestedHydrationRef.current.add(id);
    setHydratingCount((c) => c + 1);
    void getMediaByIdsAction(missing)
      .then((res) => {
        if (!isMountedRef.current || !res.ok) return;
        setHydratedById((prev) => {
          const next = { ...prev };
          for (const doc of res.items) next[doc._id] = doc;
          return next;
        });
      })
      .finally(() => {
        if (isMountedRef.current) {
          setHydratingCount((c) => Math.max(0, c - 1));
        }
      });
  }, [open, selectedIds]);

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

  const allKnownById = React.useMemo(() => {
    const map = new Map<string, SerializedMediaDoc>();
    for (const [id, doc] of Object.entries(hydratedById)) {
      map.set(id, doc);
    }
    for (const item of items) {
      map.set(item._id, item);
    }
    return map;
  }, [hydratedById, items]);

  const selectedDocs = React.useMemo(() => {
    return selectedIds
      .map((id) => allKnownById.get(id))
      .filter((doc): doc is SerializedMediaDoc => doc !== undefined);
  }, [allKnownById, selectedIds]);

  const hasUnselectableSelection = selectedDocs.some(
    (doc) => !isMediaSelectable(doc),
  );
  const isHydratingSelection = hydratingCount > 0;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isUploading) {
      setShowLeaveConfirm(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleConfirmSelection = (ids: string[]) => {
    if (isHydratingSelection) return;
    const chosen = ids
      .map((id) => allKnownById.get(id))
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
    setHydratedById((prev) => ({ ...prev, [doc._id]: doc }));
    if (multiple) {
      const mergedIds = [...new Set([...selectedIds, doc._id])];
      const byId = new Map(allKnownById);
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
          disabled={isUploading}
          onClick={() => {
            if (!isUploading) setTab("library");
          }}
          className={cn(
            "rounded px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
      const altText = pickLocalizedText(doc.alt, locale);
      return (
        <div className="space-y-0.5">
          <p className="truncate font-medium text-foreground">
            {doc.filename} · {formatFileSize(doc.size, locale)}
            {doc.width && doc.height ? ` · ${doc.width}×${doc.height}` : ""}
            {doc.durationSeconds !== undefined
              ? ` · ${formatDuration(doc.durationSeconds)}`
              : ""}
          </p>
          {altText && (
            <p className="truncate text-muted-foreground">{altText}</p>
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
        confirmDisabled={hasUnselectableSelection || isHydratingSelection}
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
          const itemTitle = pickLocalizedText(item.title, locale);
          const itemAlt = pickLocalizedText(item.alt, locale) || itemTitle;
          if (item.contentType.startsWith("image/")) {
            return (
              <div className="space-y-1.5">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded bg-muted">
                  <Image
                    src={item.url}
                    alt={itemAlt}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
                <p className="truncate text-xs font-medium text-foreground">
                  {itemTitle}
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
                  {itemTitle}
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
