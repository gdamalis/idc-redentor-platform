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

3. **Export the two env vars** into the shell that launches Claude Code — Claude Code expands
   `${...}` in `.mcp.json` **once, at startup**, reading only the launching shell's process
   environment. It does **not** auto-load the repo's dotenv file. This project keeps secrets in
   **`.env.local`** (Next.js convention), so:

   ```sh
   set -a; source .env.local; set +a   # then launch `claude` from THIS shell
   ```

   In a git **worktree**, `.env.local` is gitignored and not copied in — source the main
   checkout's copy by absolute path, e.g.
   `set -a; source /path/to/idc-redentor-website/.env.local; set +a`.

   The vars consumed:
   - `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` → server's `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN`
   - `CONTENTFUL_SPACE_ID` → server's `SPACE_ID` (reused from the app's existing env var)

   Add `CONTENTFUL_MANAGEMENT_ACCESS_TOKEN` to your local `.env.local` (gitignored).
   `.env.example` documents it. To avoid re-exporting every session, use **direnv** (commit a
   gitignored `.envrc` that sources `.env.local`) or add the exports to your shell profile.

4. **Fully restart Claude Code.** Quit the `claude` process entirely and relaunch it from the
   shell where you exported the vars — **`/reload-plugins` and reconnecting the MCP server are
   NOT enough**, because env expansion happens at process startup, so a running session keeps
   the old (unexpanded) values. After relaunch, approve the `contentful` server, verify with
   `/mcp` (or `claude mcp list`), and functionally check with `list_spaces` / `list_content_types`.

## Troubleshooting

**`401 — The access token you sent could not be found or is invalid`, and the request header
shows `Authorization: Bearer ${CONTENTFUL_MANAGEMENT_ACCESS_TOKEN}` (or `get_initial_context`
reports `Space ID: ${CONTENTFUL_SPACE_ID}`).** The `${...}` placeholder reached the server
**unexpanded** — the env var was not set in the shell that launched `claude`. Fix: export the
vars (step 3) and **fully restart** `claude` (step 4). Confirm they're live with
`echo $CONTENTFUL_SPACE_ID` in the launching shell before starting `claude`.

## Region

This space is on Contentful's **Global** region (`graphql.contentful.com`), so the server's
default host (`api.contentful.com`) is correct — no `CONTENTFUL_HOST` override needed. If the
space is ever migrated to EU, add `"CONTENTFUL_HOST": "api.eu.contentful.com"` to the server's
`env` block.

## Secret hygiene

The token is **never committed**: `.mcp.json` references `${CONTENTFUL_MANAGEMENT_ACCESS_TOKEN}`,
and `.env*` is gitignored. Only the variable _name_ appears in the repo.
