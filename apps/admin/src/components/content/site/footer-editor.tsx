"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  SOCIAL_PLATFORM,
  type ContentStatus,
  type FooterFields,
  type Locale,
  type Localized,
  type SocialLinkFields,
  type SocialPlatform,
} from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import type { SerializedMediaDoc } from "@src/app/[locale]/(app)/content/media/actions";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Select } from "@src/components/ui/select";
import { Textarea } from "@src/components/ui/textarea";
import { EntryEditor } from "@src/components/content/entry-editor";
import type { EntryEditorPermissions } from "@src/components/content/entry-editor-types";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { MediaField } from "@src/components/content/media";
import { SortableList } from "@src/components/content/sortable-list";
import { createSiteFieldErrorMapper } from "@src/lib/content/site/field-errors";
import { countFooterMissingEn } from "@src/lib/content/site/missing-en";
import { normalizeFooterDraft } from "@src/lib/content/site/normalize";
import type { SharedLocationSummary } from "@src/service/content/site/loaders";
import { FixedIdentityMeta } from "./fixed-identity-meta";
import { createNormalizedSiteActions } from "./normalized-actions";
import { SharedLocationCard } from "./shared-location-card";

export interface FooterEditorProps {
  readonly initialDoc: SerializedContentDoc<FooterFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: FooterFields;
  readonly initialMediaById: Readonly<Record<string, SerializedMediaDoc>>;
  readonly sharedLocation: SharedLocationSummary | null;
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

const EXCLUDE_IMMUTABLE: readonly (keyof FooterFields)[] = [
  "kind",
  "machineName",
];

const SOCIAL_PLATFORMS: readonly SocialPlatform[] = [
  SOCIAL_PLATFORM.facebook,
  SOCIAL_PLATFORM.instagram,
  SOCIAL_PLATFORM.youtube,
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
 * Footer global editor (`globals` / `kind: "footer"`):
 * logo, localized shortDescription, closed-enum socialLinks, and read-only
 * `SharedLocationCard` linking to `/content/location`.
 */
export function FooterEditor({
  initialDoc,
  initialStatus,
  initialValues,
  initialMediaById,
  sharedLocation,
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
}: FooterEditorProps) {
  const tContent = useTranslations("content");
  const tSite = useTranslations("contentSite");

  const customFieldErrorMap = React.useMemo(
    () =>
      createSiteFieldErrorMapper(
        (key, values) => tSite(key as never, values as never),
        "footer",
      ),
    [tSite],
  );

  const actionOverrides = React.useMemo(
    () => createNormalizedSiteActions(initialValues, normalizeFooterDraft),
    [initialValues],
  );

  const requiredMark = tContent("errors.requiredMark");

  return (
    <EntryEditor<FooterFields>
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
      countMissingEn={countFooterMissingEn}
      customFieldErrorMap={customFieldErrorMap}
      renderLocalizedFields={({ activeLocale, values, form, readOnly, getError }) => {
        const descEs = values.shortDescription?.["es-AR"] ?? "";
        const descVal = values.shortDescription?.[activeLocale] ?? "";
        const socialLinks = values.socialLinks ?? [];

        const updateLink = (
          index: number,
          patch: Partial<SocialLinkFields>,
        ) => {
          const next = [...socialLinks];
          next[index] = { ...next[index]!, ...patch };
          form.setField("socialLinks", next);
        };

        return (
          <div className="space-y-6">
            <Field
              label={tSite("footer.shortDescription")}
              htmlFor={`footer-desc-${activeLocale}`}
              fieldPath={`shortDescription.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={requiredMark}
              error={
                getError(`shortDescription.${activeLocale}`) ??
                getError("shortDescription")
              }
            >
              <Textarea
                id={`footer-desc-${activeLocale}`}
                disabled={readOnly}
                value={descVal}
                placeholder={activeLocale === "en-US" ? descEs : undefined}
                onChange={(e) =>
                  form.setField(
                    "shortDescription",
                    updateLocalizedString(
                      values.shortDescription,
                      activeLocale,
                      e.target.value,
                    ),
                  )
                }
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={descEs || undefined}
                isEnglishEmpty={!descVal.trim()}
                readOnly={readOnly}
                onCopyFromSpanish={() =>
                  form.setField("shortDescription", {
                    "es-AR": descEs,
                    "en-US": descEs,
                  })
                }
              />
            </Field>

            <Field
              label={tSite("footer.socialLinks")}
              fieldPath="socialLinks"
              error={getError("socialLinks")}
            >
              <SortableList<SocialLinkFields>
                items={socialLinks}
                getKey={(_item, idx) => `social-link-${idx}`}
                onChange={(next) => form.setField("socialLinks", next)}
                onAdd={() =>
                  form.setField("socialLinks", [
                    ...socialLinks,
                    { platform: SOCIAL_PLATFORM.instagram, url: "" },
                  ])
                }
                addLabel={tSite("footer.addSocialLink")}
                maxItems={20}
                moveUpLabel={tSite("common.moveUp")}
                moveDownLabel={tSite("common.moveDown")}
                removeLabel={tSite("common.remove")}
                emptyMessage={tSite("footer.emptySocialLinks")}
                readOnly={readOnly}
                renderItem={(link, idx) => (
                  <div className="grid grid-cols-1 gap-3 py-0.5 sm:grid-cols-[minmax(140px,1fr)_minmax(0,2fr)]">
                    <Field
                      label={tSite("footer.platform")}
                      htmlFor={`footer-social-platform-${idx}`}
                      fieldPath={`socialLinks.${idx}.platform`}
                      requiredToPublish
                      requiredMarkLabel={requiredMark}
                      error={getError(`socialLinks.${idx}.platform`)}
                    >
                      <Select
                        id={`footer-social-platform-${idx}`}
                        disabled={readOnly}
                        value={link.platform}
                        onChange={(e) => {
                          const next = e.target.value as SocialPlatform;
                          if (SOCIAL_PLATFORMS.includes(next)) {
                            updateLink(idx, { platform: next });
                          }
                        }}
                      >
                        {SOCIAL_PLATFORMS.map((platform) => (
                          <option key={platform} value={platform}>
                            {tSite(`footer.platforms.${platform}`)}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field
                      label={tSite("footer.url")}
                      htmlFor={`footer-social-url-${idx}`}
                      fieldPath={`socialLinks.${idx}.url`}
                      requiredToPublish
                      requiredMarkLabel={requiredMark}
                      error={getError(`socialLinks.${idx}.url`)}
                    >
                      <Input
                        id={`footer-social-url-${idx}`}
                        type="url"
                        disabled={readOnly}
                        value={link.url}
                        placeholder={tSite("footer.urlPlaceholder")}
                        onChange={(e) =>
                          updateLink(idx, { url: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                )}
              />
            </Field>
          </div>
        );
      }}
      renderGeneralFields={({ values, form, readOnly, getError }) => (
        <div className="space-y-4">
          <FixedIdentityMeta machineName={machineName} appearsOn={appearsOn} />

          <Field
            label={tSite("footer.logo")}
            fieldPath="logo"
            requiredToPublish
            requiredMarkLabel={requiredMark}
            error={getError("logo")}
          >
            <MediaField
              accept="image"
              value={values.logo}
              initialDoc={
                values.logo ? (initialMediaById[values.logo] ?? null) : null
              }
              canUpload={canManageMedia}
              readOnly={readOnly}
              onChange={(id) => form.setField("logo", id)}
            />
          </Field>

          <SharedLocationCard location={sharedLocation} />
        </div>
      )}
    />
  );
}
