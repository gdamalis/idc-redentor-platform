import { z } from "zod";
import type { ObjectId } from "mongodb";
import { i18n } from "@src/i18n/config";
import type { Locale } from "@src/i18n/config";

export interface AdminUser {
  _id: ObjectId;
  firebaseUid: string; // unique
  email: string; // unique, normalized lowercase
  displayName?: string;
  roleIds: string[]; // resolved from the Invite; ENFORCEMENT is ICR-128
  preferredLocale: Locale; // seeded from Invite.locale; edited via the LocaleSwitcher (R18)
  status: "active" | "disabled";
  createdAt: Date;
  updatedAt: Date;
}

export interface Invite {
  _id: ObjectId;
  email: string; // normalized lowercase
  roleIds: string[];
  locale: Locale; // invitee's language — drives the invite email + seeds preferredLocale (R18)
  status: "pending" | "accepted" | "revoked";
  expiresAt: Date;
  createdAt: Date;
  acceptedAt?: Date;
  invitedByUserId?: string; // nullable (seeded invites have none)
}

export type SessionResult =
  | { ok: true; user: AdminUser }
  | {
      ok: false;
      reason:
        | "no-session" // no cookie
        | "expired" // cookie past expiry / verify failed
        | "revoked" // refresh tokens revoked (checkRevoked:true)
        | "no-user" // valid cookie, no matching Mongo User
        | "disabled" // User exists but status = disabled
        | "no-invite"; // (provisioning) authenticated but no pending invite
    };

// Untrusted-shape defense: parse every Mongo document through these before use.
const objectIdSchema = z.custom<ObjectId>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toHexString?: unknown }).toHexString === "function",
  { message: "Expected an ObjectId" },
);

const localeSchema = z.enum(i18n.locales);

export const adminUserSchema = z.object({
  _id: objectIdSchema,
  firebaseUid: z.string().min(1),
  email: z.string().min(1),
  displayName: z.string().optional(),
  roleIds: z.array(z.string()),
  preferredLocale: localeSchema,
  status: z.enum(["active", "disabled"]),
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<AdminUser>;

export const inviteSchema = z.object({
  _id: objectIdSchema,
  email: z.string().min(1),
  roleIds: z.array(z.string()),
  locale: localeSchema,
  status: z.enum(["pending", "accepted", "revoked"]),
  expiresAt: z.date(),
  createdAt: z.date(),
  acceptedAt: z.date().optional(),
  invitedByUserId: z.string().optional(),
}) satisfies z.ZodType<Invite>;
