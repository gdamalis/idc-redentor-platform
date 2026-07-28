import { z } from "zod";
import { PERMISSION_KEYS } from "./permissions";

/**
 * Hex-string check rather than importing `ObjectId` from mongodb — keeps the
 * driver out of anything a client component might ever import.
 */
const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "invalid-id");

/**
 * Registry-DERIVED, never a free string. This is the mass-assignment defence:
 * a crafted POST cannot persist "finances:write" or "*" onto a role.
 */
const permissionKeySchema = z.enum(PERMISSION_KEYS);

const roleFields = {
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(permissionKeySchema).default([]),
};

// `key` and `isSystem` are absent by construction — they are NOT updatable.
// zod strips unknown keys by default, so passing them is silently ignored.
export const roleCreateSchema = z.object(roleFields);
export const roleUpdateSchema = z.object({ roleId: objectId, ...roleFields });
export const roleDeleteSchema = z.object({ roleId: objectId });

export const inviteCreateSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  roleIds: z.array(objectId).min(1),
});

export const userRolesUpdateSchema = z.object({
  userId: objectId,
  roleIds: z.array(objectId),
});

export const userStatusUpdateSchema = z.object({
  userId: objectId,
  status: z.enum(["active", "disabled"]),
});

export const userDeleteSchema = z.object({ userId: objectId });
