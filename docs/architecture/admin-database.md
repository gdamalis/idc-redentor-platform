# Admin database — one connection string per database

`apps/admin` reaches **two** MongoDB databases with **two independent connection
strings**, each authenticating as its own single-database Atlas user.

| Env var               | Path database (prod / non-prod)             | Holds                          | Accessor         |
| --------------------- | ------------------------------------------- | ------------------------------ | ---------------- |
| `MONGODB_URI`         | `ministry-admin` / `ministry-admin-staging` | congregant PII + admin auth    | `getAdminDb()`   |
| `WEBSITE_MONGODB_URI` | `website` / `website-staging`               | public content, likes, contact | `getContentDb()` |

Both URIs set `authSource=admin` explicitly and `maxPoolSize=10`.

## Why not a single URI

The shipped ICR-124 model carried one `MONGODB_URI` naming `ministry-admin` and
expected the second database to be reached with a hardcoded `client.db("website")`.
Two problems:

1. **Asymmetry.** One database's name lived in config, the other in code. Neither
   is "the" database, so privileging one in the connection string misleads.
2. **A latent bug.** `"website"` is the _production_ name. On staging the database
   is `website-staging`, so that literal would have been wrong there. The single-URI
   model solved the per-environment suffix for the first database only.

Splitting the URIs keeps the locked tenet — **the DB name rides in the URI path;
there is no separate DB-name env var** (`ADMIN_DB_NAME` stays cancelled) — while
making each URI honestly _single-database_, which is exactly where DB-in-the-path is
the correct idiom. All name-resolution logic disappears: no const map, no tier
derivation from `VERCEL_ENV`, no parsing.

## The two-layer safety argument

Two **independent** layers now cover both failure modes:

| Failure                                                         | Caught by                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Tier** mix-up (prod names meet non-prod creds, or vice versa) | the Atlas grant — the user cannot reach the other tier's database |
| **Role** mix-up (URIs swapped; content code reaches PII)        | the Atlas grant **and** the in-code name assertion                |

The role axis is the upgrade. Under the previous shared user — which held
`readWrite` on **both** databases — MongoDB _permitted_ a cross-wiring, so only code
could catch it. Now a swapped URI fails at the credential _and_ at the assertion.

**No single credential the admin app holds can reach both databases.** A leaked
`MONGODB_URI` exposes only `ministry-admin`; a leaked `WEBSITE_MONGODB_URI` exposes
only `website`. Blast radius halved. `apps/web` still never receives any grant on
`ministry-admin*`.

## Code shape

`src/service/database.service.ts`:

```

getAdminDb() -> adminClient.db() -> assert /^ministry-admin(-staging)?$/
getContentDb() -> websiteClient.db() -> assert /^website(-staging)?$/

```

- **Two cached clients**, each built by a closure that binds **exactly one** env var
  name — so no accessor can read the other's connection string. Each mirrors the
  shipped caching pattern: a distinct `globalThis` dev-HMR key
  (`_adminMongoClient` / `_websiteMongoClient`), `maxPoolSize: 10`, `serverApi` v1 strict.
- **Positive allowlists, not denylists.** Reserved Mongo system databases
  (`test`/`admin`/`local`/`config`) and the other tier's databases are rejected for
  free by matching neither pattern.
- **Assertions are unmemoized** (one anchored regex) so a dev-mode HMR client swap
  can never bypass them.
- **Throwing is the deliberate functional-first exception**: a misconfigured database
  is a _deployment defect_, not a branchable outcome. Plain `Error` naming the
  offending database; no `Error` subclass.
- `connect()` warms the **admin** client only. The driver connects lazily on first
  operation, so the content client needs no warmup; a twin would be speculative.

## Fail-closed behavior

| Condition                        | Behavior                                                                  |
| -------------------------------- | ------------------------------------------------------------------------- |
| Either variable unset            | throws naming the missing variable                                        |
| URI has no path database         | `client.db()` resolves `test` → assertion throws naming `test`            |
| URIs swapped                     | assertion throws naming the offending database; the grant would also deny |
| Reserved system database in path | assertion throws (matches neither allowlist)                              |
| Connection failure               | `connect()` logs and returns `undefined`                                  |

### Driver facts (verified against installed `mongodb@6.21.0`)

- `connection_string.js:302–310` — the driver copies the path database into
  `credentials.source` **only** when a path database is present _and_ `authSource` is
  absent. Because both URIs set `authSource=admin` explicitly, the path is **never**
  used as the auth source; auth targets `admin`, where Atlas users live.
- `connection_string.js:323–326` — `dbName` defaults to `test` when the URI has no
  path database. This is precisely why a missing path fails closed: `test` matches
  neither allowlist.

## Operational notes

- **Two connection pools** (2 × `maxPoolSize` 10 = 20 from admin) — trivial against
  the M0 500-connection cap. Related: ICR-157 caps the web side.
- **No cross-database transaction** is possible with two clients. Not a regression
  (cross-DB `$lookup`/`$unionWith` never worked), and coupling a PII write to a
  content write is exactly what the sensitivity split exists to prevent — treat it as
  a property, not a limitation.
- **Local development.** Point both URIs at the `-staging` databases. Local must
  never reach production data; the staging users cannot, so this is enforced rather
  than merely conventional.
- **Shared `website` user.** `apps/web` and `apps/admin` use the same website
  credential. Accepted: it is already single-database-scoped, so the meaningful
  boundary (`website` vs `ministry-admin`) is unaffected. A dedicated admin-side
  website user remains a future hardening option if independent revocation is wanted.

> **Provisioning is human-only and tracked on ICR-141**: re-scope the admin users to a
> single grant each (no `website` grant), and set `WEBSITE_MONGODB_URI` in all three
> admin Vercel environments with its path database matching the tier.

**Secret hygiene:** variable **names** only — never paste a real connection string
into docs, commits, or PRs.

Design record: `tasks/specs/ICR-166-admin-per-db-connection-strings.md`.
