"use client";

import * as React from "react";
import {
  NodeViewWrapper,
  type Editor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { ExternalLink, FileAudio, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Locale } from "@idcr/content";
import { Button } from "@src/components/ui/button";
import { MediaPicker } from "@src/components/content/media";
import {
  getMediaByIdsAction,
  type SerializedMediaDoc,
} from "@src/app/[locale]/(app)/content/media/actions";
import {
  formatDuration,
  formatFileSize,
  type MediaKind,
} from "@src/lib/media/policy";

export interface SermonEmbeddedMediaContextValue {
  readonly mediaMap: Readonly<Record<string, SerializedMediaDoc>>;
  readonly onMediaResolved: (doc: SerializedMediaDoc) => void;
  readonly canUpload: boolean;
  readonly readOnly: boolean;
  readonly locale: Locale;
}

export const SermonEmbeddedMediaContext =
  React.createContext<SermonEmbeddedMediaContextValue>({
    mediaMap: {},
    onMediaResolved: () => {},
    canUpload: false,
    readOnly: true,
    locale: "es-AR",
  });

function pickMediaTitle(doc: SerializedMediaDoc, locale: Locale): string {
  if (locale === "en-US" && doc.title["en-US"]?.trim()) {
    return doc.title["en-US"];
  }
  return doc.title["es-AR"]?.trim() || doc.filename;
}

/**
 * TipTap React NodeView for `embeddedMedia` blocks inside sermon rich text
 * (`F-editor-ux-decisions.md` §2.6 & §3.3). Displays an atomic non-editable
 * audio or PDF card with mini-player / link and Cambiar / Quitar controls.
 */
export function SermonEmbeddedMediaNodeView({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: ReactNodeViewProps<HTMLElement>) {
  const t = useTranslations("contentSermons.richText");
  const { mediaMap, onMediaResolved, canUpload, readOnly, locale } =
    React.useContext(SermonEmbeddedMediaContext);

  const mediaId =
    typeof node.attrs?.mediaId === "string" ? node.attrs.mediaId : "";
  const doc = mediaId ? mediaMap[mediaId] : undefined;

  const [isLoading, setIsLoading] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!mediaId || doc) return;
    let cancelled = false;
    setIsLoading(true);
    void getMediaByIdsAction([mediaId]).then((res) => {
      if (cancelled) return;
      if (res.ok && res.items[0]) {
        onMediaResolved(res.items[0]);
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [doc, mediaId, onMediaResolved]);

  const isAudio = doc?.contentType.startsWith("audio/") ?? false;
  const isPdf = doc?.contentType === "application/pdf";
  const acceptKind: MediaKind = isAudio ? "audio" : "pdf";

  return (
    <NodeViewWrapper
      as="div"
      contentEditable={false}
      data-embedded-media-card={mediaId}
      className={`my-3 rounded-md border bg-muted/30 p-3 not-prose ${
        selected ? "border-primary ring-1 ring-primary" : "border-border"
      }`}
    >
      {isLoading && !doc ? (
        <p className="text-xs text-muted-foreground">{t("loadingMedia")}</p>
      ) : !doc ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t("missingMedia", { id: mediaId || "—" })}
          </p>
          {!readOnly && (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPickerOpen(true)}
              >
                {t("change")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={() => deleteNode()}
              >
                {t("remove")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {isAudio ? (
                <FileAudio
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
              ) : (
                <FileText
                  className="size-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
              )}
              <span className="rounded bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground border border-border">
                {isAudio ? t("audioBadge") : t("pdfBadge")}
              </span>
              <span className="truncate text-sm font-medium text-foreground">
                {pickMediaTitle(doc, locale)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatFileSize(doc.size)}
                {isAudio && doc.durationSeconds !== undefined
                  ? ` · ${formatDuration(doc.durationSeconds)}`
                  : ""}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {isPdf && (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground hover:bg-muted"
                >
                  {t("openPdf")}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}
              {!readOnly && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setPickerOpen(true)}
                  >
                    {t("change")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => deleteNode()}
                  >
                    {t("remove")}
                  </Button>
                </>
              )}
            </div>
          </div>

          {isAudio && (
            <audio
              controls
              preload="metadata"
              src={doc.url}
              className="h-9 w-full"
            />
          )}
        </div>
      )}

      {!readOnly && (
        <MediaPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          accept={doc ? acceptKind : ["audio", "pdf"]}
          selectedIds={mediaId ? [mediaId] : []}
          canUpload={canUpload}
          onSelect={(chosen) => {
            const first = chosen[0];
            if (!first) return;
            onMediaResolved(first);
            updateAttributes({ mediaId: first._id });
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export interface SermonRichTextToolbarExtrasProps {
  readonly editor: Editor;
  readonly readOnly: boolean;
  readonly canUpload: boolean;
  readonly onMediaResolved: (doc: SerializedMediaDoc) => void;
}

/**
 * Toolbar slot rendered right before Undo/Redo in `RichTextEditor` (`profile="sermon"`):
 * inserts an `embeddedMedia` audio or PDF card via `ICR-196`'s `MediaPicker`.
 */
export function SermonRichTextToolbarExtras({
  editor,
  readOnly,
  canUpload,
  onMediaResolved,
}: SermonRichTextToolbarExtrasProps) {
  const t = useTranslations("contentSermons.richText");
  const [pickerKind, setPickerKind] = React.useState<"audio" | "pdf" | null>(
    null,
  );

  const handleInsert = (chosen: SerializedMediaDoc[]) => {
    const first = chosen[0];
    if (!first) return;
    onMediaResolved(first);
    editor
      .chain()
      .focus()
      .insertContent({
        type: "embeddedMedia",
        attrs: { mediaId: first._id },
      })
      .run();
  };

  return (
    <>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={readOnly}
        title={t("insertAudioTitle")}
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setPickerKind("audio")}
      >
        <FileAudio className="size-3.5" aria-hidden="true" />
        {t("insertAudio")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={readOnly}
        title={t("insertPdfTitle")}
        className="h-7 gap-1 px-2 text-xs"
        onClick={() => setPickerKind("pdf")}
      >
        <FileText className="size-3.5" aria-hidden="true" />
        {t("insertPdf")}
      </Button>

      {pickerKind && (
        <MediaPicker
          open={true}
          onOpenChange={(open) => {
            if (!open) setPickerKind(null);
          }}
          accept={pickerKind}
          canUpload={canUpload}
          onSelect={(chosen) => {
            handleInsert(chosen);
            setPickerKind(null);
          }}
        />
      )}
    </>
  );
}
