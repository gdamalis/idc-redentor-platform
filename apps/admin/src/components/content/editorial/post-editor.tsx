"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  POST_CATEGORIES,
  type ContentStatus,
  type Locale,
  type Localized,
  type PostFields,
} from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import {
  confirmPostPublishAction,
  createPostAction,
  preparePostPublishAction,
  savePostDraftAction,
} from "@src/app/[locale]/(app)/content/posts/actions";
import type { SerializedMediaDoc } from "@src/app/[locale]/(app)/content/media/actions";
import { EntryEditor } from "@src/components/content/entry-editor";
import type {
  EntryEditorActionHandlers,
  EntryEditorPermissions,
} from "@src/components/content/entry-editor-types";
import { LocalizedFieldReference } from "@src/components/content/localized-field";
import { MediaField } from "@src/components/content/media";
import { RichTextEditor } from "@src/components/content/rich-text/rich-text-editor";
import { SlugField } from "@src/components/content/slug-field";
import { Checkbox } from "@src/components/ui/checkbox";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import { Select } from "@src/components/ui/select";
import { Textarea } from "@src/components/ui/textarea";
import {
  POST_CATEGORY_MESSAGE_KEYS,
  extractPlainTextFromRichText,
  isAllowedPostCategory,
} from "@src/service/content/editorial/editorial-rules";
import type {
  AuthorSummary,
  RelatedPostSummary,
} from "@src/service/content/editorial/editorial-loaders.service";
import { AuthorPickerField } from "./author-picker-field";
import { KeywordsField } from "./keywords-field";
import { RelatedPostsField } from "./related-posts-field";

export interface PostEditorProps {
  readonly docId?: string;
  readonly initialDoc?: SerializedContentDoc<PostFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: PostFields;
  readonly initialFeaturedImage: SerializedMediaDoc | null;
  readonly initialAuthor: AuthorSummary | null;
  readonly initialRelatedPosts: readonly RelatedPostSummary[];
  readonly permissions: EntryEditorPermissions & {
    readonly canManageMedia: boolean;
  };
  readonly isTrialMode: boolean;
  readonly isPublishEmailsEnabled: boolean;
  readonly liveUrl?: string;
}

const SEO_TITLE_RECOMMENDED = 60;
const SEO_DESC_RECOMMENDED = 160;

/**
 * Stateful SEO accordion (`C1`): auto-opens when any SEO publish validation
 * error appears and stays open while the user edits and clears errors.
 */
