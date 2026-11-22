"use client";

import * as React from "react";
import Image from "next/image";
import { FileAudio, FileText, Upload, X, RefreshCw, CheckCircle2 } from "lucide-react";
import { upload } from "@vercel/blob/client";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@idcr/ui";
import { Button } from "@src/components/ui/button";
import { Checkbox } from "@src/components/ui/checkbox";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Notice } from "@src/components/ui/notice";
import { Textarea } from "@src/components/ui/textarea";
import {
  MEDIA_KINDS,
  filenameStemToDefaultTitle,
  formatDuration,
  formatFileSize,
  getAcceptAttributeForKinds,
  getMediaKindForContentType,
  getMediaSizeCapForContentType,
  isAllowedMediaContentType,
  isMediaSelectable,
  normalizeMediaContentType,
  type MediaKind,
} from "@src/lib/media/policy";
import {
  computeFileSha256,
  readAudioDuration,
  readImageDimensions,
} from "@src/lib/media/client-file";
import {
  confirmMediaUploadAction,
  prepareMediaUploadAction,
  type SerializedMediaDoc,
} from "@src/app/[locale]/(app)/content/media/actions";

export interface MediaUploadPanelProps {
  readonly acceptKinds?: readonly MediaKind[];
  readonly submitLabel: string;
  readonly onComplete: (doc: SerializedMediaDoc) => void;
  readonly onCancel?: () => void;
  readonly onUploadingChange?: (uploading: boolean) => void;
}

type UploadStage =
  | { readonly phase: "idle" }
  | { readonly phase: "hashing"; readonly file: File }
  | {
      readonly phase: "duplicate";
      readonly file: File;
      readonly existing: SerializedMediaDoc;
    }
  | {
      readonly phase: "uploading";
      readonly file: File;
      readonly percentage: number;
    }
  | {
      readonly phase: "error";
      readonly file: File;
      readonly message: string;
    }
  | {
      readonly phase: "details";
      readonly file: File;
      readonly mediaId: string;
      readonly pathname: string;
      readonly url: string;
      readonly contentType: string;
      readonly sha256: string;
      readonly width?: number;
      readonly height?: number;
      readonly durationSeconds?: number;
      readonly previewUrl?: string;
    };

