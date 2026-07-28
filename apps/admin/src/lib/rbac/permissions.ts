/**
 * The M1b permission catalog (`tasks/specs/admin-mvp.md` §6). Keys are
 * `resource:action`, so the matrix UI groups rows by prefix and a new feature
 * appends a key here WITHOUT touching the UI.
 *
 * The values are DEV-FACING FALLBACKS, never rendered — user-visible labels come
 * from next-intl (`permissions.<key>.label`). See the spec §8.
 */
export const PERMISSIONS = {
  "people:read": "View people",
  "people:write": "Create/edit people",
  "people:delete": "Delete people",
  "people:pii": "View sensitive fields (phone/email)",
  "families:read": "View families",
  "families:write": "Create/edit families",
  "activities:read": "View activities",
  "activities:write": "Create/edit activities",
  "activities:delete": "Delete activities",
  "calendar:read": "View calendar",
  "calendar:print": "Print calendar",
  "users:read": "View users",
  "users:manage": "Invite users, assign roles",
  "roles:read": "View roles",
  "roles:manage": "Create/edit roles + permissions",
} as const satisfies Record<string, string>;

export type PermissionKey = keyof typeof PERMISSIONS;

/** Non-empty tuple — the exact shape `z.enum()` requires. */
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as [
  PermissionKey,
  ...PermissionKey[],
];

/**
 * `hasOwnProperty` via `Object.prototype`, not `key in PERMISSIONS` — the latter
 * would return true for inherited members like `toString`.
 */
export function isPermissionKey(value: unknown): value is PermissionKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PERMISSIONS, value)
  );
}
