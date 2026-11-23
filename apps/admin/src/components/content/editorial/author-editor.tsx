"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { AuthorFields, ContentStatus } from "@idcr/content";
import type { SerializedContentDoc } from "@src/app/[locale]/(app)/content/actions";
import type { SerializedMediaDoc } from "@src/app/[locale]/(app)/content/media/actions";
import { EntryEditor } from "@src/components/content/entry-editor";
import type { EntryEditorPermissions } from "@src/components/content/entry-editor-types";
import { MediaField } from "@src/components/content/media";
import { Field } from "@src/components/ui/field";
import { Input } from "@src/components/ui/input";
import type { LinkedPlatformUser } from "@src/service/content/editorial/editorial-loaders.service";
import { PlatformUserField } from "./platform-user-field";

export interface AuthorEditorProps {
  readonly docId?: string;
  readonly initialDoc?: SerializedContentDoc<AuthorFields>;
  readonly initialStatus: ContentStatus;
  readonly initialValues: AuthorFields;
  readonly initialAvatar: SerializedMediaDoc | null;
  readonly initialLinkedUser: LinkedPlatformUser | null;
  readonly permissions: EntryEditorPermissions & {
    readonly canManageMedia: boolean;
    readonly canReadUsers: boolean;
  };
  readonly isTrialMode: boolean;
}

/**
 * People (`authors`) editor (`ICR-199` AC8, `D20`):
 * - Omits `renderLocalizedFields` so `LocaleTabs` is automatically hidden.
 * - Library entry: no Preview, no Unpublish, cascade-published with parent post/sermon,
 *   delete guarded by `findContentUsages` across `posts` & `sermons`.
 * - Optional internal `email` (never shown on site) + optional `users:read`-gated `userId`.
 */
export function AuthorEditor({
  docId,
  initialDoc,
  initialStatus,
  initialValues,
  initialAvatar,
  initialLinkedUser,
  permissions,
  isTrialMode,
}: AuthorEditorProps) {
  const t = useTranslations("content");
  const tEd = useTranslations("contentEditorial");

  return (
    <EntryEditor<AuthorFields>
      collection="authors"
      docId={docId}
      initialDoc={initialDoc}
      initialStatus={initialStatus}
      initialValues={initialValues}
      backHref="/content/authors"
      backLabel={t("types.authors")}
      getTitle={(vals) => vals.name || ""}
      permissions={permissions}
      isTrialMode={isTrialMode}
      renderGeneralFields={({ values, form, readOnly, getError }) => (
        <div className="max-w-xl space-y-5">
          <Field
            label={tEd("authors.nameLabel")}
            htmlFor="author-name"
            fieldPath="name"
            requiredToPublish
            requiredMarkLabel={t("errors.requiredMark")}
            error={getError("name")}
          >
            <Input
              id="author-name"
              value={values.name ?? ""}
              disabled={readOnly}
              placeholder={tEd("authors.namePlaceholder")}
              onChange={(e) => form.setField("name", e.target.value)}
            />
          </Field>

          <Field
            label={tEd("authors.avatarLabel")}
            fieldPath="avatarMediaId"
            error={getError("avatarMediaId")}
          >
            <MediaField
              accept="image"
              value={values.avatarMediaId}
              initialMedia={initialAvatar}
              canUpload={permissions.canManageMedia}
              readOnly={readOnly}
              onChange={(mediaId) => form.setField("avatarMediaId", mediaId)}
            />
          </Field>

          <Field
            label={tEd("authors.emailLabel")}
            htmlFor="author-email"
            fieldPath="email"
            hint={tEd("authors.emailHint")}
            error={getError("email")}
          >
            <Input
              id="author-email"
              type="email"
              value={values.email ?? ""}
              disabled={readOnly}
              placeholder={tEd("authors.emailPlaceholder")}
              onChange={(e) => {
                const raw = e.target.value;
                form.setField("email", raw.trim() === "" ? undefined : raw);
              }}
            />
          </Field>

          <PlatformUserField
            value={values.userId}
            initialUser={initialLinkedUser}
            canReadUsers={permissions.canReadUsers}
            readOnly={readOnly}
            onChange={(userId) => form.setField("userId", userId)}
            error={getError("userId")}
          />
        </div>
      )}
    />
  );
}
