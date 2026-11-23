"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type {
  ContentStatus,
  Locale,
  Localized,
  MenuItemFields,
  NavigationMenuFields,
} from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { EntryEditor } from "@src/components/content/entry-editor";
import type { EntryEditorPermissions } from "@src/components/content/entry-editor-types";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { SortableList } from "@src/components/content/sortable-list";
import { createSiteFieldErrorMapper } from "@src/lib/content/site/field-errors";
import { countNavigationMenuMissingEn } from "@src/lib/content/site/missing-en";
import { normalizeNavigationMenuDraft } from "@src/lib/content/site/normalize";
import { FixedIdentityMeta } from "./fixed-identity-meta";
import { createNormalizedSiteActions } from "./normalized-actions";
import { SitePageSelect } from "./site-page-select";

export interface NavigationMenuEditorProps {
  readonly initialDoc: SerializedContentDoc<NavigationMenuFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: NavigationMenuFields;
  readonly backHref: string;
  readonly backLabel: string;
  readonly friendlyTitle: string;
  readonly machineName: string;
  readonly appearsOn: readonly string[];
  readonly liveUrl?: string;
  readonly permissions: EntryEditorPermissions;
  readonly isTrialMode: boolean;
  readonly isPublishEmailsEnabled: boolean;
}

const EXCLUDE_IMMUTABLE: readonly (keyof NavigationMenuFields)[] = [
  "kind",
  "machineName",
];

function updateLocalizedString(
  current: Localized<string> | undefined,
  locale: Locale,
  nextValue: string,
): Localized<string> {
  return {
    "es-AR": locale === "es-AR" ? nextValue : (current?.["es-AR"] ?? ""),
    ...(locale === "en-US"
      ? { "en-US": nextValue }
      : current?.["en-US"] !== undefined
        ? { "en-US": current["en-US"] }
        : {}),
  };
}

/**
 * Navigation menu global editor (`globals` / `kind: "navigationMenu"`).
 * Targets are strictly restricted to `@idcr/content`'s `SITE_PAGES` (`ICR-198` AC7, PM `D20` Q1).
 */
export function NavigationMenuEditor({
  initialDoc,
  initialStatus,
  initialValues,
  backHref,
  backLabel,
  friendlyTitle,
  machineName,
  appearsOn,
  liveUrl,
  permissions,
  isTrialMode,
  isPublishEmailsEnabled,
}: NavigationMenuEditorProps) {
  const tContent = useTranslations("content");
  const tSite = useTranslations("contentSite");

  const customFieldErrorMap = React.useMemo(
    () =>
      createSiteFieldErrorMapper(
        (key, values) => tSite(key as never, values as never),
        "navigationMenu",
      ),
    [tSite],
  );

  const actionOverrides = React.useMemo(
    () =>
      createNormalizedSiteActions(initialValues, normalizeNavigationMenuDraft),
    [initialValues],
  );

  const requiredMark = tContent("errors.requiredMark");

  return (
    <EntryEditor<NavigationMenuFields>
      collection="globals"
      docId={initialDoc._id}
      initialDoc={initialDoc}
      initialStatus={initialStatus}
      initialValues={initialValues}
      backHref={backHref}
      backLabel={backLabel}
      getTitle={() => friendlyTitle}
      permissions={permissions}
      isTrialMode={isTrialMode}
      isPublishEmailsEnabled={isPublishEmailsEnabled}
      fixedIdentifier={machineName}
      fixedAppearsOn={appearsOn}
      liveUrl={liveUrl}
      excludeFromPatch={EXCLUDE_IMMUTABLE}
      actionOverrides={actionOverrides}
      countMissingEn={countNavigationMenuMissingEn}
      customFieldErrorMap={customFieldErrorMap}
      renderLocalizedFields={({ activeLocale, values, form, readOnly, getError }) => {
        const menuItems = values.menuItems ?? [];

        const updateItem = (
          index: number,
          updater: (item: MenuItemFields) => MenuItemFields,
        ) => {
          const next = [...menuItems];
          next[index] = updater(next[index]!);
          form.setField("menuItems", next);
        };

        return (
          <Field
            label={tSite("menu.items")}
            fieldPath="menuItems"
            requiredToPublish
            requiredMarkLabel={requiredMark}
            error={getError("menuItems")}
          >
            <SortableList<MenuItemFields>
              items={menuItems}
              getKey={(_item, idx) => `menu-item-${idx}`}
              onChange={(next) => form.setField("menuItems", next)}
              onAdd={() =>
                form.setField("menuItems", [
                  ...menuItems,
                  { groupName: { "es-AR": "" } },
                ])
              }
              addLabel={tSite("menu.addItem")}
              maxItems={50}
              moveUpLabel={tSite("common.moveUp")}
              moveDownLabel={tSite("common.moveDown")}
              removeLabel={tSite("common.remove")}
              emptyMessage={tSite("menu.emptyItems")}
              readOnly={readOnly}
              renderItem={(item, idx) => {
                const nameEs = item.groupName?.["es-AR"] ?? "";
                const nameVal = item.groupName?.[activeLocale] ?? "";
                return (
                  <div className="grid grid-cols-1 gap-3 py-0.5 sm:grid-cols-2">
                    <Field
                      label={tSite("menu.groupName")}
                      htmlFor={`menu-name-${idx}-${activeLocale}`}
                      fieldPath={`menuItems.${idx}.groupName.${activeLocale}`}
                      requiredToPublish={activeLocale === "es-AR"}
                      requiredMarkLabel={requiredMark}
                      error={
                        getError(`menuItems.${idx}.groupName.${activeLocale}`) ??
                        getError(`menuItems.${idx}.groupName`)
                      }
                    >
                      <Input
                        id={`menu-name-${idx}-${activeLocale}`}
                        disabled={readOnly}
                        value={nameVal}
                        placeholder={
                          activeLocale === "en-US" ? nameEs : undefined
                        }
                        onChange={(e) =>
                          updateItem(idx, (prev) => ({
                            ...prev,
                            groupName: updateLocalizedString(
                              prev.groupName,
                              activeLocale,
                              e.target.value,
                            ),
                          }))
                        }
                      />
                      <LocalizedFieldReference
                        activeLocale={activeLocale}
                        spanishOriginal={nameEs || undefined}
                        isEnglishEmpty={!nameVal.trim()}
                        readOnly={readOnly}
                        onCopyFromSpanish={() =>
                          updateItem(idx, (prev) => ({
                            ...prev,
                            groupName: { "es-AR": nameEs, "en-US": nameEs },
                          }))
                        }
                      />
                    </Field>

                    <Field
                      label={tSite("menu.groupLink")}
                      htmlFor={`menu-link-${idx}`}
                      fieldPath={`menuItems.${idx}.groupLink`}
                      requiredToPublish
                      requiredMarkLabel={requiredMark}
                      error={getError(`menuItems.${idx}.groupLink`)}
                    >
                      <SitePageSelect
                        id={`menu-link-${idx}`}
                        value={item.groupLink}
                        allowEmpty={false}
                        disabled={readOnly}
                        onChange={(slug) =>
                          updateItem(idx, (prev) => ({
                            ...prev,
                            groupLink: slug,
                          }))
                        }
                      />
                    </Field>
                  </div>
                );
              }}
            />
          </Field>
        );
      }}
      renderGeneralFields={() => (
        <FixedIdentityMeta machineName={machineName} appearsOn={appearsOn} />
      )}
    />
  );
}
