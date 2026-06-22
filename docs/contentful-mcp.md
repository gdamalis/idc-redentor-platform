# Contentful MCP server

This repo registers the **official Contentful MCP server** so Claude Code agents can read
the Contentful content model and (safely) make content changes. It is wired in the
project-scoped [`.mcp.json`](../.mcp.json) at the repo root and is available to every agent
that runs in this repo — foreground, background, or worktree-isolated.

> This is a **tooling/agent capability**, not part of the Next.js app. The website itself
> still reads content through the GraphQL Delivery API (`lib/contentful/fetch.ts`); see
> `docs/contentful-data-layer.md`. The MCP server is a parallel, agent-only path.

## Why the local server (not the remote one)

Contentful ships two MCP servers that expose the **same toolset**. The difference is auth,
and that is what decided it for this repo:

|                              | Remote (`mcp.contentful.com/mcp`)                   | **Local (`@contentful/mcp-server`)** ✅ |
| ---------------------------- | --------------------------------------------------- | --------------------------------------- |
| Auth                         | OAuth 2.1, **interactive sign-in per session**      | CMA personal access token (env var)     |
| Prereq                       | Admin installs a "Contentful MCP" app per space/env | Just a token + space id                 |
| Headless / background agents | ❌ OAuth can't complete in cron/background runs     | ✅ static token works everywhere        |
| Write gating                 | App allow-list (per env)                            | `PROTECTED_ENVIRONMENTS` env var        |

This is an **agent harness**: subagents run in isolated worktrees and some run in the
background, where interactive OAuth cannot complete. The token-based local server gives
every agent the same reliable access, so we use it.

## What it can do

The server exposes the full Contentful Management API surface, including:
`get_initial_context`, content types (`list/get/create/update/publish/.../delete_content_type`),
entries (`search_entries`, `semantic_search`, `get/create/update/publish/delete_entry`, snapshots),
assets (`upload/list/get/update/publish/delete_asset`), spaces & environments
(`list_spaces`, `list/create/delete_environment`), locales, tags, editor interfaces, taxonomy,
and AI Actions.

## Safety model: sandbox environment + protected master

The agents are configured to write to a **non-master Contentful environment**, never to the
live site directly. Two guardrails in `.mcp.json`:

- `ENVIRONMENT_ID=agent-sandbox` — every tool call defaults to the `agent-sandbox`
  environment (a branch of `master`). Agents iterate there.
- `PROTECTED_ENVIRONMENTS=master` — a backstop: even if a call explicitly targets `master`,
  the server blocks all write/delete operations on it.

A human reviews and **merges `agent-sandbox` → `master`** in the Contentful web app when the
changes look right. This mirrors the harness ethos elsewhere in this repo: agents propose,
a human promotes to production (the same way a human merges every PR and moves every Trello
card to Done).

> Rename `agent-sandbox` to taste — just keep `.mcp.json`'s `ENVIRONMENT_ID` and the actual
> Contentful environment name in sync.

## One-time setup

1. **Mint a CMA personal access token.** Contentful → **Settings → API keys → Content
   Management Tokens** (Personal Access Tokens) → _Create_. This is a **different** token
   from the Delivery/Preview tokens the app already uses. Treat it as a secret.

2. **Create the sandbox environment.** Contentful → **Settings → Environments → Add
   environment**, name it `agent-sandbox`, and **clone from `master`**. (Alternatively, once
   the MCP is connected, an agent can call `create_environment`.)

3. **Export the two env vars** into the shell that launches Claude Code — `.mcp.json`
   expands `${...}` from the _process_ environment, and the repo `.env` is not auto-loaded
   into it. Easiest:

   ```sh
   set -a; source .env; set +a   # then launch `claude` from the same shell
   ```

   The vars consumed:
   - `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` → server's `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN`
   - `CONTENTFUL_SPACE_ID` → server's `SPACE_ID` (reused from the app's existing env var)

   Add `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` to your local `.env` (gitignored). `.env.example`
   documents it.

4. **Restart Claude Code** in this repo and approve the `contentful` MCP server when prompted.
   Verify with `claude mcp list` (or `/mcp`) — `contentful` should show as connected. A quick
   functional check: ask an agent to `list_content_types`.

## Region

This space is on Contentful's **Global** region (`graphql.contentful.com`), so the server's
default host (`api.contentful.com`) is correct — no `CONTENTFUL_HOST` override needed. If the
space is ever migrated to EU, add `"CONTENTFUL_HOST": "api.eu.contentful.com"` to the server's
`env` block.

## Secret hygiene

The token is **never committed**: `.mcp.json` references `${CONTENTFUL_MANAGEMENT_ACCESS_TOKEN}`,
and `.env*` is gitignored. Only the variable _name_ appears in the repo.
