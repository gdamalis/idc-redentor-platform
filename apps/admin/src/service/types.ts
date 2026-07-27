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
        | "no-invite" // (provisioning) authenticated, PROVABLY never invited — safe to destroy the credential
        | "email-unverified" // (provisioning, first sign-in only) decoded.email_verified !== true
        | "provisioning-conflict"; // (provisioning) transient/ambiguous — cannot prove no-invite; never destructive
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

// Legacy/seeded invite docs may omit `locale` (or carry a stale/invalid
// value) — spec edge case 18 says that should default to the app's default
// locale, not throw. `.catch()` preserves the parsed output type as `Locale`
// (not `Locale | undefined`): `ZodCatch<T>`'s output type is `T["_output"]`.
const inviteLocaleSchema = localeSchema.catch(i18n.defaultLocale);

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

// `Input` is relaxed to `unknown` (vs. `adminUserSchema`'s default `Input = Output`
// above): `.catch()` on `locale` deliberately accepts input broader than `Locale`
// (missing/invalid values it repairs to the default), so the schema's inferred
// input type is no longer exactly `Invite` — only its parsed OUTPUT still is,
// which is what `.parse()`/`.safeParse()` callers actually rely on.
export const inviteSchema = z.object({
  _id: objectIdSchema,
  email: z.string().min(1),
  roleIds: z.array(z.string()),
  locale: inviteLocaleSchema,
  status: z.enum(["pending", "accepted", "revoked"]),
  expiresAt: z.date(),
  createdAt: z.date(),
  acceptedAt: z.date().optional(),
  invitedByUserId: z.string().optional(),
}) satisfies z.ZodType<Invite, z.ZodTypeDef, unknown>;
