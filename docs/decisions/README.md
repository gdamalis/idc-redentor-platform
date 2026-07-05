# Decisions (ADRs)

Architecture Decision Records capture a **choice** and why it was made, so a future reader (human or agent) understands the *why* without digging through git history.

- One file per decision, named `NNN-short-title.md` (zero-padded, incrementing — e.g. `001-contentful-read-only.md`).
- Each ADR has four sections: **Context** (the forces at play), **Decision** (what we chose), **Consequences** (the tradeoffs we accepted), and **Status** (`accepted`, or `superseded-by-NNN`).
- Keep it under a page. An ADR records the decision, not the full design.
- Big design work still goes to [`../superpowers/specs/`](../superpowers/); the ADR just points at it and records the choice.
