"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@src/components/ui/dialog";
import { Button } from "@src/components/ui/button";
import { Input } from "@src/components/ui/input";
import { inviteUserAction } from "./actions";
import { useUsersRbacErrorMessage } from "../roles/rbac-error-message";
import type { ActionResult } from "@src/service/types";

export interface InviteDialogRole {
  readonly id: string;
  readonly name: string;
  readonly key?: string;
}

interface InviteDialogProps {
  readonly roles: readonly InviteDialogRole[];
}

/**
 * The invite modal: email `<Input>` + role checkboxes, `useActionState`, and
 * server-authoritative Zod validation surfaced via `fieldErrors`/`rbac.errors`.
 * `Dialog.Title` is present (required for an accessible modal — see
 * `components/ui/dialog.tsx`). Closes itself on a successful invite; an
 * uncontrolled form naturally re-renders empty the next time it opens
 * because Radix unmounts `DialogContent` while closed.
 */
export function InviteDialog({ roles }: InviteDialogProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("users.invite");
  const tSystem = useTranslations("roles.system");
  const [state, formAction, isPending] = useActionState<ActionResult | undefined, FormData>(
    inviteUserAction,
    undefined,
  );
  const errorMessage = useUsersRbacErrorMessage(state);
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;

  // Close on a successful invite — adjusted DURING RENDER against a ref of
  // the previous `state`, per React's "you might not need an Effect" guide,
  // rather than a `useEffect` (which the react-hooks/set-state-in-effect
  // rule flags for exactly this "setState synchronously in an effect body"
  // shape).
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{t("trigger")}</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-email" className="text-xs font-medium text-muted-foreground">
              {t("emailLabel")}
            </label>
            <Input id="invite-email" name="email" type="email" required disabled={isPending} />
            {fieldErrors?.email && (
              <span role="alert" className="text-xs text-destructive">
                {fieldErrors.email[0]}
              </span>
            )}
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium text-muted-foreground">
              {t("rolesLabel")}
            </legend>
            <div className="flex flex-col gap-1">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="roleIds" value={role.id} disabled={isPending} />
                  {role.key ? tSystem(`${role.key}.name`) : role.name}
                </label>
              ))}
            </div>
            {fieldErrors?.roleIds && (
              <span role="alert" className="text-xs text-destructive">
                {fieldErrors.roleIds[0]}
              </span>
            )}
          </fieldset>

          {errorMessage && (
            <span role="alert" className="text-xs text-destructive">
              {errorMessage}
            </span>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
