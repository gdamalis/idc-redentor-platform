# ICR-39 — i18n: Translate remaining hardcoded UI strings

**Type:** Bug (`fix`) · **Priority:** Highest · **Parent epic:** ICR-11 (Internationalization) · **Component:** Website
**Branch:** `fix/ICR-39-i18n-hardcoded-ui-strings` · **QA depth:** standard · **QA type:** ui
**Jira:** https://divinelab.atlassian.net/browse/ICR-39

> All app paths are under `apps/web/`.

## Goal

Finish the bilingual mandate: three blog-post client/RSC components still ship hardcoded English strings and `aria-label`s, bypassing the "every user-facing string exists in **both** locale files" rule. Extract them into next-intl keys present in both `es-AR.json` and `en-US.json`.

## Scope decisions (locked during brainstorm)

1. **Namespace:** one new flat **`BlogPostActions`** namespace (kebab keys), grouping all three components — mirrors the per-feature convention (`ContactForm`, `Blog`, `Sermons`).
2. **Share labels:** translate **Copy link** and **Email**; `Facebook`/`WhatsApp`/`X` stay literal (brand names).
3. **Close:** the dialog's `aria-label="Close"` (ShareButton L238) **is in scope** → `close`.
4. **`contactFormAction`:** **already satisfied on `main`** (ICR-49 — `handleContactFormSubmission` returns `CONTACT_FORM_KEYS.*`; both locale files carry the full `ContactForm` namespace). **No code change**; noted in the PR.

## Dependencies Check (all present on `origin/main`)

- next-intl client hook `useTranslations` (from `next-intl`) — works in client components; `NextIntlClientProvider` is wired in `apps/web/src/app/[locale]/layout.tsx`.
- next-intl server helper `getTranslations` (from `next-intl/server`) — used by RSC pages (e.g. `apps/web/src/app/[locale]/blog/page.tsx`).
- `apps/web/public/locales/{es-AR,en-US}.json` — existing per-feature namespaces.
- `KeywordTags` parent `apps/web/src/components/features/blog-post-details/BlogPostContent.tsx` is an **RSC** (no `"use client"`), so an `async` `KeywordTags` is safe.

## Requirements

### R1 — `BlogPostActions` namespace keys (both locale files)

Add this block to **both** `apps/web/public/locales/es-AR.json` and `apps/web/public/locales/en-US.json`. **Key names and copy are LOCKED — do not rename keys or alter the Spanish copy (accents matter).**

| Key                | es-AR (`es-AR.json`)             | en-US (`en-US.json`)       | Used by                                           |
| ------------------ | -------------------------------- | -------------------------- | ------------------------------------------------- |
| `share-this-post`  | `Compartir este artículo`        | `Share this post`          | ShareButton: trigger `aria-label` + `DialogTitle` |
| `copy-link`        | `Copiar enlace`                  | `Copy link`                | ShareButton: share-option label                   |
| `email`            | `Correo`                         | `Email`                    | ShareButton: share-option label                   |
| `link-copied`      | `Enlace copiado al portapapeles` | `Link copied to clipboard` | ShareButton: copy toast                           |
| `close`            | `Cerrar`                         | `Close`                    | ShareButton: dialog close `aria-label`            |
| `like-this-post`   | `Me gusta este artículo`         | `Like this post`           | LikeButton: `aria-label` (not yet liked)          |
| `unlike-this-post` | `Ya no me gusta este artículo`   | `Unlike this post`         | LikeButton: `aria-label` (liked)                  |
| `tags`             | `Etiquetas`                      | `Tags`                     | KeywordTags: heading                              |

> es-AR uses **"artículo"** for blog posts (matches existing `BlogPost.more-posts` = "Otros artículos", `Blog` copy). Keep that term, not "publicación"/"post".

Namespace block to insert (place after the existing `ContactForm` block, before the closing `}`):

```jsonc
"BlogPostActions": {
  "share-this-post": "...",
  "copy-link": "...",
  "email": "...",
  "link-copied": "...",
  "close": "...",
  "like-this-post": "...",
  "unlike-this-post": "...",
  "tags": "..."
}
```

