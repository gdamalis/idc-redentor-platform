"use server";

import { requireActionPermission } from "@src/lib/rbac/require-action-permission";
import { listUsers } from "@src/service/user.service";
import type { ContentActionResult } from "@src/app/[locale]/(app)/content/actions";
import type { LinkedPlatformUser } from "@src/service/content/editorial/editorial-loaders.service";

const MAX_RESULTS = 50;

/**
 * Searches active admin panel users for optional `author.userId` linking.
 * Strictly gated by `users:read` so editors without user-directory access
 * never receive `admin.users` records.
 */
export async function searchPlatformUsersAction(input: {
  readonly query?: string;
}): Promise<ContentActionResult<{ readonly items: readonly LinkedPlatformUser[] }>> {
  const authz = await requireActionPermission("users:read");
  if (!authz.ok) {
    return {
      ok: false,
      reason: "forbidden",
      requiredPermission: "users:read",
    };
  }

  const users = await listUsers();
  const needle = input.query?.trim().toLowerCase() ?? "";

  const items: LinkedPlatformUser[] = [];
  for (const user of users) {
    if (user.status !== "active") continue;
    const haystack = `${user.displayName ?? ""} ${user.email}`.toLowerCase();
    if (needle && !haystack.includes(needle)) continue;
    items.push({
      id: user._id.toHexString(),
      email: user.email,
      ...(user.displayName ? { displayName: user.displayName } : {}),
    });
    if (items.length >= MAX_RESULTS) break;
  }

  items.sort((a, b) =>
    (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email),
  );

  return { ok: true, items };
}
