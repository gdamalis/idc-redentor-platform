# IDC Redentor — Docs

Canonical documentation for the IDC Redentor website, organized per the Divine Lab **scribe** standard. Plain Markdown with relative links, readable by both agents and the Obsidian vault.

- **[product/](./product/README.md)** — the product brain: what the site is, who it serves, and the IN/OUT/DEFERRED scope filter. The `yoke:product-manager` agent grooms against this.
- **[architecture/](./architecture/)** — system docs: how the platform works and why (App Router structure, the MongoDB + Vercel Blob + Ministry Admin content platform, public writes, i18n, forms/email, SEO, the agent harness, and the `/predica` sermon pipeline). Full platform architecture documentation lives in Linear project documents going forward.
- **[decisions/](./decisions/README.md)** — Architecture Decision Records (ADRs): one short file per decision, `NNN-short-title.md`.
- **[superpowers/](./superpowers/)** — `specs/` (brainstorm output, `YYYY-MM-DD-<topic>-design.md`) and `plans/` (implementation plans). Dated, historical.

See [`../CLAUDE.md`](../CLAUDE.md) for the annotated engineering-doc index and project conventions.
