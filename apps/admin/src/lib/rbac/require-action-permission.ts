import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "@src/i18n/routing";
import {
  REQUEST_PATHNAME_HEADER,
  sanitizeRequestPathname,
} from "@src/lib/http/request-pathname";
import { requirePermission } from "./require-permission";
import type { Authorized } from "./require-permission";
import type { PermissionKey } from "./permissions";

/** The one `Refused` shape a Server Action can still surface inline — see
 * `requireActionPermission` below. NOT `Extract<Refused, { reason:
 * "forbidden" }>`: `Refused.reason` is a single property typed as the
 * `DeniedReason` union, so `Refused` itself isn't a discriminated union of
 * per-reason variants and `Extract` can't narrow it — it evaluates to
 * `never`. */
export interface ActionRefused {
  readonly ok: false;
  readonly reason: "forbidden";
}

/**
 * The Server Action variant of `requirePermission` (P2 fix). A plain
 * `requirePermission()` call inside a `"use server"` action returns EVERY
 * `DeniedReason` — including the three session-level ones
 * (`unauthenticated`/`no-account`/`disabled`) — as `{ ok: false }`, which a
 * mutating action's caller renders via `rbac-error-message.ts`'s
 * `rbacErrorMessageKey()`. That mapper deliberately has no copy for those
 * three reasons, so a session that expires/is revoked/gets disabled *while
 * an already-rendered edit page is still open* used to submit into a
 * refusal the UI silently dropped (spec edge case #14, "session expires
 * mid-edit").
 *
 * `requireActionPermission` closes that gap the same way the RSC page gate
 * already does (`(app)/layout.tsx`, `roles/page.tsx`): it redirects on a
 * session-level refusal — `unauthenticated` to `/login`, `no-account`/
 * `disabled` to `/no-access` — BEFORE the caller does any parsing or opens a
 * transaction, so no redirect can ever happen mid-write. Only `forbidden`
 * (authenticated + provisioned, wrong key) still returns to the caller as a
 * refusal — that's the one reason the gated UI can legitimately reach with a
 * stale permission set, and it already has on-page copy
 * (`rbac.errors.forbidden`).
 *
 * The `unauthenticated` redirect preserves the return path (spec edge case
 * #14, "the client redirects to `/login` preserving the return path") by
 * reusing `(app)/layout.tsx`'s own mechanism: the proxy-injected
 * `REQUEST_PATHNAME_HEADER` is sanitized into a `callbackUrl` query param, so
 * a session that expires mid-edit sends the admin back to the interrupted
 * page after re-login rather than to the dashboard. Falls back to a plain
 * `/login` when the header is absent (P2 fix).
 *
 * A `"use server"` action has no route `params`, so — unlike a page —
 * `getLocale()` (`next-intl/server`) is how it learns the current locale
 * before redirecting (same convention as `app/not-found.tsx`).
 *
 * Kept in its OWN module rather than folded into `require-permission.ts`:
 * `requirePermission` is a genuine cross-module import here (not a
 * same-file function reference), which is what lets a test mock
 * `require-permission.ts` in isolation and still exercise this wrapper's
 * real redirect-selection logic (see `require-action-permission.test.ts`).
 */
export async function requireActionPermission(
  key: PermissionKey,
): Promise<Authorized | ActionRefused> {
  const result = await requirePermission(key);
  if (result.ok) return result;
  // Reconstructed rather than `return result` — `Refused.reason` is typed as
  // the whole `DeniedReason` union, so equality-narrowing `result.reason`
  // here doesn't narrow the TYPE of `result` itself down to `ActionRefused`
  // (that only works for genuine discriminated unions); `result` carries no
  // other field worth preserving, so rebuilding the literal is both correct
  // and the simplest fix.
  if (result.reason === "forbidden") return { ok: false, reason: "forbidden" };

  const locale = await getLocale();

  if (result.reason === "unauthenticated") {
    const requestHeaders = await headers();
    const callbackUrl = sanitizeRequestPathname(
      requestHeaders.get(REQUEST_PATHNAME_HEADER),
    );
    return redirect({
      href: callbackUrl ? { pathname: "/login", query: { callbackUrl } } : "/login",
      locale,
    });
  }

  return redirect({ href: "/no-access", locale });
}
