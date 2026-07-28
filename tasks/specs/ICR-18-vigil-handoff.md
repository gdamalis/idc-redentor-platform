# ICR-18 — vigil handoff (open findings + how to work here)

**Written 2026-07-27 at the end of a 5-round post-PR vigil.** Read this cold before touching anything.

> **2026-07-28 addendum (orchestrator):** the scope question below was resolved by the maintainer on
> 2026-07-27 — F1/F2 were brought **into** scope (D1/R9 amended in the spec §0/§3; fixed at source in
> `packages/ui/src/tokens.css`, commit aa421c8) and F3 was fixed in-PR (7993994). The OUT-OF-SCOPE
> labels below describe the pre-decision state and are kept for the record.

|                           |                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **PR**                    | [#112](https://github.com/gdamalis/idc-redentor-platform/pull/112) — ready for review (not draft)            |
| **Branch**                | `feat/ICR-18-design-system-website-admin`                                                                    |
| **Worktree**              | `/Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-18` — **work here, not the main checkout** |
| **Head at handoff**       | `0340aba63f3cb836ef1f296a2c600729993466b3`                                                                   |
| **Jira**                  | ICR-18 is **In Review**. Do **not** transition it. Done is human-only.                                       |
| **CI**                    | 6/6 green · `mergeable: CLEAN`                                                                               |
| **Claude Design project** | `IDC Redentor · Design System`, id `fbd80a16-b74b-4bf3-aaa9-1fb4345d9263`                                    |
| **Task**                  | Fix the 5 open findings below, then re-check.                                                                |

---

## ⚠️ READ THIS FIRST — the scope boundary that blocks 3 of the 5 findings

**ICR-18 is design-only by an explicit maintainer decision** taken at the design gate (decision **D1**
in `ICR-18-design-system-website-admin.md` §0). It ships **no production code**: `apps/web/**`,
`apps/admin/**`, `packages/**` are untouched. The entire ticket was scoped around that, and the PR body,
the QA evidence and the Jira comments all state it.

**Findings 1–3 below cannot be fixed without breaking that boundary**, because the offending values live
in `packages/ui/src/tokens.css` — the production palette, which predates this ticket. Do **not** quietly
edit it to make a reviewer's comment go away. Either:

- **(a)** ask Gabriel to widen ICR-18's scope to permit the token change, or
- **(b)** defer them to **ICR-37** (already enriched with this PR's target spec + a defect table), or the
  follow-up code ticket.

**Ask before assuming.** Getting this wrong silently converts a clean design-only PR into one that
changes the shared production palette.

Findings **4 and 5 are in scope** — both live under `tasks/specs/design-system/`.

---

## The 5 open findings

All five were verified against the code before handoff. The numbers below are reproduced, not quoted.

### 1. Destructive button pair fails WCAG AA (light) — OUT OF SCOPE

- **Thread:** `3660378508` · `tasks/specs/design-system/styles.css:610`
- **Verified:** `--destructive-foreground` (`210 40% 98%`) on `--destructive` (`0 84.2% 60.2%`) = **3.59:1**.
  Button text is 13.5px → AA needs 4.5:1.
- **Source:** `packages/ui/src/tokens.css:94-95` (light) — **production palette**.
- **Affects:** the destructive buttons in `Button.html` and `Dialog.html`.
- **Likely fix:** darken the light `--destructive` background, or introduce a dedicated
  foreground/background pair that clears 4.5:1.

### 2. `--destructive` is unsafe as small foreground text — OUT OF SCOPE

- **Thread:** `3660378512` · `styles.css:938`
- **Verified:** as text, `--destructive` gives **3.76:1** on light `--card`, and **1.79:1** on the dark
  background (dark token `0 62.8% 30.6%` on `222 47% 11%`). 12px text → AA needs 4.5:1.
- **1.79:1 is effectively unreadable.** This is the most serious of the three.
- **Affects:** field error messages, `.menu-item.destructive`.
- **Source:** production palette.
- **Likely fix:** a dedicated `--destructive-text` token pair. The reviewer's framing is correct —
  `--destructive` was designed as a _background_ token and was never a safe _foreground_ one.
- ⚠️ **Note on this one:** I initially computed the dark ratio as 4.76:1 and nearly reported the reviewer
  as wrong. I had paired the _light_ `--destructive` with a dark background. When checking a
  theme-dependent contrast claim, take **both** the foreground and the background from the **same**
  theme block.

### 3. Inactive badge fails AA (light) — OUT OF SCOPE

- **Thread:** `3660378517` · `styles.css:857`
- **Verified:** `--muted-foreground` (`215.4 16.3% 46.9%`) on `--muted` (`210 40% 96.1%`) = **4.34:1**.
  Badge text is 12px → needs 4.5:1. A near miss, but a miss.
- **Source:** `packages/ui/src/tokens.css:86-87` — production palette.
- **Likely fix:** a dedicated `--status-inactive-{fg,bg}` pair, mirroring what this PR already did for
  `--status-active-*` and `--status-occ-*` (see §3 of `docs/architecture/design-system.md`). That
  precedent makes this the most natural of the three to fix _inside_ the design system — the status
  tokens are already ICR-18's own derived additions, so adding a third pair arguably **is** in scope
  even though the current values come from production tokens. **Worth raising with Gabriel as the one
  of the three that may not need a scope change.**

### 4. The hit-target gate can't see native controls in markup — IN SCOPE

- **Thread:** `3660378522` · `tasks/specs/design-system/verify-artifacts.mjs:161`
- **Verified:** the gate discovers controls from **CSS** (`cursor: pointer`, plus bare `input` selectors),
  so a native `<button>`, `<select>`, `<textarea>` or link added to an artifact with no matching CSS rule
  is never checked. Reproduced directly: adding `<button>tiny</button>` to `Button.html` still reports
  `PASS`.
- **Why it matters:** this script is the committed regression gate for the ≥44px rule. Inferring the
  control inventory from styles means the gate's coverage silently depends on authors remembering to add
  a class.
- **Suggested shape:** scan each artifact's HTML for native interactive elements
  (`button`, `select`, `textarea`, `a[href]`, `input` excluding checkbox/radio) and assert each carries a
  class that resolves to a ≥44px floor in `styles.css` (or an explicit halo). A simpler first cut that
  still closes the hole: assert no native interactive element appears **without** a class, then rely on
  the existing per-selector floor check. Pick one and say which, with the tradeoff.

### 5. Pager hit-halos overlap by 8px — IN SCOPE, **fix this first**

- **Thread:** `3660378526` · `styles.css:177`
- **Verified arithmetic:** `.pager button` is `min-width: 30px`, `.pager` has `gap: 6px`, and
  `.pager button::before` is `inset: 0 -7px`. So the halo spans `30 + 2×7 = 44px` while the
  centre-to-centre pitch is only `30 + 6 = 36px` → **8px of overlap**. The later-painted sibling captures
  the overlapping strip, so edge clicks activate the **neighbouring page**.
- **This is a regression introduced by this vigil** — round 1's fix for the pager's width created it.
  It is the only one of the five where a fix made real-world behaviour _worse_ rather than merely failing
  to improve it. Hence: fix first.
- **Suggested fix, consistent with the precedent already set:** round 4 gave seven selectors an explicit
  `min-width: 44px` instead of a halo. Do the same here — `.pager button { min-width: 44px }` and
  **delete** `.pager button::before`. Pitch then becomes `44 + 6 = 50px` > 44px, so targets tile without
  overlap. **Measure it** rather than trusting the arithmetic (see the discipline notes below).
- **Then check the sibling cases**: `.icon-btn` (`inset: 0 -4px`) and `.kebab` (`inset: 0 -7px`) also use
  halos. Verify their real spacing doesn't overlap either — the kebab sits alone in a table cell so it is
  probably fine, but `.icon-btn` appears adjacent to other controls in the topbar. **The gate does not
  currently detect halo overlap at all**; consider adding that check while you're in there, since this
  class of bug has now shipped once.

---

## Recommended order of work

1. **F5** — in scope, a live regression, smallest fix.
2. **F4** — in scope, hardens the gate; do it after F5 so the new overlap check (if you add one) lands
   with the rest of the gate work.
3. **F3** — raise with Gabriel first; may be in scope via the existing `--status-*` precedent.
4. **F1, F2** — blocked on a scope decision. Default to deferring to ICR-37.

---

## How to work here — the discipline that has been finding real defects

This vigil ran 5 rounds. The reviewer found something real on **every** head, including two defects
inside the tooling built to catch its previous finding. These habits are why:

- **Verify every review claim against the code before implementing it.** The reviewer has been right
  5/5 on substance — but _two prescribed fixes from the orchestrator were wrong_, and both were caught
  by checking rather than complying.
- **Measure layout in a browser; do not reason about it.** `min-height: 44px` on `.th-sort` was
  prescribed as "aligning with the existing row". Measured, it inflated the header row from 41.75px to
  **68.5px** — a 64% regression — because `min-height` on an inline-flex span _adds_ to the `<th>`'s
  padding and row height is the max across cells. A uniform halo inset would likewise have overshot
  control height into adjacent table rows.
- **Mutation-prove every gate change.** Add the check _before_ the fix, watch it go RED naming the real
  defect, apply the fix, confirm PASS, then re-break it and confirm RED again. A gate never observed
  failing is decoration. Every gate rule currently in the file was proven this way.
- **Grep the twin — this run was bitten three times.** A stale claim is rarely in one file. The
  `@source` path was wrong in two architecture docs _and_ three spec files, including one belonging to
  a different, already-merged ticket.
- **The `@source` substring trap:** a plain `grep '\.\./\.\./\.\./packages/ui'` **also matches the
  correct four-level path**, so it reads as a false failure. Use a negative lookahead:
  `grep -rnP '(?<!\.\./)\.\./\.\./\.\./packages/ui' tasks/ docs/`
- **`git checkout -- <file>` wipes _all_ uncommitted work in that file**, not just your mutation. Use a
  targeted `Edit` to revert a mutation test. This bit an implementer once already.
- **Take both sides of a contrast pair from the same theme block.** See F2's note.
- **A sibling merge can invalidate your doc mid-run.** ICR-127 merged during this vigil and silently
  outdated four claims (`apps/admin` primitive count, the sign-in screen's greenfield status, the Google
  mark, and the i18n namespace shape). Re-check `main` each cycle.

---

## Commands

```bash
cd /Users/gabriel/repos/idc-redentor-platform/.claude/worktrees/ICR-18

node tasks/specs/design-system/verify-artifacts.mjs   # the gate: 22 artifacts + CSS checks
pnpm type-check && pnpm lint && pnpm test             # expect green, 799 tests
pnpm build
npx prettier --check <files you touched>              # NOT repo-wide: ~173 files are
                                                      # pre-existing unclean on main
```

**Test count is 799** (618 `@idcr/web` + 179 `@idcr/admin` + 2 `@idcr/ui`). A plain `pnpm test` often
prints only `@idcr/web`'s 618 because Turbo serves the others from cache — use `pnpm test --force` to
see all three lines. Do not "correct" 799 to 618.

**commitlint:** subject ≤100 chars **and every body line ≤100 chars**. Never write the literal skip-CI
token in a commit body — GitHub honours it in merge commits and would skip every workflow.

---

## Division of labour (structural, not a preference)

The `divinelab:implementer` agent has **no `DesignSync` tool** (Read/Edit/Write/Glob/Grep/Bash/Skill
only), so it **cannot publish to Claude Design**. Split every task:

| Actor        | Does                                                               |
| ------------ | ------------------------------------------------------------------ |
| implementer  | authors files, runs the gate until green, commits **and pushes**   |
| orchestrator | `DesignSync finalize_plan` → `write_files` → readback verification |

**Publishing (orchestrator only).** `planId` `plan_fbd80a16b74b4bf3_6e085a3fa401` already covers
`styles.css`, `README.md`, `foundations/**`, `primitives/**`, `screens/**`, so it can be reused —
`localDir` is `<worktree>/tasks/specs/design-system`.

⚠️ **The published project drifts if you forget this.** During the vigil, `styles.css` was fixed in the
repo across three commits without being re-published, so the actual deliverable fell behind. **Any change
to `styles.css` or an artifact must be re-published**, and since every artifact links `styles.css`, a
stylesheet change propagates to all 22. Verify by reading back (`list_files` + `get_file`), never by
trusting `write_files` returning OK.

---

## Already done — do not redo

- 22 artifacts published: foundations + 14 primitives + 7 screens (incl. the A4 print sheet, which is
  deliberately light-only — the gate enforces it has **no** `.dark` block).
- `docs/architecture/design-system.md` (the migration spec), indexed in **both** `CLAUDE.md` and
  `AGENTS.md`.
- `@source` corrected to four levels in 5 files.
- Hit targets: `.icon-btn`, `.kebab`, `.pager button`, `.seg button`, `.filter`, `.menu-item`,
  `.search input`, `.th-sort`, `.checkbox`, `.btn`, `.nav-item`, `.tab` — all floored or haloed.
- Status token contrast fixed light (Activo 3.664→**4.765:1**, Ocasional 3.811→**4.800:1**); dark pairs
  already passed (6.785, 6.456) and are commented so nobody "fixes" them.
- `main` merged in after ICR-127 landed; four doc claims refreshed.
- Gate rules: light+dark blocks, no `<script>`, `styles.css` link, `lang="es-AR"`, banned patterns
  (gradient/emoji/Inter/Roboto) on both HTML and CSS, two-axis hit targets, token inventory vs Foundations.
- Follow-ups filed: **ICR-37** enriched with the target spec + 6-item defect table; **ICR-183** created
  (To Do) for the stale `chore/design-sync` branch, which would revert 4 architecture docs if merged as-is.

---

## Re-check protocol after your fixes

1. Gate PASS + full stack green (`type-check`, `lint`, `test`, `build`) + prettier on touched files.
2. **Re-publish** any changed artifact or `styles.css`, then read back to confirm.
3. Reply **in-thread** to each finding you addressed:
   `gh api repos/gdamalis/idc-redentor-platform/pulls/112/comments/<id>/replies -f body="..."`
   State the fix and the measured result. No performative agreement, no thanks — the code shows it.
   For anything deferred on scope, say so explicitly and why, rather than leaving it silent.
4. Request one review round: `gh pr comment 112 --body "@codex review"`.
   **`claude[bot]` is waived** — silent across two cycles on two heads, zero activity; the app appears not
   to be installed. Don't wait on it or re-request it.
5. Post one status comment summarising the cycle.
6. **Never merge. Never transition Jira.** Both are human-only, and merge is triggered by Gabriel saying
   "merge" (which hands off to `/merge`).

## Addressed thread IDs — do not re-reply

`3659192457` `3659192461` `3659875651` `3660008975` `3660008980` `3660176441` `3660176446` `3660176452`

Open (this handoff's subject): `3660378508` `3660378512` `3660378517` `3660378522` `3660378526`
