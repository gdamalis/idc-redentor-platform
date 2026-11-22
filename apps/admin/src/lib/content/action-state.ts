import type { ContentStatus } from "@idcr/content";
import type { ContentCollectionName } from "@src/lib/content/errors";
import { COLLECTION_META } from "@src/lib/content/guards";
import { collectionSupportsPreview } from "./routes";

export interface EditorActionStateInput {
  readonly collection: ContentCollectionName;
  readonly status: ContentStatus;
  readonly isNew: boolean;
  readonly isDirty: boolean;
  readonly isSaving: boolean;
  readonly isPublishing: boolean;
  readonly isProtected: boolean;
  readonly hasPublishedCopy: boolean;
  readonly canWrite: boolean;
  readonly canPublish: boolean;
  readonly canPublishProtected: boolean;
}

export type PublishDisabledReason =
  | "already-published"
  | "no-publish-permission"
  | "no-protected-permission"
  | "busy";

export interface EditorActionState {
  readonly isReadOnly: boolean;
  readonly save: {
    readonly disabled: boolean;
  };
  readonly publish: {
    readonly labelKey: "publish" | "publishChanges" | "publishedDisabled";
    readonly disabled: boolean;
    readonly reason?: PublishDisabledReason;
    readonly showLock: boolean;
  };
  readonly preview: {
    readonly visible: boolean;
    readonly disabled: boolean;
  };
  readonly viewOnSite: {
    readonly visible: boolean;
  };
  readonly menu: {
    readonly visible: boolean;
    readonly showDiscard: boolean;
    readonly showUnpublish: boolean;
    readonly showDelete: boolean;
    readonly deleteDisabled: boolean;
    readonly deleteDisabledReason?: "must-unpublish";
  };
}

/**
 * Pure enable/disable & visibility matrix implementing `F-editor-ux-decisions.md`
 * §2.2 ("What is disabled when"), §2.8 (fixed entries), and §2.9 (protected
 * legal & doctrinal content).
 */
export function computeEditorActionState(
  input: EditorActionStateInput,
): EditorActionState {
  const meta = COLLECTION_META[input.collection];
  const isFixed = meta.kind === "fixed";
  const isEditorial = meta.kind === "editorial";
  const isLibrary = meta.kind === "library";
  const isBusy = input.isSaving || input.isPublishing;
  const isReadOnly = !input.canWrite;

  // Save draft: disabled when no unsaved edits, busy, or lacking content:write
  const saveDisabled = !input.canWrite || !input.isDirty || isBusy;

  // Publish button
  const hasRequiredPublishPermission = input.isProtected
    ? input.canPublish && input.canPublishProtected
    : input.canPublish;

  let publishDisabled = false;
  let publishReason: PublishDisabledReason | undefined;
  let publishLabelKey: "publish" | "publishChanges" | "publishedDisabled" =
    input.hasPublishedCopy ? "publishChanges" : "publish";
  let showLock = false;

  if (input.isProtected && !input.canPublishProtected) {
    publishDisabled = true;
    publishReason = "no-protected-permission";
    showLock = true;
  } else if (!input.canPublish) {
    publishDisabled = true;
    publishReason = "no-publish-permission";
  } else if (input.status === "published" && !input.isDirty && !input.isNew) {
    publishDisabled = true;
    publishReason = "already-published";
    publishLabelKey = "publishedDisabled";
  } else if (isBusy) {
    publishDisabled = true;
    publishReason = "busy";
  } else if (input.isNew && !input.canWrite) {
    publishDisabled = true;
    publishReason = "no-publish-permission";
  }

  // Preview: omitted on library entries (authors, bible_verses); disabled on untouched new entry
  const previewVisible = collectionSupportsPreview(input.collection);
  const previewDisabled =
    !previewVisible || isBusy || (input.isNew && !input.isDirty);

  // "Ver en el sitio": published entries with a public page
  const viewOnSiteVisible = previewVisible && input.hasPublishedCopy;

  // "⋯" menu rules
  // Discard: only entries with unpublished changes + content:write (works on protected entries too)
  const showDiscard =
    !input.isNew && input.status === "changed" && input.canWrite;

  // Unpublish: ONLY editorial (posts, sermons, topics) when published & authorized
  const showUnpublish =
    !input.isNew &&
    isEditorial &&
    input.hasPublishedCopy &&
    hasRequiredPublishPermission;

  // Delete: NEVER on fixed entries; NEVER on protected entries without content:publish-protected;
  // NEVER on brand-new unsaved entries.
  let showDelete = false;
  let deleteDisabled = false;
  let deleteDisabledReason: "must-unpublish" | undefined;

  if (!input.isNew && !isFixed) {
    if (input.isProtected && !input.canPublishProtected) {
      showDelete = false;
    } else if (isEditorial) {
      if (input.hasPublishedCopy) {
        // Shown greyed with "Despublicala primero." when user can write/delete
        if (input.canWrite || input.canPublish) {
          showDelete = true;
          deleteDisabled = true;
          deleteDisabledReason = "must-unpublish";
        }
      } else if (input.canWrite) {
        showDelete = true;
      }
    } else if (isLibrary) {
      const canDeleteLibrary = input.hasPublishedCopy
        ? input.canPublish
        : input.canWrite;
      if (canDeleteLibrary) {
        showDelete = true;
      }
    }
  }

  const menuVisible = showDiscard || showUnpublish || showDelete;

  return {
    isReadOnly,
    save: { disabled: saveDisabled },
    publish: {
      labelKey: publishLabelKey,
      disabled: publishDisabled,
      ...(publishReason !== undefined && { reason: publishReason }),
      showLock,
    },
    preview: {
      visible: previewVisible,
      disabled: previewDisabled,
    },
    viewOnSite: {
      visible: viewOnSiteVisible,
    },
    menu: {
      visible: menuVisible,
      showDiscard,
      showUnpublish,
      showDelete,
      deleteDisabled,
      ...(deleteDisabledReason !== undefined && { deleteDisabledReason }),
    },
  };
}
