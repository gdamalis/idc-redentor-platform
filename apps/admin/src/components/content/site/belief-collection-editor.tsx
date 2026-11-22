"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  BELIEF_KIND,
  isEmptyValue,
  type BeliefCollectionFields,
  type BeliefItemFields,
  type BeliefKind,
  type ContentStatus,
  type Locale,
  type Localized,
  type RichTextDoc,
} from "@idcr/content";
import type {
  BibleVersePickerItem,
  SerializedContentDoc,
} from "@src/app/[locale]/(app)/content/actions";
import type { SerializedMediaDoc } from "@src/app/[locale]/(app)/content/media/actions";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Select } from "@src/components/ui/select";
import { EntryEditor } from "@src/components/content/entry-editor";
import type { EntryEditorPermissions } from "@src/components/content/entry-editor-types";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { MediaField } from "@src/components/content/media";
import { RichTextEditor } from "@src/components/content/rich-text/rich-text-editor";
import { SortableList } from "@src/components/content/sortable-list";
import {
  createSiteFieldErrorMapper,
  findRichTextFieldError,
} from "@src/lib/content/site/field-errors";
import { countBeliefCollectionMissingEn } from "@src/lib/content/site/missing-en";
import {
  EMPTY_RICH_TEXT_DOC,
  extractRichTextPlainText,
  normalizeBeliefCollectionDraft,
} from "@src/lib/content/site/normalize";
import { FixedIdentityMeta } from "./fixed-identity-meta";
import { createNormalizedSiteActions } from "./normalized-actions";
import { SingleVerseField } from "./single-verse-field";

export interface BeliefCollectionEditorProps {
  readonly initialDoc: SerializedContentDoc<BeliefCollectionFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: BeliefCollectionFields;
  readonly initialMediaById: Readonly<Record<string, SerializedMediaDoc>>;
  readonly initialVersesById: Readonly<Record<string, BibleVersePickerItem>>;
  readonly backHref: string;
  readonly backLabel: string;
  readonly friendlyTitle: string;
  readonly machineName: string;
  readonly appearsOn: readonly string[];
  readonly liveUrl?: string;
  readonly permissions: EntryEditorPermissions;
  readonly canManageMedia: boolean;
  readonly isTrialMode: boolean;
  readonly isPublishEmailsEnabled: boolean;
}