export function MediaUploadPanel({
  acceptKinds = MEDIA_KINDS,
  submitLabel,
  onComplete,
  onCancel,
  onUploadingChange,
}: MediaUploadPanelProps) {
  const t = useTranslations("contentMedia");
  const locale = useLocale();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);

  const [stage, setStage] = React.useState<UploadStage>({ phase: "idle" });
  const [isDragging, setIsDragging] = React.useState(false);
  const [inlineError, setInlineError] = React.useState<string | null>(null);

  // Details form state (mandatory after upload completes)
  const [titleEs, setTitleEs] = React.useState("");
  const [altEs, setAltEs] = React.useState("");
  const [altEn, setAltEn] = React.useState("");
  const [decorative, setDecorative] = React.useState(false);
  const [isSavingDetails, setIsSavingDetails] = React.useState(false);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);

  const isBusyUploading =
    stage.phase === "hashing" || stage.phase === "uploading";
  const onUploadingChangeRef = React.useRef(onUploadingChange);
  onUploadingChangeRef.current = onUploadingChange;

  React.useEffect(() => {
    onUploadingChange?.(isBusyUploading);
  }, [isBusyUploading, onUploadingChange]);

  // Edge case #10: warn before closing/reloading tab mid-upload.
  React.useEffect(() => {
    if (!isBusyUploading) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isBusyUploading]);

  // Clean up object URLs, active abort controller, and parent uploading state on unmount.
  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      onUploadingChangeRef.current?.(false);
    };
  }, []);

  React.useEffect(() => {
    if (stage.phase !== "details" || !stage.previewUrl) return;
    const url = stage.previewUrl;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [stage]);

  const limitsText = React.useMemo(() => {
    if (acceptKinds.length === 1) {
      const only = acceptKinds[0];
      if (only === "image") return t("upload.limits.image");
      if (only === "pdf") return t("upload.limits.pdf");
      if (only === "audio") return t("upload.limits.audio");
    }
    return t("upload.limits.all");
  }, [acceptKinds, t]);

  const resetToIdle = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStage({ phase: "idle" });
    setInlineError(null);
    setDetailsError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startFileUpload = async (file: File) => {
    setInlineError(null);
    setDetailsError(null);

    const normalizedType = normalizeMediaContentType(file.type);
    const kind = getMediaKindForContentType(normalizedType);
    if (
      !isAllowedMediaContentType(normalizedType) ||
      !kind ||
      !acceptKinds.includes(kind)
    ) {
      setInlineError(t("errors.unsupportedType"));
      return;
    }

    const cap = getMediaSizeCapForContentType(normalizedType);
    if (cap !== null && file.size > cap) {
      setInlineError(
        t("errors.fileTooLarge", { max: formatFileSize(cap, locale) }),
      );
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStage({ phase: "hashing", file });

    try {
      const [sha256, dims, durationSeconds] = await Promise.all([
        computeFileSha256(file),
        kind === "image" ? readImageDimensions(file) : Promise.resolve(undefined),
        kind === "audio" ? readAudioDuration(file) : Promise.resolve(undefined),
      ]);
      if (controller.signal.aborted) return;

      const prepared = await prepareMediaUploadAction({
        filename: file.name,
        contentType: normalizedType,
        size: file.size,
        sha256,
      });
      if (controller.signal.aborted) return;

      if (!prepared.ok) {
        const msg =
          prepared.reason === "forbidden"
            ? t("errors.forbidden")
            : prepared.reason === "file-too-large"
              ? t("errors.fileTooLarge", {
                  max: formatFileSize(prepared.maxBytes, locale),
                })
              : prepared.reason === "unsupported-type"
                ? t("errors.unsupportedType")
                : t("errors.uploadFailed");
        abortControllerRef.current = null;
        setStage({ phase: "error", file, message: msg });
        return;
      }

      if (prepared.status === "duplicate") {
        abortControllerRef.current = null;
        setStage({
          phase: "duplicate",
          file,
          existing: prepared.existing,
        });
        return;
      }

      setStage({ phase: "uploading", file, percentage: 0 });

      const blob = await upload(prepared.pathname, file, {
        access: "public",
        handleUploadUrl: "/api/media/upload",
        multipart: prepared.multipart,
        contentType: prepared.normalizedContentType,
        clientPayload: JSON.stringify({
          mediaId: prepared.mediaId,
          contentType: prepared.normalizedContentType,
          size: file.size,
        }),
        abortSignal: controller.signal,
        onUploadProgress: (progress) => {
          setStage((prev) =>
            prev.phase === "uploading"
              ? { ...prev, percentage: Math.round(progress.percentage) }
              : prev,
          );
        },
      });

      abortControllerRef.current = null;
      const previewUrl =
        kind === "image" && typeof URL.createObjectURL === "function"
          ? URL.createObjectURL(file)
          : undefined;

      setTitleEs(filenameStemToDefaultTitle(file.name));
      setAltEs("");
      setAltEn("");
      setDecorative(false);

      setStage({
        phase: "details",
        file,
        mediaId: prepared.mediaId,
        pathname: blob.pathname,
        url: blob.url,
        contentType: prepared.normalizedContentType,
        sha256,
        ...(dims && { width: dims.width, height: dims.height }),
        ...(durationSeconds !== undefined && { durationSeconds }),
        ...(previewUrl && { previewUrl }),
      });
    } catch (err) {
      abortControllerRef.current = null;
      if (
        err instanceof Error &&
        (err.name === "BlobRequestAbortedError" || err.name === "AbortError")
      ) {
        setStage({ phase: "error", file, message: t("upload.cancelled") });
        return;
      }
      setStage({ phase: "error", file, message: t("errors.uploadFailed") });
    }
  };

  const handleCancelUpload = () => {
    abortControllerRef.current?.abort();
  };

  const handleConfirmDetails = async (e: React.FormEvent<HTMLFormElement>) => {
    // Lesson H #2: isolated form stops submit bubbling through portals to parent EntryEditor.
    e.preventDefault();
    e.stopPropagation();

    if (stage.phase !== "details") return;
    setDetailsError(null);

    const trimmedTitle = titleEs.trim();
    if (!trimmedTitle) {
      setDetailsError(t("errors.nameRequired"));
      return;
    }

    const isImage = stage.contentType.startsWith("image/");
    if (isImage && !decorative && !altEs.trim()) {
      setDetailsError(t("errors.altRequired"));
      return;
    }

    setIsSavingDetails(true);
    try {
      const res = await confirmMediaUploadAction({
        mediaId: stage.mediaId,
        pathname: stage.pathname,
        url: stage.url,
        filename: stage.file.name,
        sha256: stage.sha256,
        ...(stage.width !== undefined && { width: stage.width }),
        ...(stage.height !== undefined && { height: stage.height }),
        ...(stage.durationSeconds !== undefined && {
          durationSeconds: stage.durationSeconds,
        }),
        title: { "es-AR": trimmedTitle },
        ...(isImage &&
          !decorative && {
            alt: {
              "es-AR": altEs.trim(),
              ...(altEn.trim() ? { "en-US": altEn.trim() } : {}),
            },
          }),
        ...(isImage && decorative && { decorative: true }),
      });

      if (!res.ok) {
        if (res.reason === "policy-violation") {
          setDetailsError(t("errors.policyViolation"));
        } else if (res.reason === "storage-not-configured") {
          setDetailsError(t("errors.storageNotConfigured"));
        } else if (res.reason === "forbidden") {
          setDetailsError(t("errors.forbidden"));
        } else if (res.reason === "invalid" && res.fieldErrors["alt.es-AR"]) {
          setDetailsError(t("errors.altRequired"));
        } else {
          setDetailsError(t("errors.confirmFailed"));
        }
        return;
      }

      onComplete(res.doc);
    } finally {
      setIsSavingDetails(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void startFileUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void startFileUpload(file);
    }
  };

  if (stage.phase === "duplicate") {
    const existing = stage.existing;
    const isExistingImage = existing.contentType.startsWith("image/");
    const selectable = isMediaSelectable(existing);
    const existingTitle =
      locale === "en-US" && existing.title["en-US"]?.trim()
        ? existing.title["en-US"]
        : existing.title["es-AR"];
    const existingAlt =
      (locale === "en-US" && existing.alt?.["en-US"]?.trim()
        ? existing.alt["en-US"]
        : existing.alt?.["es-AR"]) ?? existingTitle;

    return (
      <div className="space-y-4">
        <Notice variant="info" title={t("upload.duplicateTitle")}>
          {t("upload.duplicateBody")}
        </Notice>

        <div className="flex items-center gap-4 rounded-md border border-border p-3">
          {isExistingImage ? (
            <div className="relative size-16 shrink-0 overflow-hidden rounded border border-border bg-muted">
              <Image
                src={existing.url}
                alt={existingAlt}
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          ) : existing.contentType.startsWith("audio/") ? (
            <div className="flex size-16 shrink-0 items-center justify-center rounded border border-border bg-muted">
              <FileAudio className="size-7 text-muted-foreground" aria-hidden="true" />
            </div>
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded border border-border bg-muted">
              <FileText className="size-7 text-muted-foreground" aria-hidden="true" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate font-medium text-foreground">
              {existingTitle}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {existing.filename} · {formatFileSize(existing.size, locale)}
              {existing.width && existing.height
                ? ` · ${existing.width}×${existing.height}`
                : ""}
              {existing.durationSeconds !== undefined
                ? ` · ${formatDuration(existing.durationSeconds)}`
                : ""}
            </p>
            {!selectable && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                {t("picker.missingDescriptionHint")}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={resetToIdle}>
            {t("upload.chooseAnother")}
          </Button>
          <Button
            type="button"
            disabled={!selectable}
            onClick={() => onComplete(existing)}
          >
            <CheckCircle2 className="mr-1.5 size-4" aria-hidden="true" />
            {t("upload.useExisting")}
          </Button>
        </div>
      </div>
    );
  }

  if (stage.phase === "details") {
    const isImage = stage.contentType.startsWith("image/");
    const canSubmit =
      !isSavingDetails &&
      titleEs.trim().length > 0 &&
      (!isImage || decorative || altEs.trim().length > 0);

    return (
      <form onSubmit={handleConfirmDetails} className="space-y-4">
        <div className="flex items-start gap-4 rounded-md border border-border bg-muted/30 p-3">
          {isImage ? (
            <div className="relative size-20 shrink-0 overflow-hidden rounded border border-border bg-muted">
              <Image
                src={stage.previewUrl ?? stage.url}
                alt={altEs || titleEs}
                fill
                unoptimized
                className="object-cover"
              />
            </div>
          ) : stage.contentType.startsWith("audio/") ? (
            <div className="flex size-16 shrink-0 items-center justify-center rounded border border-border bg-muted">
              <FileAudio className="size-7 text-muted-foreground" aria-hidden="true" />
            </div>
          ) : (
            <div className="flex size-16 shrink-0 items-center justify-center rounded border border-border bg-muted">
              <FileText className="size-7 text-muted-foreground" aria-hidden="true" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-0.5 text-sm">
            <p className="truncate font-medium text-foreground">
              {stage.file.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(stage.file.size, locale)}
              {stage.width && stage.height
                ? ` · ${stage.width}×${stage.height} px`
                : ""}
              {stage.durationSeconds !== undefined
                ? ` · ${formatDuration(stage.durationSeconds)}`
                : ""}
            </p>
          </div>
        </div>

        {detailsError && <Notice variant="error">{detailsError}</Notice>}

        <Field
          label={t("details.nameLabel")}
          htmlFor="media-upload-title"
          requiredToPublish
        >
          <Input
            id="media-upload-title"
            value={titleEs}
            onChange={(e) => setTitleEs(e.target.value)}
            required
          />
        </Field>

        {isImage && (
          <>
            <Field
              label={t("details.altEsLabel")}
              htmlFor="media-upload-alt-es"
              requiredToPublish={!decorative}
              hint={t("details.altHelp")}
            >
              <Textarea
                id="media-upload-alt-es"
                value={altEs}
                onChange={(e) => setAltEs(e.target.value)}
                disabled={decorative}
                rows={2}
                className="min-h-16"
              />
            </Field>

            <Field
              label={t("details.altEnLabel")}
              htmlFor="media-upload-alt-en"
            >
              <Input
                id="media-upload-alt-en"
                value={altEn}
                onChange={(e) => setAltEn(e.target.value)}
                disabled={decorative}
              />
            </Field>

            <Checkbox
              id="media-upload-decorative"
              checked={decorative}
              onChange={(e) => setDecorative(e.target.checked)}
              label={t("details.decorative")}
            />
          </>
        )}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={isSavingDetails}
            onClick={() => {
              resetToIdle();
              onCancel?.();
            }}
          >
            {t("upload.cancel")}
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {isSavingDetails ? t("upload.saving") : submitLabel}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      {inlineError && <Notice variant="error">{inlineError}</Notice>}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/20",
        )}
      >
        <Upload className="size-8 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm text-foreground">
            {t("upload.dropPrompt")}{" "}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-1"
              disabled={isBusyUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {t("upload.chooseFile")}
            </Button>
          </p>
          <p className="text-xs text-muted-foreground">{limitsText}</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={getAcceptAttributeForKinds(acceptKinds)}
          onChange={handleFileInputChange}
          className="sr-only"
          aria-label={t("upload.chooseFile")}
        />
      </div>

      {stage.phase === "hashing" && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{stage.file.name}</p>
            <p className="text-xs text-muted-foreground">
              {t("upload.hashing")}
            </p>
          </div>
        </div>
      )}

      {stage.phase === "uploading" && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate font-medium">{stage.file.name}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancelUpload}
            >
              <X className="mr-1 size-3.5" aria-hidden="true" />
              {t("upload.cancel")}
            </Button>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={stage.percentage}
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${stage.percentage}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("upload.uploading", { percentage: stage.percentage })}
          </p>
        </div>
      )}

      {stage.phase === "error" && (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/50 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-0.5 text-sm">
            <p className="truncate font-medium text-foreground">
              {stage.file.name}
            </p>
            <p className="text-xs text-destructive">{stage.message}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void startFileUpload(stage.file)}
            >
              <RefreshCw className="mr-1 size-3.5" aria-hidden="true" />
              {t("upload.retry")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetToIdle}
            >
              {t("upload.chooseAnother")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
