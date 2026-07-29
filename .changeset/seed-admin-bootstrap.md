---
"@idcr/admin": minor
---

Add the guarded `seed:admin` bootstrap script that provisions the first Admin
user: seeds the system roles and creates one pending Admin invite in the
`ministry-admin*` database, behind six guards (wrong-database refusal,
already-administrable refusal, idempotency, explicit target, human
confirmation, secret hygiene). `createInvite` now accepts an optional
`invitedByUserId` so seeded invites carry none.
