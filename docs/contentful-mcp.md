# Contentful MCP server

Claude Code agents talk to Contentful through the **official Contentful MCP server**, so they
can read the content model and (safely) make content changes. On this setup it's registered
**inline in the developer's local Claude Code config** (`~/.claude.json`), the same way the
other MCP servers on this machine (trello, mongodb, …) are registered — no env-var ritual,
works in every directory including git worktrees.

> This is a **tooling/agent capability**, not part of the Next.js app. The website itself
> still reads content through the GraphQL Delivery API (`lib/contentful/fetch.ts`); see
> `docs/contentful-data-layer.md`. The MCP server is a parallel, agent-only path.

## Why the local server (not the remote one)

Contentful ships two MCP servers that expose the **same toolset**. The difference is auth:

|                              | Remote (`mcp.contentful.com/mcp`)                   | **Local (`@contentful/mcp-server`)** ✅ |
| ---------------------------- | --------------------------------------------------- | --------------------------------------- |
| Auth                         | OAuth 2.1, **interactive sign-in per session**      | CMA personal access token               |
| Prereq                       | Admin installs a "Contentful MCP" app per space/env | Just a token + space id                 |
| Headless / background agents | ❌ OAuth can't complete in cron/background runs     | ✅ static token works everywhere        |
| Write gating                 | App allow-list (per env)                            | `PROTECTED_ENVIRONMENTS` env var        |

This is an **agent harness**: subagents run in isolated worktrees and some run in the
background, where interactive OAuth cannot complete. The token-based local server gives every
agent the same reliable access, so we use it.

## What it can do

The server exposes the full Contentful Management API surface, including:
`get_initial_context`, content types (`list/get/create/update/publish/.../delete_content_type`),
entries (`search_entries`, `semantic_search`, `get/create/update/publish/delete_entry`, snapshots),
assets (`upload/list/get/update/publish/delete_asset`), spaces & environments
(`list_spaces`, `list/create/delete_environment`), locales, tags, editor interfaces, taxonomy,
and AI Actions.

## Safety model: work environment + protected master

The agents write to a **non-production Contentful environment**, never to the live site directly.
Production is the `master` **alias**; agents work in a **work environment** and a human promotes (applies
the change to prod, or re-points the alias). Two guardrails in the server's env:

- `ENVIRONMENT_ID=<work env>` — every tool call defaults to the current **work** environment: the
  permanent **`staging`** for everyday model changes, or a versioned clone `master-<major>.<minor>.<patch>`
  (e.g. `master-1.0.0`) for a big breaking change (the two lanes in `docs/contentful-environments.md`).
  Agents iterate there. (Historically this was a single static `agent-sandbox`, now retired.)
