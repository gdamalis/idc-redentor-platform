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
import type { InviteUserResult } from "./actions";
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
 * `components/ui/dialog.tsx`).
 *
 * **ICR-128 P1 fix.** This used to close itself unconditionally on
 * `state.ok`, which is exactly how a swallowed email-delivery failure became
 * a silent success: the admin saw the dialog close and had no way to know
 * the invite was never delivered. It no longer auto-closes on success at
 * all — instead it surfaces the three distinct outcomes `inviteUserAction`
 * can now report (`data.emailSent` / `data.refreshed`) as an inline message
 * and lets the admin dismiss it themselves via Cancel. (No manual form-reset
 * logic is needed here: React resets an uncontrolled `<form action={fn}>`'s
 * fields itself once the action settles, for every outcome — success,
 * warning, or a validation `fieldErrors` refusal alike.) A retry after a
 * delivery-failure warning is re-entering the email and clicking Submit
 * again; `createInvite` refreshes rather than conflicting either way, so a
 * retry can never hit a stale-conflict dead end (see invite.service.ts).
 */
export function InviteDialog({ roles }: InviteDialogProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("users.invite");
  const tSystem = useTranslations("roles.system");
  const [state, formAction, isPending] = useActionState<
    ActionResult<InviteUserResult> | undefined,
    FormData
  >(inviteUserAction, undefined);
  const errorMessage = useUsersRbacErrorMessage(state);
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined;
  const outcome = state?.ok ? state.data : undefined;

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

          {/* Not a silent success: a saved-but-undelivered invite gets a
              warning (assertive `role="alert"`), never the same quiet
              confirmation as a delivered one. */}
          {!isPending && outcome && (
            <span
              role={outcome.emailSent ? "status" : "alert"}
              className={
                outcome.emailSent
                  ? "text-xs text-emerald-600 dark:text-emerald-400"
                  : "text-xs text-amber-600 dark:text-amber-400"
              }
            >
              {outcome.emailSent
                ? outcome.refreshed
                  ? t("resentSuccess")
                  : t("sentSuccess")
                : t("deliveryFailed")}
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
