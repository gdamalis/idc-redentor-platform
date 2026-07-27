# IDC Redentor · Design System — artifact bundle

This directory is the **repo-tracked source** for the ICR-18 design system: static, self-contained
HTML artifacts (foundations, primitives, screens) that a human or agent uploads to a dedicated
**claude.ai/design** project.

## Hand-authored, not auto-synced

These artifacts are **hand-authored** — written and reviewed here, in the repo, before publishing.
This is different from the existing **"IDC Redentor"** Claude Design project, which is an
**auto-synced mirror** of `apps/web` component code (a machine-generated hash-keyed reflection of the
website's UI). That project is **read-only** from this ticket's point of view: nothing in ICR-18
writes to it, and nothing here should ever be confused with it.

The target project for this bundle is a **new** project named:

```
IDC Redentor · Design System
```

of type `PROJECT_TYPE_DESIGN_SYSTEM`.

## What lives here

| Path                   | Contents                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `styles.css`           | The shared token palette (verbatim from `packages/ui/src/tokens.css`) plus the primitive/shell CSS classes every artifact composes |
| `verify-artifacts.mjs` | The quality-bar + light/dark checker — must `PASS` before any upload                                                               |
| `foundations/`         | One artifact: colour tokens, type ramp, spacing, radius scale                                                                      |
| `primitives/`          | One variant-grid artifact per primitive (14 total)                                                                                 |
| `screens/`             | One artifact per MVP screen (7 total)                                                                                              |

## Upload procedure

Publishing is **not** something the implementer does — the `divinelab:implementer` agent has no
`DesignSync` tool. The **orchestrator** performs the upload, in this order:

1. `DesignSync list_projects` — reuse **"IDC Redentor · Design System"** if it already exists; never
   create a duplicate.
2. `DesignSync get_project` — confirm `type` is `PROJECT_TYPE_DESIGN_SYSTEM` (immutable at creation).
3. `DesignSync finalize_plan` with `localDir` = this directory and `writes` covering `styles.css`,
   `README.md`, `foundations/**`, `primitives/**`, `screens/**`.
4. `DesignSync write_files` with a `localPath` entry per file.
5. Verify by **readback** — `DesignSync list_files` + `get_file` on every uploaded path — never by
   inferring success from `write_files` returning OK.

## Before any upload

```bash
cd tasks/specs/design-system
node verify-artifacts.mjs
```

Must print `PASS`. If it fails, fix the artifact — never weaken the checker to make it pass.
