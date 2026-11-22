"use client";

import * as React from "react";
import { ArrowLeft, ExternalLink, Eye, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ContentStatus, Locale } from "@idcr/content";
import { Link, useRouter } from "@src/i18n/routing";
import type { ContentReferenceUsage } from "@src/lib/content/errors";
import { computeEditorActionState } from "@src/lib/content/action-state";
import { translateFieldErrors } from "@src/lib/content/field-errors";
import { getEntryEditorHref } from "@src/lib/content/routes";
import {
  countMissingEnglishInDraft,
  formatAdminTimestamp,
  formatShortTime,
  isNeedsReviewDraft,
} from "@src/lib/content/status-helpers";
import {
  checkContentUsagesAction,
  confirmPublishAction,
  createContentAction,
  deleteContentAction,
  discardChangesAction,
  preparePublishAction,
  retryRevalidationAction,
  saveDraftAction,
  unpublishContentAction,
  type PreparePublishResult,
  type SerializedContentDoc,
  type SerializedContentFailure,
} from "@src/app/[locale]/(app)/content/actions";
import { ActionMenu, type ActionMenuItem } from "@src/components/ui/action-menu";
import { Button } from "@src/components/ui/button";
import { ConfirmDialog } from "@src/components/ui/confirm-dialog";
import { Notice } from "@src/components/ui/notice";
import { ConflictDialog, type ConflictInfo } from "./conflict-dialog";
import type {
  EntryEditorProps,
  PublishDialogContext,
} from "./entry-editor-types";
import { ErrorSummary, focusFieldByPath } from "./error-summary";
import { InUseDialog } from "./in-use-dialog";
import { LocaleTabs } from "./locale-tabs";
import { PublishDialog } from "./publish-dialog";
import {
  NeedsReviewChip,
  ProtectedChip,
  StatusChip,
} from "./status-chip";
import { useEntryForm } from "./use-entry-form";

type PendingMutation =
  | { readonly kind: "save" }
  | { readonly kind: "prepare-publish" }
  | { readonly kind: "confirm-publish" }
  | { readonly kind: "discard" }
  | { readonly kind: "unpublish" }
  | { readonly kind: "delete" };

/**
 * Shared entry editor frame (`F-editor-ux-decisions.md` §2.2–§2.5, §2.8–§2.9,
 * §2.11, §7 #10). Every content editor (verses in `ICR-197`, site editors in
 * `ICR-198`, posts/topics/authors in `ICR-199`, sermons in `ICR-200`) plugs
 * into this frame via render slots and optional `actionOverrides`.
 */
