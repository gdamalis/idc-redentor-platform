# IDC Redentor — Docs

Canonical documentation for the IDC Redentor website, organized per the Divine Lab **scribe** standard. Plain Markdown with relative links, readable by both agents and the Obsidian vault.

- **[product/](./product/README.md)** — the product brain: what the site is, who it serves, and the IN/OUT/DEFERRED scope filter. The `divinelab:product-manager` agent grooms against this.
- **[architecture/](./architecture/)** — system docs: how the site works and why (App Router structure, the Contentful read path, the MongoDB writes, i18n, forms/email, SEO, the agent harness, and the `/predica` sermon pipeline).
- **[decisions/](./decisions/README.md)** — Architecture Decision Records (ADRs): one short file per decision, `NNN-short-title.md`.
- **[superpowers/](./superpowers/)** — `specs/` (brainstorm output, `YYYY-MM-DD-<topic>-design.md`) and `plans/` (implementation plans). Dated, historical.

See [`../CLAUDE.md`](../CLAUDE.md) for the annotated engineering-doc index and project conventions.