### R2 — `ShareButton.tsx` (client)

`apps/web/src/components/features/blog-post-details/ShareButton.tsx`

- Import `useTranslations` from `next-intl` (already imports `useLocale` from `next-intl`).
- Inside the component: `const t = useTranslations("BlogPostActions");`.
- Replace:
  - L198 trigger `aria-label="Share this post"` → `aria-label={t("share-this-post")}`
  - L232 `<DialogTitle>Share this post</DialogTitle>` → `{t("share-this-post")}`
  - L238 close button `aria-label="Close"` → `aria-label={t("close")}`
  - L166 + L177 `toast({ title: "Link copied to clipboard" })` → `toast({ title: t("link-copied") })`
- **`SHARE_OPTIONS` labels** (module-level `const` outside the component, so `t` is not in scope there): keep the `const` array's `label` field as the **English fallback / stable id text**, and translate at render time via a per-id lookup. Approach: introduce a small map keyed by `option.id` for the two translatable labels and fall back to the literal `label` for brand names. Render site (L281):
  - Replace `{option.label}` with a resolver, e.g. `{shareOptionLabel(option.id, option.label, t)}` where the helper returns `t("copy-link")` for `copy_link`, `t("email")` for `email`, and `option.label` otherwise.
  - The helper lives in the same file (file-local, below the component or as a small pure function). Do **not** make `SHARE_OPTIONS` dynamic — keep `.map()` iterating the static array; only the rendered text is translated.

### R3 — `LikeButton.tsx` (client)

`apps/web/src/components/features/blog-post-details/LikeButton.tsx`

- Import `useTranslations` from `next-intl`.
- `const t = useTranslations("BlogPostActions");`.
- L87 `aria-label={hasLiked ? "Unlike this post" : "Like this post"}` → `aria-label={hasLiked ? t("unlike-this-post") : t("like-this-post")}`.

### R4 — `KeywordTags.tsx` (RSC → async)

`apps/web/src/components/features/blog-post-details/KeywordTags.tsx`

