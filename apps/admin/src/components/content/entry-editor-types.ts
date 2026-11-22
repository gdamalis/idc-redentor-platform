import type * as React from "react";
import type { ContentStatus, Locale } from "@idcr/content";
import type { ContentCollectionName } from "@src/lib/content/errors";
import type {
  confirmPublishAction,
  createContentAction,
  discardChangesAction,
  preparePublishAction,
  saveDraftAction,
  SerializedContentDoc,
} from "@src/app/[locale]/(app)/content/actions";
import type { UseEntryFormReturn } from "./use-entry-form";

/**
 * Overridable Server Action handlers accepted by `EntryEditor.actionOverrides`
 * (`D18`). Defaults to `content/actions.ts` when omitted so Wave 4 `ICR-200`
 * (and `ICR-199`) can wrap save/publish/discard without editing `entry-editor.tsx`
 * or `content/actions.ts`.
 */
export interface EntryEditorActionHandlers<TFields = Record<string, unknown>> {
  readonly create: typeof createContentAction<TFields>;
  readonly saveDraft: typeof saveDraftAction<TFields>;
  readonly preparePublish: typeof preparePublishAction<TFields>;
  readonly confirmPublish: typeof confirmPublishAction<TFields>;
  readonly discardChanges: typeof discardChangesAction<TFields>;
}

export interface PublishDialogContext {
  readonly isFirstPublish: boolean;
  readonly isPublishEmailsEnabled: boolean;
  readonly isTrialMode: boolean;
  readonly missingEnCount: number;
  readonly willCascade: readonly {
    readonly collection: ContentCollectionName;
    readonly docId: string;
    readonly label: string;
  }[];
}

export interface EntryEditorRenderContext<TFields> {
  readonly activeLocale: Locale;
  readonly values: TFields;
  readonly form: UseEntryFormReturn<TFields>;
  readonly readOnly: boolean;
  readonly isPublished: boolean;
  readonly getError: (fieldPath: string) => string | undefined;
}

export interface EntryEditorPermissions {
  readonly canWrite: boolean;
  readonly canPublish: boolean;
  readonly canPublishProtected: boolean;
}

export interface EntryEditorProps<TFields extends object> {
  readonly collection: ContentCollectionName;
  readonly docId?: string;
  readonly initialDoc?: SerializedContentDoc<TFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: TFields;
  readonly backHref: string;
  readonly backLabel: string;
  /** Human-friendly display title (or function deriving it from live values). */
  readonly getTitle: (values: TFields) => string;
  readonly permissions: EntryEditorPermissions;
  readonly isTrialMode: boolean;
  /** Server-evaluated `CONTENT_PUBLISH_EMAILS === "true"` (`D18`). */
  readonly isPublishEmailsEnabled?: boolean;
  readonly isProtected?: boolean;
  readonly protectedKind?: "legal" | "doctrine";
  readonly fixedIdentifier?: string;
  readonly fixedAppearsOn?: readonly string[];
  /** Public live URL for "Ver en el sitio" when published. */
  readonly liveUrl?: string;
  /** Optional localized fields slot. When omitted, `LocaleTabs` is hidden (`D20`: location, authors). */
  readonly renderLocalizedFields?: (
    ctx: EntryEditorRenderContext<TFields>,
  ) => React.ReactNode;
  /** Non-localized fields rendered under "Datos generales" (or main column when no localized fields). */
  readonly renderGeneralFields?: (
    ctx: EntryEditorRenderContext<TFields>,
  ) => React.ReactNode;
  /** Optional custom missing-English counter (`D20`: layout-filtered/nested fields in ICR-198). */
  readonly countMissingEn?: (values: TFields) => number;
  readonly topNotices?: React.ReactNode;
  readonly publishDialogExtras?: (ctx: PublishDialogContext) => React.ReactNode;
  readonly getPublishOptions?: () => {
    readonly notify?: boolean;
    readonly approvedConfirmed?: boolean;
  };
  readonly excludeFromPatch?: readonly (keyof TFields)[];
  readonly actionOverrides?: Partial<EntryEditorActionHandlers<TFields>>;
  readonly onAfterSave?: (doc: SerializedContentDoc<TFields>) => void;
  readonly customFieldErrorMap?: (
    path: string,
    rawMessages: readonly string[],
  ) => string | undefined;
}