export function EntryEditor<TFields extends object>({
  collection,
  docId: initialDocId,
  initialDoc,
  initialStatus,
  initialValues,
  backHref,
  backLabel,
  getTitle,
  permissions,
  isTrialMode,
  isPublishEmailsEnabled: initialPublishEmailsEnabled = false,
  isProtected = false,
  protectedKind = "legal",
  fixedIdentifier,
  fixedAppearsOn,
  liveUrl,
  renderLocalizedFields,
  renderGeneralFields,
  countMissingEn,
  topNotices,
  publishDialogExtras,
  getPublishOptions,
  excludeFromPatch,
  actionOverrides,
  onAfterSave,
  customFieldErrorMap,
}: EntryEditorProps<TFields>) {
  const t = useTranslations("content");
  const tCommon = useTranslations("common");
  const panelLocale = useLocale();
  const router = useRouter();

  const [docId, setDocId] = React.useState<string | undefined>(initialDocId);
  const [docMeta, setDocMeta] = React.useState<
    SerializedContentDoc<TFields> | undefined
  >(initialDoc);
  const [status, setStatus] = React.useState<ContentStatus>(initialStatus);
  const [activeLocale, setActiveLocale] = React.useState<Locale>("es-AR");

  const [isSaving, setIsSaving] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isMutatingMenu, setIsMutatingMenu] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = React.useState<{
    readonly variant: "success" | "warning" | "error";
    readonly message: string;
    readonly showRetryRevalidate?: boolean;
  } | null>(null);
  const [validationContext, setValidationContext] = React.useState<
    "publish" | "draft"
  >("publish");

  // Dialog states
  const [publishDialogCtx, setPublishDialogCtx] =
    React.useState<PublishDialogContext | null>(null);
  const [conflict, setConflict] = React.useState<ConflictInfo | null>(null);
  const [pendingConflictOp, setPendingConflictOp] =
    React.useState<PendingMutation | null>(null);
  const [discardOpen, setDiscardOpen] = React.useState(false);
  const [unpublishOpen, setUnpublishOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [inUseList, setInUseList] = React.useState<
    readonly ContentReferenceUsage[] | null
  >(null);
  const [pendingLeaveHref, setPendingLeaveHref] = React.useState<string | null>(
    null,
  );
  const [lossyConfirmPending, setLossyConfirmPending] = React.useState<
    (() => void) | null
  >(null);
  const [lossyConfirmed, setLossyConfirmed] = React.useState(false);

  const errorSummaryRef = React.useRef<HTMLDivElement>(null);
  const skipLeaveGuardRef = React.useRef(false);

  const storageKey = `idcr-admin:draft:${collection}:${docId ?? "new"}`;
  const form = useEntryForm<TFields>({
    initialValues,
    loadedRevision: initialDoc?.revision ?? 0,
    storageKey,
    excludeFromPatch,
  });

  const isNew = docId === undefined;
  const hasPublishedCopy = docMeta?.published !== undefined;
  const entryTitle = getTitle(form.values) || t("header.newEntry");
  const missingEnCount = React.useMemo(
    () =>
      countMissingEn
        ? countMissingEn(form.values)
        : countMissingEnglishInDraft(form.values),
    [countMissingEn, form.values],
  );

  const needsReview = React.useMemo(
    () =>
      docMeta
        ? isNeedsReviewDraft({
            published: docMeta.published,
            updatedBy: docMeta.updatedBy,
          })
        : false,
    [docMeta],
  );

  // Resolve action handlers (honoring Wave 4 actionOverrides)
  const actions = React.useMemo(
    () => ({
      create: actionOverrides?.create ?? createContentAction<TFields>,
      saveDraft: actionOverrides?.saveDraft ?? saveDraftAction<TFields>,
      preparePublish:
        actionOverrides?.preparePublish ?? preparePublishAction<TFields>,
      confirmPublish:
        actionOverrides?.confirmPublish ?? confirmPublishAction<TFields>,
      discardChanges:
        actionOverrides?.discardChanges ?? discardChangesAction<TFields>,
    }),
    [actionOverrides],
  );

  const actionState = computeEditorActionState({
    collection,
    status,
    isNew,
    isDirty: form.isDirty,
    isSaving,
    isPublishing,
    isProtected,
    hasPublishedCopy,
    canWrite: permissions.canWrite,
    canPublish: permissions.canPublish,
    canPublishProtected: permissions.canPublishProtected,
  });

  // Translate server validation errors into panel locale (zero raw Zod strings)
  const translatedErrors = React.useMemo(
    () =>
      translateFieldErrors(form.fieldErrors, {
        lookupFieldMessage: (key) => {
          const fullKey = `errors.fields.${key}`;
          return t.has(fullKey as never) ? t(fullKey as never) : undefined;
        },
        customFieldErrorMap,
        slugTakenMessage: t("errors.slugTaken"),
        duplicateKeyMessage: t("errors.duplicateKey"),
        fallbackMessage: t("errors.genericField"),
      }),
    [customFieldErrorMap, form.fieldErrors, t],
  );

  const focusErrorSummary = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      errorSummaryRef.current?.focus();
    });
  }, []);

  // Capture-phase in-app link guard when dirty (UX §2.3)
  React.useEffect(() => {
    if (!form.isDirty) return;
    const handleDocumentClick = (event: MouseEvent) => {
      if (skipLeaveGuardRef.current) return;
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.origin && anchor.origin !== window.location.origin) return;
      const currentUrl = window.location.pathname + window.location.search;
      if (href === currentUrl) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingLeaveHref(href);
    };

    document.addEventListener("click", handleDocumentClick, true);
    return () =>
      document.removeEventListener("click", handleDocumentClick, true);
  }, [form.isDirty]);

  const handleFailure = React.useCallback(
    (failure: SerializedContentFailure, op: PendingMutation) => {
      if (failure.reason === "conflict") {
        setConflict({
          updatedBy: failure.updatedBy,
          updatedByLabel: failure.updatedByLabel,
          updatedAt: failure.updatedAt,
          currentRevision: failure.currentRevision,
        });
        setPendingConflictOp(op);
        return;
      }
      if (failure.reason === "invalid" || failure.reason === "duplicate-key") {
        setValidationContext(
          op.kind === "prepare-publish" || op.kind === "confirm-publish"
            ? "publish"
            : "draft",
        );
        form.setFieldErrors(failure.fieldErrors);
        focusErrorSummary();
        return;
      }
      if (failure.reason === "in-use") {
        setInUseList(failure.usedBy);
        return;
      }
      if (failure.reason === "forbidden") {
        setStatusFeedback({ variant: "error", message: t("errors.forbidden") });
        return;
      }
      if (failure.reason === "not-found") {
        setStatusFeedback({ variant: "error", message: t("errors.notFound") });
        return;
      }
      if (failure.reason === "operation-not-allowed") {
        setStatusFeedback({
          variant: "error",
          message: t("errors.operationNotAllowed"),
        });
        return;
      }
      if (failure.reason === "published-must-unpublish") {
        setStatusFeedback({
          variant: "error",
          message: t("errors.publishedMustUnpublish"),
        });
        return;
      }
      setStatusFeedback({
        variant: "error",
        message: t("errors.genericAction"),
      });
    },
    [focusErrorSummary, form, t],
  );

  const runSaveDraft = React.useCallback(
    async (
      overwrite = false,
    ): Promise<SerializedContentDoc<TFields> | null> => {
      if (form.hasDirtyLossyFields && !lossyConfirmed) {
        setLossyConfirmPending(() => () => {
          setLossyConfirmed(true);
          void runSaveDraft(overwrite);
        });
        return null;
      }

      form.flushRecovery();
      setIsSaving(true);
      setStatusFeedback(null);

      try {
        if (!docId) {
          const created = await actions.create({
            collection,
            draft: form.buildFullDraft(),
          });
          if (!created.ok) {
            handleFailure(created, { kind: "save" });
            return null;
          }
          setDocId(created.doc._id);
          setDocMeta(created.doc);
          setStatus(created.status);
          form.commitSaved(created.doc.draft, created.doc.revision);
          setLastSavedAt(formatShortTime(new Date(), panelLocale));
          onAfterSave?.(created.doc);
          // Replace URL to canonical persisted id without triggering leave guard
          skipLeaveGuardRef.current = true;
          router.replace(getEntryEditorHref(collection, created.doc._id));
          window.setTimeout(() => {
            skipLeaveGuardRef.current = false;
          }, 0);
          return created.doc;
        }

        const patch = form.buildPatch();
        const saved = await actions.saveDraft({
          collection,
          docId,
          patch,
          expectedRevision: form.revision,
          overwrite: overwrite || undefined,
        });
        if (!saved.ok) {
          handleFailure(saved, { kind: "save" });
          return null;
        }
        setDocMeta(saved.doc);
        setStatus(saved.status);
        form.commitSaved(saved.doc.draft, saved.doc.revision);
        setLastSavedAt(formatShortTime(new Date(), panelLocale));
        onAfterSave?.(saved.doc);
        return saved.doc;
      } finally {
        setIsSaving(false);
      }
    },
    [
      actions,
      collection,
      docId,
      form,
      handleFailure,
      lossyConfirmed,
      onAfterSave,
      panelLocale,
      router,
    ],
  );

  // Ctrl/Cmd+S explicit save shortcut
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!actionState.save.disabled) {
          void runSaveDraft(false);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actionState.save.disabled, runSaveDraft]);

  const runPreparePublish = React.useCallback(
    async (overwrite = false) => {
      if (form.hasDirtyLossyFields && !lossyConfirmed) {
        setLossyConfirmPending(() => () => {
          setLossyConfirmed(true);
          void runPreparePublish(overwrite);
        });
        return;
      }

      form.flushRecovery();
      setIsPublishing(true);
      setStatusFeedback(null);

      try {
        const prepared: PreparePublishResult<TFields> =
          await actions.preparePublish({
            collection,
            ...(docId
              ? {
                  docId,
                  draftPatch: form.isDirty ? form.buildPatch() : undefined,
                  expectedRevision: form.revision,
                  overwrite: overwrite || undefined,
                }
              : {
                  newDraft: form.buildFullDraft(),
                }),
          });

        if (!prepared.ok) {
          if (prepared.reason === "invalid" && "savedDoc" in prepared && prepared.savedDoc) {
            setDocId(prepared.savedDoc._id);
            setDocMeta(prepared.savedDoc);
            if (prepared.savedStatus) setStatus(prepared.savedStatus);
            form.commitSaved(
              prepared.savedDoc.draft,
              prepared.savedDoc.revision,
            );
            setLastSavedAt(formatShortTime(new Date(), panelLocale));
          }
          handleFailure(prepared, { kind: "prepare-publish" });
          return;
        }

        setDocId(prepared.doc._id);
        setDocMeta(prepared.doc);
        setStatus(prepared.status);
        form.commitSaved(prepared.doc.draft, prepared.doc.revision);
        setLastSavedAt(formatShortTime(new Date(), panelLocale));
        onAfterSave?.(prepared.doc);

        setPublishDialogCtx({
          isFirstPublish: prepared.isFirstPublish,
          isPublishEmailsEnabled:
            prepared.isPublishEmailsEnabled && initialPublishEmailsEnabled
              ? true
              : prepared.isPublishEmailsEnabled,
          isTrialMode,
          missingEnCount: countMissingEn
            ? countMissingEn(prepared.doc.draft)
            : countMissingEnglishInDraft(prepared.doc.draft),
          willCascade: prepared.willCascade,
        });
      } finally {
        setIsPublishing(false);
      }
    },
    [
      actions,
      collection,
      countMissingEn,
      docId,
      form,
      handleFailure,
      initialPublishEmailsEnabled,
      isTrialMode,
      lossyConfirmed,
      onAfterSave,
      panelLocale,
    ],
  );

  const runConfirmPublish = React.useCallback(
    async (overwrite = false) => {
      if (!docId) return;
      setIsPublishing(true);
      try {
        const extraOpts = getPublishOptions?.() ?? {};
        const published = await actions.confirmPublish({
          collection,
          docId,
          expectedRevision: form.revision,
          overwrite: overwrite || undefined,
          notify: extraOpts.notify,
          approvedConfirmed: extraOpts.approvedConfirmed,
        });
        setPublishDialogCtx(null);
        if (!published.ok) {
          handleFailure(published, { kind: "confirm-publish" });
          return;
        }
        setDocMeta(published.doc);
        setStatus(published.status);
        form.commitSaved(published.doc.draft, published.doc.revision);
        setStatusFeedback(
          published.revalidated
            ? { variant: "success", message: t("dialogs.publish.success") }
            : {
                variant: "warning",
                message: t("dialogs.publish.revalidateFailed"),
                showRetryRevalidate: true,
              },
        );
      } finally {
        setIsPublishing(false);
      }
    },
    [actions, collection, docId, form, getPublishOptions, handleFailure, t],
  );

  const handleRetryRevalidate = async () => {
    if (!docId) return;
    const res = await retryRevalidationAction({ collection, docId });
    if (res.ok && res.revalidated) {
      setStatusFeedback({
        variant: "success",
        message: t("dialogs.publish.revalidateRetried"),
      });
    }
  };

  /**
   * Synchronous tab open on click beats pop-up blockers (`F` §2.11, Edge case #7),
   * saves dirty edits first, then points the reused tab at `GET /api/content/preview`.
   */
  const handlePreview = async () => {
    const targetName = `idcr-preview:${collection}:${docId ?? "new"}`;
    const previewTab = window.open("about:blank", targetName);

    let targetId = docId;
    if (form.isDirty || !targetId) {
      const saved = await runSaveDraft(false);
      if (!saved) {
        previewTab?.close();
        return;
      }
      targetId = saved._id;
    }

    const previewUrl = `/api/content/preview?collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(targetId)}&locale=${encodeURIComponent(activeLocale)}`;
    if (previewTab) {
      previewTab.location.href = previewUrl;
      previewTab.focus();
    } else {
      window.open(previewUrl, targetName);
    }
  };

  const runDiscard = async (overwrite = false) => {
    if (!docId) return;
    setIsMutatingMenu(true);
    try {
      const res = await actions.discardChanges({
        collection,
        docId,
        expectedRevision: form.revision,
        overwrite: overwrite || undefined,
      });
      setDiscardOpen(false);
      if (!res.ok) {
        handleFailure(res, { kind: "discard" });
        return;
      }
      setDocMeta(res.doc);
      setStatus(res.status);
      form.commitSaved(res.doc.draft, res.doc.revision);
    } finally {
      setIsMutatingMenu(false);
    }
  };

  const runUnpublish = async (overwrite = false) => {
    if (!docId) return;
    setIsMutatingMenu(true);
    try {
      const res = await unpublishContentAction<TFields>({
        collection,
        docId,
        expectedRevision: form.revision,
        overwrite: overwrite || undefined,
      });
      setUnpublishOpen(false);
      if (!res.ok) {
        handleFailure(res, { kind: "unpublish" });
        return;
      }
      setDocMeta(res.doc);
      setStatus(res.status);
      form.commitSaved(res.doc.draft, res.doc.revision);
    } finally {
      setIsMutatingMenu(false);
    }
  };

  const handleRequestDelete = async () => {
    if (!docId) return;
    const usages = await checkContentUsagesAction({ collection, docId });
    if (usages.ok && usages.usedBy.length > 0) {
      setInUseList(usages.usedBy);
      return;
    }
    setDeleteOpen(true);
  };

  const runDelete = async (overwrite = false) => {
    if (!docId) return;
    setIsMutatingMenu(true);
    try {
      const res = await deleteContentAction({
        collection,
        docId,
        expectedRevision: form.revision,
        overwrite: overwrite || undefined,
      });
      setDeleteOpen(false);
      if (!res.ok) {
        handleFailure(res, { kind: "delete" });
        return;
      }
      form.clearRecovery();
      skipLeaveGuardRef.current = true;
      router.push(backHref);
    } finally {
      setIsMutatingMenu(false);
    }
  };

  const handleConflictOverwrite = () => {
    const pending = pendingConflictOp;
    setConflict(null);
    setPendingConflictOp(null);
    if (!pending) return;
    if (pending.kind === "save") void runSaveDraft(true);
    else if (pending.kind === "prepare-publish") void runPreparePublish(true);
    else if (pending.kind === "confirm-publish") void runConfirmPublish(true);
    else if (pending.kind === "discard") void runDiscard(true);
    else if (pending.kind === "unpublish") void runUnpublish(true);
    else if (pending.kind === "delete") void runDelete(true);
  };

  const handleConflictReload = () => {
    // Keep local recovery intact per UX §2.3
    form.flushRecovery();
    setConflict(null);
    setPendingConflictOp(null);
    skipLeaveGuardRef.current = true;
    router.refresh();
    window.location.reload();
  };

  const menuItems: ActionMenuItem[] = [];
  if (actionState.menu.showDiscard) {
    menuItems.push({
      id: "discard",
      label: t("action.discard"),
      variant: "destructive",
      onSelect: () => setDiscardOpen(true),
    });
  }
  if (actionState.menu.showUnpublish) {
    menuItems.push({
      id: "unpublish",
      label: t("action.unpublish"),
      variant: "destructive",
      onSelect: () => setUnpublishOpen(true),
    });
  }
  if (actionState.menu.showDelete) {
    menuItems.push({
      id: "delete",
      label: t("action.delete"),
      variant: "destructive",
      disabled: actionState.menu.deleteDisabled,
      hint:
        actionState.menu.deleteDisabledReason === "must-unpublish"
          ? t("hint.deleteNeedsUnpublish")
          : undefined,
      onSelect: () => void handleRequestDelete(),
    });
  }

  const renderCtx = {
    activeLocale,
    values: form.values,
    form,
    readOnly: actionState.isReadOnly,
    isPublished: hasPublishedCopy,
    getError: (fieldPath: string) => translatedErrors.byPath[fieldPath],
  };

  const publishDisabledHint =
    actionState.publish.reason === "no-protected-permission"
      ? t("protected.noPermission")
      : actionState.publish.reason === "no-publish-permission"
        ? t("hint.noPublishPermission")
        : undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* Sticky header & action bar (wireframes §3.3–3.4) */}
      <div className="sticky top-0 z-20 -mx-6 border-b border-border bg-background/95 px-6 py-3 backdrop-blur-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={backHref}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                <span>{backLabel}</span>
              </Link>
              <span className="text-muted-foreground/60" aria-hidden="true">
                /
              </span>
              <h1 className="truncate text-lg font-bold tracking-tight">
                {entryTitle}
              </h1>
              <StatusChip status={status} label={t(`status.${status}`)} />
              {isProtected && <ProtectedChip label={t("chip.protected")} />}
              {needsReview && <NeedsReviewChip label={t("chip.needsReview")} />}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>
                {docMeta
                  ? t("header.lastEdit", {
                      name: docMeta.updatedByLabel || docMeta.updatedBy,
                      when: formatAdminTimestamp(docMeta.updatedAt, panelLocale),
                    })
                  : t("header.notSavedYet")}
              </span>
              {fixedIdentifier && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <Lock className="size-3" aria-hidden="true" />
                  {fixedIdentifier}
                </span>
              )}
              {actionState.viewOnSite.visible && liveUrl && (
                <a
                  href={liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  <span>{t("action.viewOnSite")}</span>
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {lastSavedAt && (
              <span
                role="status"
                aria-live="polite"
                className="text-xs text-muted-foreground"
              >
                {t("header.savedAt", { time: lastSavedAt })}
              </span>
            )}

            {actionState.preview.visible && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={actionState.preview.disabled}
                title={
                  actionState.preview.disabled
                    ? t("hint.previewNeedsContent")
                    : undefined
                }
                onClick={() => void handlePreview()}
              >
                <Eye className="size-4" aria-hidden="true" />
                <span>{t("action.preview")}</span>
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionState.save.disabled}
              onClick={() => void runSaveDraft(false)}
            >
              {isSaving ? t("action.saving") : t("action.saveDraft")}
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={actionState.publish.disabled}
              title={publishDisabledHint}
              onClick={() => void runPreparePublish(false)}
            >
              {actionState.publish.showLock && (
                <Lock className="size-3.5" aria-hidden="true" />
              )}
              <span>
                {isPublishing
                  ? t("action.publishing")
                  : t(`action.${actionState.publish.labelKey}`)}
              </span>
            </Button>

            {actionState.menu.visible && (
              <ActionMenu
                triggerLabel={t("action.more")}
                items={menuItems}
              />
            )}
          </div>
        </div>

        {publishDisabledHint && (
          <p className="mt-2 text-xs text-muted-foreground">
            {publishDisabledHint}
          </p>
        )}
      </div>

      {/* Notices stack */}
      <div className="space-y-3">
        {actionState.isReadOnly && (
          <Notice variant="info">{t("header.readOnly")}</Notice>
        )}

        {isProtected && (
          <Notice variant="info">
            {protectedKind === "doctrine"
              ? t("protected.doctrine")
              : t("protected.legal")}
          </Notice>
        )}

        {topNotices}

        {form.pendingRecovery && (
          <Notice
            variant="warning"
            data-testid="local-recovery-banner"
            actions={
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => form.restoreRecovery()}
                >
                  {t("recovery.restore")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => form.dismissRecovery()}
                >
                  {t("recovery.discard")}
                </Button>
              </>
            }
          >
            {t("recovery.banner", {
              when: formatAdminTimestamp(
                new Date(form.pendingRecovery.savedAt),
                panelLocale,
              ),
            })}
          </Notice>
        )}

        {statusFeedback && (
          <Notice
            variant={statusFeedback.variant}
            actions={
              statusFeedback.showRetryRevalidate ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRetryRevalidate()}
                >
                  {t("action.retry")}
                </Button>
              ) : undefined
            }
          >
            {statusFeedback.message}
          </Notice>
        )}

        <ErrorSummary
          ref={errorSummaryRef}
          heading={
            validationContext === "publish"
              ? t("errors.summary", { count: translatedErrors.list.length })
              : t("errors.draftSummary", {
                  count: translatedErrors.list.length,
                })
          }
          errors={translatedErrors.list}
          onSelectError={(err) =>
            focusFieldByPath(err.path, err.localeTab, setActiveLocale)
          }
        />
      </div>

      {/* Locale tabs (hidden automatically when renderLocalizedFields is omitted — D20) */}
      {renderLocalizedFields && (
        <LocaleTabs
          activeLocale={activeLocale}
          onChange={setActiveLocale}
          caption={t("locale.caption")}
          esLabel={t("locale.es")}
          enLabel={t("locale.en")}
          missingEnCount={missingEnCount}
          missingEnText={
            missingEnCount > 0
              ? t("locale.missing", { count: missingEnCount })
              : undefined
          }
          errorCounts={translatedErrors.countByLocale}
        />
      )}

      {/* Main editor body: 2-column desktop when both localized + general sections exist */}
      <div
        className={
          renderLocalizedFields && renderGeneralFields
            ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]"
            : "space-y-6"
        }
      >
        {renderLocalizedFields && (
          <div className="min-w-0 space-y-5">
            {renderLocalizedFields(renderCtx)}
          </div>
        )}

        {renderGeneralFields && (
          <section className="space-y-4 rounded-md border border-border bg-muted/20 p-4">
            {renderLocalizedFields && (
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("locale.generalSection")}
              </h2>
            )}
            {renderGeneralFields(renderCtx)}
          </section>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="text-destructive" aria-hidden="true">
          *
        </span>{" "}
        {t("errors.requiredMark")}
      </p>

      {/* Dialogs */}
      {publishDialogCtx && (
        <PublishDialog
          open={publishDialogCtx !== null}
          onOpenChange={(open) => {
            if (!open) setPublishDialogCtx(null);
          }}
          title={entryTitle}
          context={publishDialogCtx}
          appearsOn={fixedAppearsOn}
          extras={publishDialogExtras?.(publishDialogCtx)}
          isPending={isPublishing}
          onConfirm={() => void runConfirmPublish(false)}
        />
      )}

      <ConflictDialog
        conflict={conflict}
        onOpenChange={(open) => {
          if (!open) {
            setConflict(null);
            setPendingConflictOp(null);
          }
        }}
        isPending={isSaving || isPublishing || isMutatingMenu}
        onReload={handleConflictReload}
        onOverwrite={handleConflictOverwrite}
      />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={t("dialogs.discard.title")}
        description={t("dialogs.discard.body")}
        closeLabel={tCommon("close")}
        cancelLabel={t("action.cancel")}
        confirmLabel={t("dialogs.discard.confirm")}
        variant="destructive"
        isPending={isMutatingMenu}
        onConfirm={() => void runDiscard(false)}
      />

      <ConfirmDialog
        open={unpublishOpen}
        onOpenChange={setUnpublishOpen}
        title={t("dialogs.unpublish.title", { title: entryTitle })}
        description={t("dialogs.unpublish.body")}
        closeLabel={tCommon("close")}
        cancelLabel={t("action.cancel")}
        confirmLabel={t("dialogs.unpublish.confirm")}
        variant="destructive"
        isPending={isMutatingMenu}
        onConfirm={() => void runUnpublish(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("dialogs.delete.title", { title: entryTitle })}
        description={t("dialogs.delete.body")}
        closeLabel={tCommon("close")}
        cancelLabel={t("action.cancel")}
        confirmLabel={t("dialogs.delete.confirm")}
        variant="destructive"
        isPending={isMutatingMenu}
        onConfirm={() => void runDelete(false)}
      />

      <InUseDialog
        open={inUseList !== null}
        onOpenChange={(open) => {
          if (!open) setInUseList(null);
        }}
        entryTitle={entryTitle}
        usedBy={inUseList ?? []}
      />

      <ConfirmDialog
        open={pendingLeaveHref !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLeaveHref(null);
        }}
        title={t("dialogs.unsaved.title")}
        description={t("dialogs.unsaved.body")}
        closeLabel={tCommon("close")}
        cancelLabel={t("dialogs.unsaved.stay")}
        confirmLabel={t("dialogs.unsaved.leave")}
        variant="destructive"
        onConfirm={() => {
          const href = pendingLeaveHref;
          setPendingLeaveHref(null);
          if (!href) return;
          skipLeaveGuardRef.current = true;
          router.push(href);
        }}
      />

      <ConfirmDialog
        open={lossyConfirmPending !== null}
        onOpenChange={(open) => {
          if (!open) setLossyConfirmPending(null);
        }}
        title={t("dialogs.lossySave.title")}
        description={t("dialogs.lossySave.body")}
        closeLabel={tCommon("close")}
        cancelLabel={t("action.cancel")}
        confirmLabel={t("dialogs.lossySave.confirm")}
        variant="destructive"
        onConfirm={() => {
          const cb = lossyConfirmPending;
          setLossyConfirmPending(null);
          cb?.();
        }}
      />
    </div>
  );
}