const EXCLUDE_IMMUTABLE: readonly (keyof BeliefCollectionFields)[] = [
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

function updateLocalizedRichText(
  current: Localized<RichTextDoc> | undefined,
  locale: Locale,
  nextDoc: RichTextDoc,
): Localized<RichTextDoc> {
  return {
    "es-AR":
      locale === "es-AR" ? nextDoc : (current?.["es-AR"] ?? EMPTY_RICH_TEXT_DOC),
    ...(locale === "en-US"
      ? { "en-US": nextDoc }
      : current?.["en-US"] !== undefined
        ? { "en-US": current["en-US"] }
        : {}),
  };
}

/**
 * Protected doctrinal editor for `belief_collections` (`our-creed`,
 * `collection-our-mission`).
 *
 * - Protected by type (`content:publish-protected`, doctrinal notice).
 * - Requires BOTH `es-AR` and `en-US` on publish (`ICR-198` AC8).
 * - No `icon` field (`F` §13.6, PM `D20` Q2 Option A); Creed items show the
 *   title icon hint verbatim.
 * - Uses stable WeakMap keys so reordering items preserves nested TipTap state.
 */
export function BeliefCollectionEditor({
  initialDoc,
  initialStatus,
  initialValues,
  initialMediaById,
  initialVersesById,
  backHref,
  backLabel,
  friendlyTitle,
  machineName,
  appearsOn,
  liveUrl,
  permissions,
  canManageMedia,
  isTrialMode,
  isPublishEmailsEnabled,
}: BeliefCollectionEditorProps) {
  const tContent = useTranslations("content");
  const tSite = useTranslations("contentSite");

  const [versesById, setVersesById] = React.useState<
    Readonly<Record<string, BibleVersePickerItem>>
  >(initialVersesById);

  const itemKeysRef = React.useRef<WeakMap<BeliefItemFields, string>>(
    new WeakMap(),
  );
  const keySeqRef = React.useRef(0);

  const getStableItemKey = React.useCallback((item: BeliefItemFields): string => {
    const existing = itemKeysRef.current.get(item);
    if (existing) return existing;
    keySeqRef.current += 1;
    const assigned = `belief-item-${keySeqRef.current}`;
    itemKeysRef.current.set(item, assigned);
    return assigned;
  }, []);

  const preserveItemKey = React.useCallback(
    (oldItem: BeliefItemFields, nextItem: BeliefItemFields): BeliefItemFields => {
      const key = getStableItemKey(oldItem);
      itemKeysRef.current.set(nextItem, key);
      return nextItem;
    },
    [getStableItemKey],
  );

  const customFieldErrorMap = React.useMemo(
    () =>
      createSiteFieldErrorMapper(
        (key, values) => tSite(key as never, values as never),
        "beliefCollection",
      ),
    [tSite],
  );

  const actionOverrides = React.useMemo(
    () =>
      createNormalizedSiteActions(
        initialValues,
        normalizeBeliefCollectionDraft,
      ),
    [initialValues],
  );

  const requiredMark = tContent("errors.requiredMark");
  const defaultKind: BeliefKind =
    machineName === "our-creed" ? BELIEF_KIND.Creed : BELIEF_KIND.Value;

  return (
    <EntryEditor<BeliefCollectionFields>
      collection="belief_collections"
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
      isProtected
      protectedKind="doctrine"
      fixedIdentifier={machineName}
      fixedAppearsOn={appearsOn}
      liveUrl={liveUrl}
      excludeFromPatch={EXCLUDE_IMMUTABLE}
      actionOverrides={actionOverrides}
      countMissingEn={countBeliefCollectionMissingEn}
      customFieldErrorMap={customFieldErrorMap}
      renderLocalizedFields={({ activeLocale, values, form, readOnly, getError }) => {
        const titleEs = values.title?.["es-AR"] ?? "";
        const titleVal = values.title?.[activeLocale] ?? "";
        const descEsDoc = values.description?.["es-AR"];
        const descActiveDoc = values.description?.[activeLocale];
        const descEsPlain = extractRichTextPlainText(descEsDoc);
        const items = values.items ?? [];

        const updateItem = (
          index: number,
          updater: (item: BeliefItemFields) => BeliefItemFields,
        ) => {
          const next = [...items];
          const prevItem = next[index]!;
          next[index] = preserveItemKey(prevItem, updater(prevItem));
          form.setField("items", next);
        };

        return (
          <div className="space-y-6">
            <Field
              label={tSite("beliefs.title")}
              htmlFor={`belief-title-${activeLocale}`}
              fieldPath={`title.${activeLocale}`}
              requiredToPublish
              requiredMarkLabel={requiredMark}
              error={getError(`title.${activeLocale}`) ?? getError("title")}
            >
              <Input
                id={`belief-title-${activeLocale}`}
                disabled={readOnly}
                value={titleVal}
                placeholder={activeLocale === "en-US" ? titleEs : undefined}
                onChange={(e) =>
                  form.setField(
                    "title",
                    updateLocalizedString(
                      values.title,
                      activeLocale,
                      e.target.value,
                    ),
                  )
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={titleEs || undefined}
                isEnglishEmpty={!titleVal.trim()}
                readOnly={readOnly}
                onCopyFromSpanish={() =>
                  form.setField("title", {
                    "es-AR": titleEs,
                    "en-US": titleEs,
                  })
                }
              />
            </Field>

            <Field
              label={tSite("beliefs.description")}
              fieldPath={`description.${activeLocale}`}
              hint={tSite("beliefs.descriptionHint")}
              error={findRichTextFieldError(
                getError,
                form.fieldErrors,
                `description.${activeLocale}`,
                "description",
              )}
            >
              <RichTextEditor
                key={`belief-desc-${activeLocale}`}
                profile="inline"
                value={descActiveDoc}
                readOnly={readOnly}
                minHeightClassName="min-h-28"
                onLossyLoad={(lossy) =>
                  form.markLossyField(`description.${activeLocale}`, lossy)
                }
                onChange={(nextDoc) =>
                  form.setField(
                    "description",
                    updateLocalizedRichText(
                      values.description,
                      activeLocale,
                      nextDoc,
                    ),
                  )
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={descEsPlain || undefined}
                isEnglishEmpty={isEmptyValue(descActiveDoc)}
                collapsible
                readOnly={readOnly}
                onCopyFromSpanish={() => {
                  if (!descEsDoc) return;
                  form.setField("description", {
                    "es-AR": descEsDoc,
                    "en-US": structuredClone(descEsDoc),
                  });
                }}
              />
            </Field>

            <Field
              label={tSite("beliefs.items")}
              fieldPath="items"
              requiredToPublish
              requiredMarkLabel={requiredMark}
              error={getError("items")}
            >
              <SortableList<BeliefItemFields>
                items={items}
                getKey={(item) => getStableItemKey(item)}
                onChange={(nextItems) => form.setField("items", nextItems)}
                onAdd={() => {
                  const fresh: BeliefItemFields = {
                    kind: defaultKind,
                    title: { "es-AR": "" },
                    description: { "es-AR": EMPTY_RICH_TEXT_DOC },
                  };
                  form.setField("items", [...items, fresh]);
                }}
                addLabel={tSite("beliefs.addItem")}
                maxItems={100}
                moveUpLabel={tSite("common.moveUp")}
                moveDownLabel={tSite("common.moveDown")}
                removeLabel={tSite("common.remove")}
                emptyMessage={tSite("beliefs.emptyItems")}
                readOnly={readOnly}
                renderItem={(item, idx) => {
                  const itemKey = getStableItemKey(item);
                  const itemTitleEs = item.title?.["es-AR"] ?? "";
                  const itemTitleVal = item.title?.[activeLocale] ?? "";
                  const itemDescEs = item.description?.["es-AR"];
                  const itemDescActive = item.description?.[activeLocale];
                  const itemDescEsPlain = extractRichTextPlainText(itemDescEs);
                  const isCreed = item.kind === BELIEF_KIND.Creed;

                  return (
                    <div className="space-y-4 py-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {tSite("beliefs.itemHeading", { index: idx + 1 })}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(140px,1fr)]">
                        <Field
                          label={tSite("beliefs.itemTitle")}
                          htmlFor={`${itemKey}-title-${activeLocale}`}
                          fieldPath={`items.${idx}.title.${activeLocale}`}
                          requiredToPublish
                          requiredMarkLabel={requiredMark}
                          hint={
                            isCreed
                              ? tSite("beliefs.creedTitleHint")
                              : undefined
                          }
                          error={
                            getError(`items.${idx}.title.${activeLocale}`) ??
                            getError(`items.${idx}.title`)
                          }
                        >
                          <Input
                            id={`${itemKey}-title-${activeLocale}`}
                            disabled={readOnly}
                            value={itemTitleVal}
                            placeholder={
                              activeLocale === "en-US" ? itemTitleEs : undefined
                            }
                            onChange={(e) =>
                              updateItem(idx, (prev) => ({
                                ...prev,
                                title: updateLocalizedString(
                                  prev.title,
                                  activeLocale,
                                  e.target.value,
                                ),
                              }))
                            }
                          />
                          <LocalizedFieldReference
                            activeLocale={activeLocale}
                            spanishOriginal={itemTitleEs || undefined}
                            isEnglishEmpty={!itemTitleVal.trim()}
                            readOnly={readOnly}
                            onCopyFromSpanish={() =>
                              updateItem(idx, (prev) => ({
                                ...prev,
                                title: {
                                  "es-AR": itemTitleEs,
                                  "en-US": itemTitleEs,
                                },
                              }))
                            }
                          />
                        </Field>

                        <Field
                          label={tSite("beliefs.itemKind")}
                          htmlFor={`${itemKey}-kind`}
                          fieldPath={`items.${idx}.kind`}
                          requiredToPublish
                          requiredMarkLabel={requiredMark}
                          error={getError(`items.${idx}.kind`)}
                        >
                          <Select
                            id={`${itemKey}-kind`}
                            disabled={readOnly}
                            value={item.kind ?? ""}
                            onChange={(e) => {
                              const nextKind = e.target.value as BeliefKind;
                              if (
                                nextKind === BELIEF_KIND.Creed ||
                                nextKind === BELIEF_KIND.Value
                              ) {
                                updateItem(idx, (prev) => ({
                                  ...prev,
                                  kind: nextKind,
                                }));
                              }
                            }}
                          >
                            <option value={BELIEF_KIND.Creed}>
                              {tSite("beliefs.kinds.Creed")}
                            </option>
                            <option value={BELIEF_KIND.Value}>
                              {tSite("beliefs.kinds.Value")}
                            </option>
                          </Select>
                        </Field>
                      </div>

                      <Field
                        label={tSite("beliefs.itemDescription")}
                        fieldPath={`items.${idx}.description.${activeLocale}`}
                        requiredToPublish
                        requiredMarkLabel={requiredMark}
                        error={findRichTextFieldError(
                          getError,
                          form.fieldErrors,
                          `items.${idx}.description.${activeLocale}`,
                          `items.${idx}.description`,
                        )}
                      >
                        <RichTextEditor
                          key={`${itemKey}-desc-${activeLocale}`}
                          profile="inline"
                          value={itemDescActive}
                          readOnly={readOnly}
                          minHeightClassName="min-h-24"
                          onLossyLoad={(lossy) =>
                            form.markLossyField(
                              `items.${idx}.description.${activeLocale}`,
                              lossy,
                            )
                          }
                          onChange={(nextDoc) =>
                            updateItem(idx, (prev) => ({
                              ...prev,
                              description: updateLocalizedRichText(
                                prev.description,
                                activeLocale,
                                nextDoc,
                              ),
                            }))
                          }
                        />
                        <LocalizedFieldReference
                          activeLocale={activeLocale}
                          spanishOriginal={itemDescEsPlain || undefined}
                          isEnglishEmpty={isEmptyValue(itemDescActive)}
                          collapsible
                          readOnly={readOnly}
                          onCopyFromSpanish={() => {
                            if (!itemDescEs) return;
                            updateItem(idx, (prev) => ({
                              ...prev,
                              description: {
                                "es-AR": itemDescEs,
                                "en-US": structuredClone(itemDescEs),
                              },
                            }));
                          }}
                        />
                      </Field>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field
                          label={tSite("beliefs.itemBibleVerse")}
                          fieldPath={`items.${idx}.bibleVerseId`}
                          error={getError(`items.${idx}.bibleVerseId`)}
                        >
                          <SingleVerseField
                            value={item.bibleVerseId}
                            initialVerse={
                              item.bibleVerseId
                                ? (versesById[item.bibleVerseId] ?? null)
                                : null
                            }
                            readOnly={readOnly}
                            onVerseLoaded={(verse) =>
                              setVersesById((prev) => ({
                                ...prev,
                                [verse.id]: verse,
                              }))
                            }
                            onChange={(verseId) =>
                              updateItem(idx, (prev) => ({
                                ...prev,
                                bibleVerseId: verseId,
                              }))
                            }
                          />
                        </Field>

                        <Field
                          label={tSite("beliefs.itemImage")}
                          fieldPath={`items.${idx}.imageId`}
                          error={getError(`items.${idx}.imageId`)}
                        >
                          <MediaField
                            accept="image"
                            value={item.imageId}
                            initialDoc={
                              item.imageId
                                ? (initialMediaById[item.imageId] ?? null)
                                : null
                            }
                            canUpload={canManageMedia}
                            readOnly={readOnly}
                            onChange={(imageId) =>
                              updateItem(idx, (prev) => ({
                                ...prev,
                                imageId,
                              }))
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  );
                }}
              />
            </Field>
          </div>
        );
      }}
      renderGeneralFields={() => (
        <FixedIdentityMeta machineName={machineName} appearsOn={appearsOn} />
      )}
    />
  );
}
