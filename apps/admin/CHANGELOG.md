# @idcr/admin

## 0.3.0

### Minor Changes

- 825a49e: Add the guarded `seed:admin` bootstrap script that provisions the first Admin
  user: seeds the system roles and creates one pending Admin invite in the
  `ministry-admin*` database, behind six guards (wrong-database refusal,
  already-administrable refusal, idempotency, explicit target, human
  confirmation, secret hygiene). `createInvite` now accepts an optional
  `invitedByUserId` so seeded invites carry none.

## 0.2.0

### Minor Changes

- 7f21c75: Admin RBAC: a 15-key permission registry, three seeded system roles (Admin/Leader/Member), per-request server-side permission resolution from Mongo, a `/roles` permission matrix, `/users` invite + role assignment, a transactional last-admin invariant, an append-only RBAC audit log, and bilingual strings for every permission, screen, and denial.

## 0.1.1

### Patch Changes

- Updated dependencies [6b3bfad]
  - @idcr/ui@0.0.1

## 0.1.0

### Minor Changes

- e54b273: Admin auth: Firebase (Google + email/password) sign-in, native session cookie, invite-only provisioning, Resend-branded bilingual invite/reset emails, and a per-user language preference.
