"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@idcr/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@src/components/ui/table";
import { Button } from "@src/components/ui/button";
import { deleteUserAction, updateUserRolesAction, updateUserStatusAction } from "./actions";
import { useUsersRbacErrorMessage } from "../roles/rbac-error-message";
import type { ActionResult } from "@src/service/types";

export interface UserTableRole {
  readonly id: string;
  readonly name: string;
  readonly key?: string;
}

export interface UserTableItem {
  readonly id: string;
  readonly email: string;
  readonly displayName?: string;
  readonly roleIds: readonly string[];
  readonly status: "active" | "disabled";
}

interface UserTableProps {
  readonly users: readonly UserTableItem[];
  readonly roles: readonly UserTableRole[];
  readonly canManage: boolean;
}

/**
 * The user table: email · displayName · roles · status, plus (when
 * `canManage`) inline role reassignment, an enable/disable toggle, and
 * delete — one native `<form>` per control, each driving its own Server
 * Action via `useActionState` so a `last-admin` / `not-found` / `forbidden`
 * refusal surfaces inline instead of silently no-oping.
 *
 * Client, for the same reason `role-list.tsx`'s `RoleList` is (see that
 * file's amendment note): only `useActionState` can show these refusals
 * where the click happened, and the page itself (`page.tsx`) stays an RSC
 * that does all the data fetching — only this interactive shell is
 * client-side.
 */
export function UserTable({ users, roles, canManage }: UserTableProps) {
  const t = useTranslations("users");
  const tSystem = useTranslations("roles.system");

  const roleName = (role: UserTableRole) => (role.key ? tSystem(`${role.key}.name`) : role.name);
  const rolesById = new Map(roles.map((role) => [role.id, role]));

  return (
    <section className="rounded-md border border-border p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.email")}</TableHead>
            <TableHead>{t("table.displayName")}</TableHead>
            <TableHead>{t("table.roles")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
            {canManage && <TableHead className="text-right">{t("table.actions")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.email}</TableCell>
              <TableCell className="text-muted-foreground">
                {user.displayName ?? "—"}
              </TableCell>
              <TableCell>
                {canManage ? (
                  <RoleAssignmentForm user={user} roles={roles} roleName={roleName} />
                ) : (
                  (user.roleIds
                    .map((id) => rolesById.get(id))
                    .filter((role): role is UserTableRole => role !== undefined)
                    .map(roleName)
                    .join(", ") || "—")
                )}
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs font-medium",
                    user.status === "active"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {t(`status.${user.status}`)}
                </span>
              </TableCell>
              {canManage && (
                <TableCell>
                  <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <StatusToggleButton userId={user.id} currentStatus={user.status} />
                    <DeleteUserButton userId={user.id} email={user.email} />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function RoleAssignmentForm({
  user,
  roles,
  roleName,
}: {
  readonly user: UserTableItem;
  readonly roles: readonly UserTableRole[];
  readonly roleName: (role: UserTableRole) => string;
}) {
  const t = useTranslations("users");
  const [state, formAction, isPending] = useActionState<ActionResult | undefined, FormData>(
    updateUserRolesAction,
    undefined,
  );
  const errorMessage = useUsersRbacErrorMessage(state);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="userId" value={user.id} />
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {roles.map((role) => (
          <label key={role.id} className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              name="roleIds"
              value={role.id}
              defaultChecked={user.roleIds.includes(role.id)}
              disabled={isPending}
            />
            {roleName(role)}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {t("table.saveRoles")}
        </Button>
        {state?.ok === true && (
          <span className="text-xs text-muted-foreground">{t("table.rolesSaved")}</span>
        )}
        {errorMessage && (
          <span role="alert" className="text-xs text-destructive">
            {errorMessage}
          </span>
        )}
      </div>
    </form>
  );
}

function StatusToggleButton({
  userId,
  currentStatus,
}: {
  readonly userId: string;
  readonly currentStatus: "active" | "disabled";
}) {
  const t = useTranslations("users");
  const [state, formAction, isPending] = useActionState<ActionResult | undefined, FormData>(
    updateUserStatusAction,
    undefined,
  );
  const errorMessage = useUsersRbacErrorMessage(state);
  const nextStatus = currentStatus === "active" ? "disabled" : "active";

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={nextStatus} />
      {errorMessage && (
        <span role="alert" className="text-xs text-destructive">
          {errorMessage}
        </span>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {currentStatus === "active" ? t("table.disable") : t("table.enable")}
      </Button>
    </form>
  );
}

function DeleteUserButton({
  userId,
  email,
}: {
  readonly userId: string;
  readonly email: string;
}) {
  const t = useTranslations("users");
  const [state, formAction, isPending] = useActionState<ActionResult | undefined, FormData>(
    deleteUserAction,
    undefined,
  );
  const errorMessage = useUsersRbacErrorMessage(state);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        // No confirm dialog primitive beyond the invite modal itself — a
        // native confirm() is the minimal guard against an accidental click
        // on a destructive action, mirroring role-list.tsx's DeleteRoleButton.
        if (!window.confirm(t("table.deleteConfirm", { email }))) {
          event.preventDefault();
        }
      }}
      className="inline-flex items-center gap-2"
    >
      <input type="hidden" name="userId" value={userId} />
      {errorMessage && (
        <span role="alert" className="text-xs text-destructive">
          {errorMessage}
        </span>
      )}
      <Button type="submit" variant="destructive" size="sm" disabled={isPending}>
        {t("table.delete")}
      </Button>
    </form>
  );
}
