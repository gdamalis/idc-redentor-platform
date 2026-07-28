"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@src/components/ui/table";
import { Button } from "@src/components/ui/button";
import { Input } from "@src/components/ui/input";
import { createRoleAction, deleteRoleAction } from "./actions";
import { rbacErrorMessageKey } from "./rbac-error-message";
import type { ActionResult } from "@src/service/types";

export interface RoleListItem {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly key?: string;
  readonly isSystem: boolean;
  readonly memberCount: number;
}

interface RoleListProps {
  readonly roles: readonly RoleListItem[];
  readonly canManage: boolean;
}

/**
 * The role list: name · description · isSystem badge · member count, plus
 * (when `canManage`) a create-role form and a delete control per custom
 * role. `useActionState` gives inline `conflict`/`system-role`/`last-admin`
 * feedback that a plain server-rendered form couldn't — e.g. a duplicate
 * role name must be visible to the person who typed it, not just silently
 * refused.
 */
export function RoleList({ roles, canManage }: RoleListProps) {
  const t = useTranslations("roles");
  const tSystem = useTranslations("roles.system");

  return (
    <section className="flex flex-col gap-4 rounded-md border border-border p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.name")}</TableHead>
            <TableHead>{t("table.description")}</TableHead>
            <TableHead className="text-center">{t("table.members")}</TableHead>
            {canManage && (
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => {
            const displayName = role.key ? tSystem(`${role.key}.name`) : role.name;
            const displayDescription = role.key
              ? tSystem(`${role.key}.description`)
              : (role.description ?? "");

            return (
              <TableRow key={role.id}>
                <TableCell className="font-medium">
                  {displayName}
                  {role.isSystem && (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                      {t("table.systemBadge")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{displayDescription}</TableCell>
                <TableCell className="text-center">{role.memberCount}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    {!role.isSystem && (
                      <DeleteRoleButton roleId={role.id} roleName={role.name} />
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {canManage && <CreateRoleForm />}
    </section>
  );
}

function CreateRoleForm() {
  const t = useTranslations("roles");
  const tErrors = useTranslations("rbac.errors");
  const [state, formAction, isPending] = useActionState<
    ActionResult | undefined,
    FormData
  >(createRoleAction, undefined);
  const errorKey = rbacErrorMessageKey(state);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-3 border-t border-border pt-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="new-role-name" className="text-xs font-medium text-muted-foreground">
          {t("form.nameLabel")}
        </label>
        <Input id="new-role-name" name="name" required disabled={isPending} className="w-48" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="new-role-description"
          className="text-xs font-medium text-muted-foreground"
        >
          {t("form.descriptionLabel")}
        </label>
        <Input
          id="new-role-description"
          name="description"
          disabled={isPending}
          className="w-64"
        />
      </div>
      <Button type="submit" size="sm" disabled={isPending}>
        {t("new")}
      </Button>
      {errorKey && (
        <span role="alert" className="text-xs text-destructive">
          {tErrors(errorKey)}
        </span>
      )}
    </form>
  );
}

function DeleteRoleButton({
  roleId,
  roleName,
}: {
  readonly roleId: string;
  readonly roleName: string;
}) {
  const t = useTranslations("roles");
  const tErrors = useTranslations("rbac.errors");
  const [state, formAction, isPending] = useActionState<
    ActionResult | undefined,
    FormData
  >(deleteRoleAction, undefined);
  const errorKey = rbacErrorMessageKey(state);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        // No dialog primitive lands until Task 6 (@radix-ui/react-dialog) —
        // a native confirm() is the minimal guard against an accidental
        // click on a destructive action until then.
        if (!window.confirm(t("form.deleteConfirm", { name: roleName }))) {
          event.preventDefault();
        }
      }}
      className="inline-flex items-center justify-end gap-2"
    >
      <input type="hidden" name="roleId" value={roleId} />
      {errorKey && (
        <span role="alert" className="text-xs text-destructive">
          {tErrors(errorKey)}
        </span>
      )}
      <Button type="submit" variant="destructive" size="sm" disabled={isPending}>
        {t("delete")}
      </Button>
    </form>
  );
}