function SeoDetailsSection({
  title,
  hasError,
  children,
}: {
  readonly title: string;
  readonly hasError: boolean;
  readonly children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = React.useState(hasError);

  React.useEffect(() => {
    if (hasError) {
      setIsOpen(true);
    }
  }, [hasError]);

  return (
    <details
      className="rounded-md border border-border bg-muted/10 p-4"
      open={isOpen}
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-semibold text-foreground">
        {title}
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

function updateLocalizedString(
  current: Localized<string> | undefined,
  locale: Locale,
  nextVal: string,
  requiredEs: boolean,
): Localized<string> | undefined {
  const nextEs = locale === "es-AR" ? nextVal : (current?.["es-AR"] ?? "");
  const nextEn = locale === "en-US" ? nextVal : current?.["en-US"];

  if (!requiredEs && nextEs.trim() === "" && (!nextEn || nextEn.trim() === "")) {
    return undefined;
  }

  return {
    "es-AR": nextEs,
    ...(nextEn !== undefined && nextEn.trim() !== "" ? { "en-US": nextEn } : {}),
  };
}

export function PostEditor({
  docId,
  initialDoc,
  initialStatus,
  initialValues,
  initialFeaturedImage,
  initialAuthor,
  initialRelatedPosts,
  permissions,
  isTrialMode,
  isPublishEmailsEnabled,
  liveUrl,
}: PostEditorProps) {
  const t = useTranslations("content");
  const tEd = useTranslations("contentEditorial");

  const [notifySubscribers, setNotifySubscribers] = React.useState(true);
  const canSendEmailOnThisPublishRef = React.useRef(false);

  const actionOverrides = React.useMemo<
    Partial<EntryEditorActionHandlers<PostFields>>
  >(
    () => ({
      create: createPostAction,
      saveDraft: savePostDraftAction,
      preparePublish: preparePostPublishAction,
      confirmPublish: confirmPostPublishAction,
    }),
    [],
  );

  const customFieldErrorMap = React.useCallback(
    (path: string, rawMessages: readonly string[]) => {
      if (path === "category" || rawMessages.includes("invalid-category")) {
        return tEd("errors.invalidCategory");
      }
      return undefined;
    },
    [tEd],
  );

  return (
    <EntryEditor<PostFields>
      collection="posts"
      docId={docId}
      initialDoc={initialDoc}
      initialStatus={initialStatus}
      initialValues={initialValues}
      backHref="/content/posts"
      backLabel={t("types.posts")}
      getTitle={(vals) => vals.title["es-AR"] || vals.title["en-US"] || ""}
      permissions={permissions}
      isTrialMode={isTrialMode}
      isPublishEmailsEnabled={isPublishEmailsEnabled}
      liveUrl={liveUrl}
      actionOverrides={actionOverrides}
      customFieldErrorMap={customFieldErrorMap}
      publishDialogExtras={(ctx) => {
        const showEmailBox = ctx.isFirstPublish && ctx.isPublishEmailsEnabled;
        canSendEmailOnThisPublishRef.current = showEmailBox;
        if (!showEmailBox) return null;
        return (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <Checkbox
              id="post-notify-subscribers"
              checked={notifySubscribers}
              onChange={(e) => setNotifySubscribers(e.target.checked)}
              label={tEd("posts.notifySubscribers")}
            />
          </div>
        );
      }}
      getPublishOptions={() => ({
        notify: canSendEmailOnThisPublishRef.current
          ? notifySubscribers
          : false,
      })}
      renderLocalizedFields={({ activeLocale, values, form, readOnly, getError }) => {
        const titleValue = values.title[activeLocale] ?? "";
        const subtitleValue = values.subtitle?.[activeLocale] ?? "";
        const seoTitleValue = values.seoTitle?.[activeLocale] ?? "";
        const seoDescValue = values.seoDescription?.[activeLocale] ?? "";
        const contentValue = values.content?.[activeLocale];
        const spanishContentPreview = extractPlainTextFromRichText(
          values.content?.["es-AR"],
        );
        const hasSeoError = Boolean(
          getError(`seoTitle.${activeLocale}`) ||
            getError("seoTitle") ||
            getError(`seoDescription.${activeLocale}`) ||
            getError("seoDescription") ||
            getError(`keywords.${activeLocale}`),
        );

        return (
          <>
            <Field
              label={tEd("posts.titleLabel")}
              htmlFor={`post-title-${activeLocale}`}
              fieldPath={`title.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={t("errors.requiredMark")}
              error={getError(`title.${activeLocale}`) ?? getError("title")}
            >
              <Input
                id={`post-title-${activeLocale}`}
                value={titleValue}
                disabled={readOnly}
                placeholder={
                  activeLocale === "en-US" && values.title["es-AR"]
                    ? values.title["es-AR"]
                    : tEd("posts.titlePlaceholder")
                }
                onChange={(e) => {
                  const next = updateLocalizedString(
                    values.title,
                    activeLocale,
                    e.target.value,
                    true,
                  );
                  if (next) form.setField("title", next);
                }}
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={values.title["es-AR"] || undefined}
                isEnglishEmpty={titleValue.trim() === ""}
                readOnly={readOnly}
                onCopyFromSpanish={
                  values.title["es-AR"]
                    ? () =>
                        form.setField("title", {
                          "es-AR": values.title["es-AR"],
                          "en-US": values.title["es-AR"],
                        })
                    : undefined
                }
              />
            </Field>

            <Field
              label={tEd("posts.subtitleLabel")}
              htmlFor={`post-subtitle-${activeLocale}`}
              fieldPath={`subtitle.${activeLocale}`}
              error={getError(`subtitle.${activeLocale}`)}
            >
              <Textarea
                id={`post-subtitle-${activeLocale}`}
                rows={2}
                value={subtitleValue}
                disabled={readOnly}
                placeholder={
                  activeLocale === "en-US" && values.subtitle?.["es-AR"]
                    ? values.subtitle["es-AR"]
                    : tEd("posts.subtitlePlaceholder")
                }
                onChange={(e) => {
                  form.setField(
                    "subtitle",
                    updateLocalizedString(
                      values.subtitle,
                      activeLocale,
                      e.target.value,
                      false,
                    ),
                  );
                }}
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={values.subtitle?.["es-AR"] || undefined}
                isEnglishEmpty={subtitleValue.trim() === ""}
                readOnly={readOnly}
                onCopyFromSpanish={
                  values.subtitle?.["es-AR"]
                    ? () =>
                        form.setField("subtitle", {
                          "es-AR": values.subtitle!["es-AR"],
                          "en-US": values.subtitle!["es-AR"],
                        })
                    : undefined
                }
              />
            </Field>

            <Field
              label={tEd("posts.contentLabel")}
              fieldPath={`content.${activeLocale}`}
              requiredToPublish={activeLocale === "es-AR"}
              requiredMarkLabel={t("errors.requiredMark")}
              error={getError(`content.${activeLocale}`) ?? getError("content")}
            >
              <RichTextEditor
                key={`post-content-${activeLocale}`}
                profile="article"
                value={contentValue}
                readOnly={readOnly}
                minHeightClassName="min-h-64"
                onLossyLoad={(lossy) =>
                  form.markLossyField(`content.${activeLocale}`, lossy)
                }
                onChange={(nextDoc) => {
                  const nextEs =
                    activeLocale === "es-AR"
                      ? nextDoc
                      : (values.content?.["es-AR"] ?? {
                          type: "doc",
                          content: [{ type: "paragraph" }],
                        });
                  const nextEn =
                    activeLocale === "en-US"
                      ? nextDoc
                      : values.content?.["en-US"];
                  form.setField("content", {
                    "es-AR": nextEs,
                    ...(nextEn !== undefined ? { "en-US": nextEn } : {}),
                  });
                }}
              />
              <LocalizedFieldReference
                activeLocale={activeLocale}
                spanishOriginal={spanishContentPreview || undefined}
                isEnglishEmpty={
                  extractPlainTextFromRichText(contentValue).trim() === ""
                }
                collapsible
                readOnly={readOnly}
                onCopyFromSpanish={
                  values.content?.["es-AR"]
                    ? () =>
                        form.setField("content", {
                          "es-AR": values.content!["es-AR"],
                          "en-US": structuredClone(values.content!["es-AR"]),
                        })
                    : undefined
                }
              />
            </Field>

            <SeoDetailsSection
              title={tEd("posts.seoSectionTitle")}
              hasError={hasSeoError}
            >
                <Field
                  label={tEd("posts.seoTitleLabel")}
                  htmlFor={`post-seo-title-${activeLocale}`}
                  fieldPath={`seoTitle.${activeLocale}`}
                  requiredToPublish={activeLocale === "es-AR"}
                  requiredMarkLabel={t("errors.requiredMark")}
                  hint={tEd("posts.seoCharCount", {
                    count: seoTitleValue.length,
                    recommended: SEO_TITLE_RECOMMENDED,
                  })}
                  error={
                    getError(`seoTitle.${activeLocale}`) ?? getError("seoTitle")
                  }
                >
                  <Input
                    id={`post-seo-title-${activeLocale}`}
                    value={seoTitleValue}
                    disabled={readOnly}
                    placeholder={
                      activeLocale === "en-US" && values.seoTitle?.["es-AR"]
                        ? values.seoTitle["es-AR"]
                        : tEd("posts.seoTitlePlaceholder")
                    }
                    onChange={(e) => {
                      form.setField(
                        "seoTitle",
                        updateLocalizedString(
                          values.seoTitle,
                          activeLocale,
                          e.target.value,
                          false,
                        ),
                      );
                    }}
                  />
                  <LocalizedFieldReference
                    activeLocale={activeLocale}
                    spanishOriginal={values.seoTitle?.["es-AR"] || undefined}
                    isEnglishEmpty={seoTitleValue.trim() === ""}
                    readOnly={readOnly}
                    onCopyFromSpanish={
                      values.seoTitle?.["es-AR"]
                        ? () =>
                            form.setField("seoTitle", {
                              "es-AR": values.seoTitle!["es-AR"],
                              "en-US": values.seoTitle!["es-AR"],
                            })
                        : undefined
                    }
                  />
                </Field>

                <Field
                  label={tEd("posts.seoDescriptionLabel")}
                  htmlFor={`post-seo-desc-${activeLocale}`}
                  fieldPath={`seoDescription.${activeLocale}`}
                  requiredToPublish={activeLocale === "es-AR"}
                  requiredMarkLabel={t("errors.requiredMark")}
                  hint={tEd("posts.seoCharCount", {
                    count: seoDescValue.length,
                    recommended: SEO_DESC_RECOMMENDED,
                  })}
                  error={
                    getError(`seoDescription.${activeLocale}`) ??
                    getError("seoDescription")
                  }
                >
                  <Textarea
                    id={`post-seo-desc-${activeLocale}`}
                    rows={3}
                    value={seoDescValue}
                    disabled={readOnly}
                    placeholder={
                      activeLocale === "en-US" &&
                      values.seoDescription?.["es-AR"]
                        ? values.seoDescription["es-AR"]
                        : tEd("posts.seoDescriptionPlaceholder")
                    }
                    onChange={(e) => {
                      form.setField(
                        "seoDescription",
                        updateLocalizedString(
                          values.seoDescription,
                          activeLocale,
                          e.target.value,
                          false,
                        ),
                      );
                    }}
                  />
                  <LocalizedFieldReference
                    activeLocale={activeLocale}
                    spanishOriginal={
                      values.seoDescription?.["es-AR"] || undefined
                    }
                    isEnglishEmpty={seoDescValue.trim() === ""}
                    readOnly={readOnly}
                    onCopyFromSpanish={
                      values.seoDescription?.["es-AR"]
                        ? () =>
                            form.setField("seoDescription", {
                              "es-AR": values.seoDescription!["es-AR"],
                              "en-US": values.seoDescription!["es-AR"],
                            })
                        : undefined
                    }
                  />
                </Field>

                <KeywordsField
                  activeLocale={activeLocale}
                  value={values.keywords}
                  onChange={(next) => form.setField("keywords", next)}
                  readOnly={readOnly}
                  error={getError(`keywords.${activeLocale}`)}
                />
            </SeoDetailsSection>
          </>
        );
      }}
      renderGeneralFields={({ values, form, readOnly, isPublished, getError }) => {
        const hasUnknownCategory = Boolean(
          values.category && !isAllowedPostCategory(values.category),
        );

        return (
          <>
            <SlugField
              id="post-slug"
              label={tEd("posts.slugLabel")}
              prefix="/blog/"
              value={values.slug ?? ""}
              onChange={(next) =>
                form.setField("slug", next.trim() ? next : undefined)
              }
              autoSource={values.title["es-AR"]}
              isPublished={isPublished}
              readOnly={readOnly}
              requiredToPublish
              fieldPath="slug"
              error={getError("slug")}
            />

            <Field
              label={tEd("posts.categoryLabel")}
              htmlFor="post-category"
              fieldPath="category"
              hint={
                hasUnknownCategory
                  ? tEd("posts.categoryUnknownHint")
                  : tEd("posts.categoryHint")
              }
              error={getError("category")}
            >
              <Select
                id="post-category"
                value={values.category ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  form.setField("category", e.target.value || undefined)
                }
              >
                <option value="">{tEd("categories.none")}</option>
                {hasUnknownCategory && values.category && (
                  <option value={values.category}>
                    {tEd("categories.unknownOption", {
                      value: values.category,
                    })}
                  </option>
                )}
                {POST_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {tEd(`categories.${POST_CATEGORY_MESSAGE_KEYS[cat]}`)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label={tEd("posts.publishedDateLabel")}
              htmlFor="post-published-date"
              fieldPath="publishedDate"
              requiredToPublish
              requiredMarkLabel={t("errors.requiredMark")}
              error={getError("publishedDate")}
            >
              <Input
                id="post-published-date"
                type="date"
                value={(values.publishedDate ?? "").slice(0, 10)}
                disabled={readOnly}
                onChange={(e) =>
                  form.setField("publishedDate", e.target.value || undefined)
                }
              />
            </Field>

            <AuthorPickerField
              value={values.authorId}
              initialAuthor={initialAuthor}
              onChange={(authorId) => form.setField("authorId", authorId)}
              readOnly={readOnly}
              requiredToPublish
              error={getError("authorId")}
            />

            <Field
              label={tEd("posts.featuredImageLabel")}
              fieldPath="featuredImageId"
              requiredToPublish
              requiredMarkLabel={t("errors.requiredMark")}
              error={getError("featuredImageId")}
            >
              <MediaField
                accept="image"
                value={values.featuredImageId}
                initialMedia={initialFeaturedImage}
                canUpload={permissions.canManageMedia}
                readOnly={readOnly}
                onChange={(mediaId) =>
                  form.setField("featuredImageId", mediaId)
                }
              />
            </Field>

            <RelatedPostsField
              docId={docId}
              value={values.relatedPostIds ?? []}
              initialPosts={initialRelatedPosts}
              onChange={(ids) => form.setField("relatedPostIds", ids)}
              readOnly={readOnly}
              error={getError("relatedPostIds")}
            />
          </>
        );
      }}
    />
  );
}