- `PROTECTED_ENVIRONMENTS=master` — a backstop: even if a call explicitly targets the `master`
  alias, the server blocks all write/delete operations on it. (Also list the current production env
  id when it differs from the alias target, so a just-promoted env can't be written before reclone.)

A human reviews and **promotes the work env → production** when the changes look right — by applying the
tested migration to prod (default lane) or re-pointing the `master` alias (heavy lane). This mirrors the
harness ethos elsewhere in this repo: agents propose, a human promotes to production.

## Contentful model-change workflow (two lanes)

Model changes (a new/changed/deleted content type or field, or an entry remap) run in a work env, then a
human promotes. **Default lane:** a permanent **`staging`** env (granted on the API keys once), promoted
via Contentful **Merge** and/or the committed scripts. **Heavy lane** (big breaking changes): a versioned
env (`master-<major>.<minor>.<patch>`) + a **human alias re-point** for an atomic, instantly-reversible
cutover. The free tier allows only **one** work env beyond the `master` alias target, so the two lanes
share that slot (one at a time).

The full runbook — the semver bump rule (**major** = breaking/significant, **minor** = new/additive,
**patch** = fix), the per-cycle config touch points (MCP `ENVIRONMENT_ID`, `.env.local`
`CONTENTFUL_ENVIRONMENT`, branch-scoped Vercel Preview), and the cutover/rollback — lives in
**[`docs/contentful-environments.md`](./contentful-environments.md)** (machine-readable wiring in
`.claude/config.json` → `contentful`). **Keep this server's `ENVIRONMENT_ID` pointed at the _current_
work env each cycle.** The alias re-point is **never** done by an agent — it is a human promotion.

## Setup (recommended: inline, local, no ritual)

1. **Mint a CMA personal access token.** Contentful → **Settings → API keys → Content
   Management Tokens** (Personal Access Tokens) → _Create_. This is a **different** token from
   the Delivery/Preview tokens the app already uses. Store it in your gitignored `.env.local`
   as `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` (`.env.example` documents it). Treat it as a secret.

2. **Create the work environment.** Contentful → **Settings → Environments → Add
   environment**, name it per the semver scheme (`master-<major>.<minor>.<patch>`, e.g.
   `master-1.0.0`), **clone from current production** (the `master` alias target). (Or, once the
   MCP is connected, an agent can call `create_environment`.) See
   [`docs/contentful-environments.md`](./contentful-environments.md) for the bump rule + the
   two-environment cycle.

3. **Register the server in your local Claude Code config**, baking the values in from
   `.env.local` so the secret lives only on your machine (never in git, never in shell history
   as plaintext — the `$VARS` are expanded by your shell, not typed):

   ```sh
   set -a; source .env.local; set +a
   claude mcp add contentful -s user \
     -e CONTENTFUL_MANAGEMENT_ACCESS_TOKEN="$CONTENTFUL_MANAGEMENT_ACCESS_TOKEN" \
     -e SPACE_ID="$CONTENTFUL_SPACE_ID" \
     -e ENVIRONMENT_ID=master-1.0.0 \
     -e PROTECTED_ENVIRONMENTS=master \
     -- npx -y @contentful/mcp-server
   ```

   `ENVIRONMENT_ID` is the **current work env** (`master-<major>.<minor>.<patch>`) — re-run this
   `claude mcp add` (and fully restart) to re-point it at the new work env at the start of each
   model-change cycle. `PROTECTED_ENVIRONMENTS=master` keeps the production alias write-protected.

   This writes a resolved (inline) entry to `~/.claude.json`. No env vars are needed at launch
   afterward, and it applies in every project directory and worktree — matching how the other
   MCP servers on this machine are configured. (Use `-s local` instead of `-s user` to scope it
   to this project only; note `-s local` is keyed to the directory, so it won't carry across
   worktrees.)

4. **Fully restart Claude Code** (quit and relaunch — `/reload-plugins` and reconnecting the
   MCP server are **not** enough; the config/env is read once at process startup). Verify with
   `/mcp` (or `claude mcp list`), then functionally check with `list_spaces` /
   `list_content_types`.

## Alternative: committed `.mcp.json` for a team / CI

If this needs to be **shared via the repo** (multiple contributors, CI), use a project-scoped
`.mcp.json` at the repo root with `${VAR}` placeholders instead of inline secrets:

```json
{
  "mcpServers": {
    "contentful": {
      "command": "npx",
      "args": ["-y", "@contentful/mcp-server"],
      "env": {
        "CONTENTFUL_MANAGEMENT_ACCESS_TOKEN": "${CONTENTFUL_MANAGEMENT_ACCESS_TOKEN}",
        "SPACE_ID": "${CONTENTFUL_SPACE_ID}",
        "ENVIRONMENT_ID": "master-1.0.0",
        "PROTECTED_ENVIRONMENTS": "master"
      }
    }
  }
}
```

Claude Code expands `${VAR}` from the **launching shell's** environment (it does not auto-load
`.env.local`), so each dev must export the vars before starting `claude` — most ergonomically
with **direnv** (a gitignored `.envrc` that sources `.env.local`). **Precedence caveat:** a
committed `.mcp.json` (project scope) **outranks** a `~/.claude.json` user-scope entry of the
same name and is not merged with it — so don't keep both a committed `.mcp.json` and an inline
`-s user` entry named `contentful`, or the committed one will shadow your inline token. Pick one.

## Troubleshooting

**`401 — The access token you sent could not be found or is invalid`, and the request header
shows `Authorization: Bearer ${CONTENTFUL_MANAGEMENT_ACCESS_TOKEN}` (or `get_initial_context`
reports `Space ID: ${CONTENTFUL_SPACE_ID}`).** A `${...}` placeholder reached the server
**unexpanded** — i.e. you're on the committed-`.mcp.json` path and the env var wasn't set in
the shell that launched `claude`. Fix: either switch to the inline setup above, or export the
vars and **fully restart** `claude`.

## Region

This space is on Contentful's **Global** region (`graphql.contentful.com`), so the server's
default host (`api.contentful.com`) is correct — no `CONTENTFUL_HOST` override needed. If the
space is ever migrated to EU, add `-e CONTENTFUL_HOST=api.eu.contentful.com` to the server.

## Secret hygiene

The token is **never committed**: the inline setup stores it only in `~/.claude.json` on the
developer's machine, and `.env*` is gitignored. Only the variable _name_ appears in the repo.