- Import `getTranslations` from `next-intl/server`.
- Make the component `async`: `export async function KeywordTags({ keywords }: KeywordTagsProps) {`.
- `const t = await getTranslations("BlogPostActions");`.
- L24 `Tags` heading text → `{t("tags")}`.
- No change to props or to the parent `BlogPostContent.tsx` (it's an RSC; awaiting an async child component is supported).

## Data Model Changes

None. No Contentful content-model change (read-side only — and not even that: this is locale-file + component string work). **Contentful model-change gate (§8.2): N/A.** No MongoDB change.

## API Changes

None. No route handler, Server Action contract, or Zod schema changes. (`contactFormAction` is unchanged — already i18n'd by ICR-49.)

## New Files / Modified Files

| File                                                                 | Change                                                                                                                           |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/public/locales/es-AR.json`                                 | Add `BlogPostActions` namespace (8 keys, es-AR copy)                                                                             |
| `apps/web/public/locales/en-US.json`                                 | Add `BlogPostActions` namespace (8 keys, en-US copy)                                                                             |
| `apps/web/src/components/features/blog-post-details/ShareButton.tsx` | `useTranslations("BlogPostActions")`; translate aria-label, dialog title, close label, copy toast, Copy-link/Email option labels |
| `apps/web/src/components/features/blog-post-details/LikeButton.tsx`  | `useTranslations("BlogPostActions")`; translate like/unlike aria-label                                                           |
| `apps/web/src/components/features/blog-post-details/KeywordTags.tsx` | make `async`; `getTranslations("BlogPostActions")`; translate "Tags" heading                                                     |

No new files. (No typed message-key map like `CONTACT_FORM_KEYS` — that pattern exists because the **server action returns keys as data**; pure client/RSC components using `useTranslations`/`getTranslations` directly is the idiomatic next-intl pattern and avoids over-engineering for 8 strings.)

## Component Hierarchy (unchanged)

```
BlogPostContent (RSC)
├── FeaturedImage
├── <rich text>
└── KeywordTags (RSC → async)        ← R4
blog post detail page (RSC)
└── ... action bar
    ├── LikeButton ("use client")    ← R3
    └── ShareButton ("use client")   ← R2  (Dialog + SHARE_OPTIONS grid)
```

## Edge Cases

1. **Native share path (mobile):** when `navigator.share` exists, ShareButton returns only the trigger button — its `aria-label` must still be translated (covered by L198 change). The dialog/SHARE_OPTIONS code isn't rendered there, but the keys are harmless.
2. **Copy fallback path:** the `document.execCommand("copy")` fallback (older browsers) also fires the `link-copied` toast (L177) — both call sites must use `t("link-copied")`.
3. **Brand labels:** `Facebook`/`WhatsApp`/`X` must remain literal in both locales (no key). Only `copy_link` and `email` ids resolve to a translation.
4. **Missing key safety:** next-intl throws on a missing key in dev/build — `pnpm build` (verify) will fail loudly if any of the 8 keys is absent from either file, which is the desired guard.
5. **es-AR copy fidelity:** accents (`artículo`, `Etiquetas`) and exact wording are part of the AC; do not "tidy" them.

## i18n

- New namespace `BlogPostActions` in `public/locales/es-AR.json` (default) **and** `en-US.json` — both required (the whole point of the ticket). Keys + copy per R1.
- No routing/middleware change.

## Testing Strategy

- **Vitest unit (new):** add a small test asserting **locale-file parity for the `BlogPostActions` namespace** — both files contain all 8 keys with identical key sets and non-empty values. This is the meaningful, regression-catching test (it fails if a future edit drops a key from one file). Place near existing locale/i18n tests (e.g. alongside `src/i18n/*` tests or a `public/locales` parity test if one exists; otherwise a focused new test under `src/i18n/`). Reuse any existing parity helper if present.
  - Do **not** snapshot-test the components or assert exact translated strings in a brittle way beyond key presence/parity.
- **Manual smoke (QA, preview):** blog post detail page in **both** locales — verify Share dialog title + Copy-link/Email labels + copy toast, Like/Unlike aria-label, Tags heading all render translated. (QA type `ui`, depth standard.)
- **Verify stack (depth standard):** `pnpm type-check` + `pnpm lint` + `pnpm test` + `pnpm build`. `build` is the real guard for the async-RSC change and for missing-key errors.

## Implementation Checkpoints

### CP1 — Locale keys + parity test

- **Files:** `apps/web/public/locales/es-AR.json`, `apps/web/public/locales/en-US.json`, + new/updated Vitest parity test.
- **Do:** add the `BlogPostActions` namespace (R1) to both files; add the parity unit test (Testing Strategy).
- **Verify:** `pnpm test` (parity test passes), `pnpm type-check`, `pnpm lint`.
- **Commit:** `fix(ICR-39): add BlogPostActions i18n keys + locale parity test`

### CP2 — Wire the three components to the keys

- **Files:** `ShareButton.tsx` (R2), `LikeButton.tsx` (R3), `KeywordTags.tsx` (R4).
- **Do:** replace all hardcoded strings/aria-labels with `t(...)` / `await getTranslations(...)` calls per R2–R4.
- **Verify:** `pnpm type-check` + `pnpm lint` + `pnpm test` + `pnpm build` (build confirms async-RSC + no missing keys).
- **Commit:** `fix(ICR-39): translate ShareButton, LikeButton, KeywordTags via BlogPostActions`

> Two checkpoints (≤8 ✓). CP1 lands keys first so CP2's `t(...)` calls resolve and `build` stays green.

## Open Questions

None — all four scope decisions are locked (see "Scope decisions"). `KeywordTags`-as-prop alternative was rejected in favor of the self-contained `async` RSC (no parent API change).

## Sensitive areas

- **i18n-messages** — both locale files get new keys (parity test guards regressions).
- No email/PII/Mongo/CSP/secret surface touched (contactFormAction unchanged; LikeButton/ShareButton logic untouched — only display strings).
