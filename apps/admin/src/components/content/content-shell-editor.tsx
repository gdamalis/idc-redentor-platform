"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ContentStatus, Localized } from "@idcr/content";
import type { ContentCollectionName } from "@src/lib/content/errors";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Notice } from "@src/components/ui/notice";
import { EntryEditor } from "./entry-editor";
import type { EntryEditorPermissions } from "./entry-editor-types";
import { LocalizedFieldReference } from "./localized-field";

export type ShellEditableField =
  | { readonly kind: "localizedText"; readonly key: string; readonly labelKey: string }
  | { readonly kind: "plainText"; readonly key: string; readonly labelKey: string }
  | { readonly kind: "none" };

export interface ContentShellEditorProps {
  readonly collection: ContentCollectionName;
  readonly docId?: string;
  readonly initialDoc?: SerializedContentDoc<Record<string, unknown>>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: Record<string, unknown>;
  readonly backHref: string;
  readonly backLabel: string;
  readonly fallbackTitle: string;
  readonly editableField: ShellEditableField;
  readonly permissions: EntryEditorPermissions;
  readonly isTrialMode: boolean;
  readonly isPublishEmailsEnabled: boolean;
  readonly isProtected?: boolean;
  readonly protectedKind?: "legal" | "doctrine";
  readonly fixedIdentifier?: string;
  readonly fixedLayout?: string;
  readonly fixedAppearsOn?: readonly string[];
  readonly liveUrl?: string;
}

/**
 * Safe pre-Wave-4 editor shell (`ICR-197` Q3 + PM Catch #4):
 * Mounts the real `EntryEditor` frame on every content route so save, publish,
 * strict validation, conflict, recovery, fixed-entry guards, and preview work
 * end-to-end on real staging data in Wave 2.
 *
 * **Patch-safety invariant:** Excludes every unrendered key (including
 * `topics.protected` and all nested fields) from `buildPatch()` so saving never
 * alters unrendered content. Wave 4 (`ICR-198`, `199`, `200`) replaces each
 * route folder with its full domain editor without touching this file.
 */
export function ContentShellEditor({
  collection,
  docId,
  initialDoc,
  initialStatus,
  initialValues,
  backHref,
  backLabel,
  fallbackTitle,
  editableField,
  permissions,
  isTrialMode,
  isPublishEmailsEnabled,
  isProtected = false,
  protectedKind = "legal",
  fixedIdentifier,
  fixedLayout,
  fixedAppearsOn,
  liveUrl,
}: ContentShellEditorProps) {
  const t = useTranslations("content");

  // Explicitly exclude EVERY key except the single rendered editableField (if any)
  // so unrendered fields and `topics.protected` are NEVER patched.
  const excludeFromPatch = React.useMemo(() => {
    const allowedKey =
      editableField.kind === "none" ? null : editableField.key;
    const keys = new Set<string>(Object.keys(initialValues));
    keys.add("protected");
    if (allowedKey) keys.delete(allowedKey);
    return Array.from(keys);
  }, [editableField, initialValues]);

  const deriveTitle = React.useCallback(
    (values: Record<string, unknown>): string => {
      if (editableField.kind === "localizedText") {
        const loc = values[editableField.key] as Localized<string> | undefined;
        if (loc?.["es-AR"]?.trim()) return loc["es-AR"];
      } else if (editableField.kind === "plainText") {
        const val = values[editableField.key];
        if (typeof val === "string" && val.trim()) return val;
      }
      return fallbackTitle;
    },
    [editableField, fallbackTitle],
  );

  const isLocalized = editableField.kind === "localizedText";

  return (
    <EntryEditor<Record<string, unknown>>
      collection={collection}
      docId={docId}
      initialDoc={initialDoc}
      initialStatus={initialStatus}
      initialValues={initialValues}
      backHref={backHref}
      backLabel={backLabel}
      getTitle={deriveTitle}
      permissions={permissions}
      isTrialMode={isTrialMode}
      isPublishEmailsEnabled={isPublishEmailsEnabled}
      isProtected={isProtected}
      protectedKind={protectedKind}
      fixedIdentifier={fixedIdentifier}
      fixedAppearsOn={fixedAppearsOn}
      liveUrl={liveUrl}
      excludeFromPatch={excludeFromPatch}
      topNotices={<Notice variant="info">{t("fixed.shellNotice")}</Notice>}
      renderLocalizedFields={
        isLocalized
          ? ({ activeLocale, values, form, readOnly, getError }) => {
              const loc =
                (values[editableField.key] as Localized<string> | undefined) ?? {
                  "es-AR": "",
                };
              const current = loc[activeLocale] ?? "";
              return (
                <Field
                  label={t(editableField.labelKey as never)}
                  htmlFor={`shell-${editableField.key}-${activeLocale}`}
                  fieldPath={`${editableField.key}.${activeLocale}`}
                  requiredToPublish={activeLocale === "es-AR"}
                  requiredMarkLabel={t("errors.requiredMark")}
                  error={
                    getError(`${editableField.key}.${activeLocale}`) ??
                    getError(editableField.key)
                  }
                >
                  <Input
                    id={`shell-${editableField.key}-${activeLocale}`}
                    disabled={readOnly}
                    value={current}
                    placeholder={
                      activeLocale === "en-US" ? loc["es-AR"] : undefined
                    }
                    onChange={(e) => {
                      form.setField(editableField.key, {
                        ...loc,
                        "es-AR": loc["es-AR"] ?? "",
                        [activeLocale]: e.target.value,
                      });
                    }}
                  />
                  <LocalizedFieldReference
                    activeLocale={activeLocale}
                    spanishOriginal={loc["es-AR"]}
                    isEnglishEmpty={!current.trim()}
                    readOnly={readOnly}
                    onCopyFromSpanish={() => {
                      const es = loc["es-AR"] ?? "";
                      form.setField(editableField.key, {
                        "es-AR": es,
                        "en-US": es,
                      });
                    }}
                  />
                </Field>
              );
            }
          : undefined
      }
      renderGeneralFields={({ values, form, readOnly, getError }) => (
        <div className="space-y-4">
          {fixedIdentifier && (
            <Field
              label={t("fixed.identifierLabel")}
              hint={t("fixed.identifier")}
            >
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
                <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span>{fixedIdentifier}</span>
              </div>
            </Field>
          )}

          {fixedLayout && (
            <Field label={t("fixed.layoutLabel")} hint={t("fixed.identifier")}>
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs">
                <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span>{fixedLayout}</span>
              </div>
            </Field>
          )}

          {editableField.kind === "plainText" && (
            <Field
              label={t(editableField.labelKey as never)}
              htmlFor={`shell-${editableField.key}`}
              fieldPath={editableField.key}
              requiredToPublish
              requiredMarkLabel={t("errors.requiredMark")}
              error={getError(editableField.key)}
            >
              <Input
                id={`shell-${editableField.key}`}
                disabled={readOnly}
                value={
                  typeof values[editableField.key] === "string"
                    ? (values[editableField.key] as string)
                    : ""
                }
                onChange={(e) => form.setField(editableField.key, e.target.value)}
              />
            </Field>
          )}
        </div>
      )}
    />
  );
}
