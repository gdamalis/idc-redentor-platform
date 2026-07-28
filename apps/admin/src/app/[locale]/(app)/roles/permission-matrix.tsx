"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { PERMISSION_KEYS } from "@src/lib/rbac/permissions";
import type { PermissionKey } from "@src/lib/rbac/permissions";
import { ADMIN_EQUIVALENT_KEYS } from "@src/lib/rbac/last-admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@src/components/ui/table";
import { Button } from "@src/components/ui/button";
import { updateRoleAction } from "./actions";
import { rbacErrorMessageKey } from "./rbac-error-message";
import type { ActionResult } from "@src/service/types";

export interface MatrixRole {
  readonly id: string;
  /** The role's stored (canonical, non-localized) name — submitted back
   * unchanged, since this matrix only ever edits `permissions`. */
  readonly name: string;
  /** The role's stored description — round-tripped unchanged for the same
   * reason `name` is: a permissions-only save must not clear it (see
   * `RoleColumnForm`'s hidden `description` field). */
  readonly description?: string;
  readonly key?: string;
  readonly permissions: readonly string[];
}

interface PermissionMatrixProps {
  readonly roles: readonly MatrixRole[];
  readonly canManage: boolean;
}

/**
 * Groups `PERMISSION_KEYS` by the `resource:` prefix, IN REGISTRY ORDER —
 * this, not a hardcoded row/group list, is what makes "adding a key requires
 * touching only the map" true (see `permission-matrix.test.tsx`).
 */
function groupByResource(): ReadonlyMap<string, readonly PermissionKey[]> {
  const groups = new Map<string, PermissionKey[]>();
  for (const key of PERMISSION_KEYS) {
    const resource = key.split(":")[0] ?? key;
    const existing = groups.get(resource);
    if (existing) {
      existing.push(key);
    } else {
      groups.set(resource, [key]);
    }
  }
  return groups;
}

const ADMIN_EQUIVALENT_KEY_SET: ReadonlySet<string> = new Set(ADMIN_EQUIVALENT_KEYS);

/**
 * `<table>`: rows = every `PERMISSION_KEY` grouped by resource, columns =
 * roles. Real `<input type="checkbox">` elements — no JS-only pseudo-
 * checkboxes. Each ROLE gets its own `<form>` (rendered by `RoleColumnForm`
 * below) associated with that role's checkboxes via the HTML `form`
 * attribute rather than DOM nesting — the matrix layout interleaves every
 * role's cells within each permission row, so a literal `<form>` wrapping a
 * single column isn't possible inside one `<table>`. `FormData` construction
 * follows an element's `form` attribute regardless of DOM position (HTML
 * living-standard "form-associated element" rules), so this is standard,
 * fully-native form submission — not a client-side workaround.
 *
 * No optimistic UI: each column's checkboxes reflect `defaultChecked` from
 * the server-provided `roles` prop only, and `useActionState`'s `state` is
 * used solely to render a refusal message — never to update a checkbox's
 * apparent state ahead of the server's response.
 */
export function PermissionMatrix({ roles, canManage }: PermissionMatrixProps) {
  const t = useTranslations("permissions");
  const tMatrix = useTranslations("roles.matrix");
  const tSystem = useTranslations("roles.system");
  const groups = groupByResource();

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-background">
              {tMatrix("permissionColumn")}
            </TableHead>
            {roles.map((role) => (
              <TableHead key={role.id} className="text-center">
                {role.key ? tSystem(`${role.key}.name`) : role.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        {[...groups.entries()].map(([resource, keys]) => (
          <TableBody key={resource}>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableCell
                colSpan={roles.length + 1}
                className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {t(`groups.${resource}`)}
              </TableCell>
            </TableRow>
            {keys.map((key) => (
              <TableRow key={key}>
                <TableCell className="sticky left-0 z-10 bg-background font-medium">
                  {t(`${key}.label`)}
                </TableCell>
                {roles.map((role) => {
                  // Gated on `canManage` too — with it false, no `<form>`
                  // for this role even exists (see the guard below the
                  // table), so a hidden mirror would just be dead markup.
                  const isProtectedAdminKey =
                    canManage && role.key === "admin" && ADMIN_EQUIVALENT_KEY_SET.has(key);
                  return (
                    <TableCell key={role.id} className="text-center">
                      <input
                        type="checkbox"
                        name="permissions"
                        value={key}
                        aria-label={`${role.name} — ${t(`${key}.label`)}`}
                        form={`role-form-${role.id}`}
                        defaultChecked={role.permissions.includes(key)}
                        disabled={!canManage || isProtectedAdminKey}
                      />
                      {/* A disabled checkbox is never submitted in FormData
                          (HTML living-standard "disabled" behavior) — mirror
                          the Admin role's protected keys with a real hidden
                          input of the same name/value/form so submitted data
                          reflects what's visibly checked, regardless of the
                          disabled state. Server-side, `updateRoleAction`
                          force-unions these keys back in unconditionally
                          anyway (it must not depend on the client sending
                          them) — this mirror is what keeps a permissions-only
                          save from LOOKING like it silently dropped them. */}
                      {isProtectedAdminKey && (
                        <input
                          type="hidden"
                          name="permissions"
                          value={key}
                          form={`role-form-${role.id}`}
                        />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        ))}
      </Table>

      {canManage &&
        roles.map((role) => <RoleColumnForm key={role.id} role={role} />)}
    </div>
  );
}

/**
 * The out-of-DOM-tree `<form>` a role's column of checkboxes associates with
 * (via `form={role-form-${role.id}}`), plus the visible save control for
 * that role. One `useActionState` per role — a fixed number of sibling
 * component instances, not a hook called in a loop.
 */
function RoleColumnForm({ role }: { readonly role: MatrixRole }) {
  const tMatrix = useTranslations("roles.matrix");
  const tErrors = useTranslations("rbac.errors");
  const [state, formAction, isPending] = useActionState<
    ActionResult | undefined,
    FormData
  >(updateRoleAction, undefined);
  const errorKey = rbacErrorMessageKey(state);

  return (
    <form
      id={`role-form-${role.id}`}
      action={formAction}
      className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-sm"
    >
      <input type="hidden" name="roleId" value={role.id} />
      <input type="hidden" name="name" value={role.name} />
      {/* Round-tripped exactly like `name` above: this matrix never edits
          `description`, so a permissions-only save must carry the role's
          CURRENT description back unchanged rather than submitting it as
          absent — an absent field previously reached `updateRole` as
          `undefined` and corrupted the document (see role.service.ts). */}
      <input type="hidden" name="description" value={role.description ?? ""} />
      <span className="font-medium">{role.name}</span>
      <div className="flex items-center gap-3">
        {state?.ok === true && (
          <span className="text-xs text-muted-foreground">{tMatrix("saved")}</span>
        )}
        {errorKey && (
          <span role="alert" className="text-xs text-destructive">
            {tErrors(errorKey)}
          </span>
        )}
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {tMatrix("save")}
        </Button>
      </div>
    </form>
  );
}
