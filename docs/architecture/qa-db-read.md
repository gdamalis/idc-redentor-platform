# QA database reads (`qa-db-read`)

QA agents read saved records in the **staging/test databases** with one committed, strictly
read-only command. It replaces the `mongoMcp: "mongodb-localhost"` entry that used to sit in
`.claude/config.json` (no such tool exists in agent sessions). Contract id: `yoke/qa-db-read@1`.

## Which tool

```bash
YOKE_QA_DB_ENV=previewAdmin \
sh -c 'cd apps/admin && exec node --import tsx scripts/qa-db-read.ts read \
  --db ministry-admin-staging --collection rbacAudit --filter "{\"action\":\"role.create\"}" --limit 5'
```

Verbs: `read` (find), `count`, `aggregate` (`--pipeline <json array>`). Flags: `--db`, `--collection`,
`--filter`, `--project`, `--sort`, `--limit` (capped at 50), `--pipeline`. Run it with `node --import tsx`
from `apps/admin`, never `pnpm run`/`pnpm exec` (pnpm rewrites exit codes).

Exit codes: **0** ok · **2** refused (policy or arguments; nothing was queried) · **1** unexpected
failure (a fixed message; driver text is never printed). stdout is exactly one JSON object with
`observedVia: "DB"`; diagnostics go to stderr. Record `observedVia: "DB"` in the QA report.

**Do not use a locally registered Mongo MCP server** (for example `mongodb-idcr-*` with
`MDB_MCP_READ_ONLY=false`): they can write and do not mask personal data.

## Setup on a workstation

The only prerequisite is a logged-in Vercel CLI and this repo. No per-machine MCP or config.
Pull the environment for the **named target**, use it, shred it:

```bash
umask 077
vercel env pull /tmp/qa-db.env --environment <preview|staging> --project idc-redentor-admin --scope divine-lab --yes
set -a; . /tmp/qa-db.env; set +a      # never echo it
# … run the command …
shred -u /tmp/qa-db.env
```

Admin previews share the staging databases (see `admin-qa-account.md`). For `website-*` databases use
the `idc-redentor-web` project: the command reads `WEBSITE_MONGODB_URI` for `website-*` and `MONGODB_URI`
for `ministry-admin-*`, with no fallback. Admin URIs may have an empty database path, so `--db` is mandatory;
a URI path, when present, must equal `--db`. The command never falls back to `test`.

## Which databases

`YOKE_QA_DB_ENV` is required (no default): `preview` → `^(website|ministry-admin)-(test|qa|e2e)$`;
`previewAdmin`, `staging`, `stagingAdmin` → `^(website|ministry-admin)-(staging|test|qa|e2e)$`. These
equal `qa.env.<env>.dbNameAllow` in `.claude/config.json` (a test keeps them in sync). Bare `website`,
`ministry-admin`, `test`, `admin`, `local`, `config` and every production name are refused **before** a
connection is made. Collections are default-deny (list in `qaDb.collections`); other verbs, `$out`, `$merge`,
`$unionWith`, `$graphLookup`, `$function`, `$where`, `$accumulator` and every unlisted operator are refused.
Queries get `maxTimeMS` 5000 and a 50-document cap.

## Personal data

Connection strings are read from the environment only (never argv) and never printed. Output is scrubbed:
fields named like email, password, token, secret, uid, ip, phone/teléfono, address/dirección, first/last/full/display
name, nombre/apellido, birth/dob and notes are replaced by `"[masked]"`; `name` is masked on identity/contact data and
after any `$lookup`, except values starting with `"QA "` (test identities) and system role names (`admin`/`leader`/`member`)
on `roles`/`rbacAudit`; every string, including keys,
has emails, `mongodb://` URIs, JWTs and bearer tokens masked. Projections accept only `0`/`1`/`true`/`false` and `$group`
rejects references to masked fields so queries cannot rename PII out of the denylist. Filters may still match masked fields, so
an agent can select the `"QA "` entry. Accepted residual risk: repeated regex filters could probe a masked value
one character at a time; never filter on real congregant data, and never paste output that contains
unmasked personal data into a ticket.

## Harness discovery

The canon schema keeps `qa.env.<name>` closed, so the QA runner finds the command through the per-env
`dbReadNote` and the `qaDb` block in `.claude/config.json`. Follow-up: a first-class `qa.db` field the runner
receives in its env block.

## Code map

| File                                 | Role                                                       |
| ------------------------------------ | ---------------------------------------------------------- |
| `apps/admin/scripts/qa-db-read.ts`   | process shell                                              |
| `apps/admin/src/lib/qa-db/policy.ts` | env, db-name, collection, URI-variable and URI-path guards |
| `apps/admin/src/lib/qa-db/query.ts`  | recursive operator scan, stage allowlist, limits           |
| `apps/admin/src/lib/qa-db/scrub.ts`  | PII/secret scrubber                                        |
| `apps/admin/src/lib/qa-db/run.ts`    | ordered guards, then connect and query                     |
| `apps/admin/src/lib/qa-db/driver.ts` | read-only driver adapter (find/count/aggregate only)       |
