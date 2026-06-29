# ICR-39 — i18n: Translate remaining hardcoded UI strings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implemented task-by-task via the `/work` harness's `implementer` subagent (TDD where meaningful). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the remaining hardcoded English strings + `aria-label`s in `ShareButton`, `LikeButton`, and `KeywordTags` into a new `BlogPostActions` next-intl namespace present in both locale files.

**Architecture:** Add one flat `BlogPostActions` namespace (8 kebab keys) to `es-AR.json` + `en-US.json`. Client components (`ShareButton`, `LikeButton`) consume it via `useTranslations("BlogPostActions")`; the RSC `KeywordTags` becomes `async` and uses `await getTranslations("BlogPostActions")`. `contactFormAction` is untouched (already i18n'd by ICR-49).

**Tech Stack:** Next.js 16 (App Router), next-intl, TypeScript (strict), Vitest (jsdom), Tailwind v4. pnpm. All app paths under `apps/web/`.

## Global Constraints

- **Locale parity is mandatory:** every new key exists in BOTH `apps/web/public/locales/es-AR.json` and `apps/web/public/locales/en-US.json`.
- **Key names + copy are LOCKED** (do not rename keys, do not "tidy" Spanish accents/wording). Exact values below.
- es-AR uses **"artículo"** for a blog post (matches existing copy).
- Default locale `es-AR`; secondary `en-US`.
- Conventional commits, header ≤ 100 chars, `fix(ICR-39): …`.
- Commands (run from repo root or `pnpm -C apps/web …`): `pnpm type-check` (hyphen), `pnpm lint`, `pnpm test` (= `vitest run`), `pnpm build`.

### Locked key table (`BlogPostActions`)

| Key                | es-AR                            | en-US                      |
| ------------------ | -------------------------------- | -------------------------- |
| `share-this-post`  | `Compartir este artículo`        | `Share this post`          |
| `copy-link`        | `Copiar enlace`                  | `Copy link`                |
| `email`            | `Correo`                         | `Email`                    |
| `link-copied`      | `Enlace copiado al portapapeles` | `Link copied to clipboard` |
| `close`            | `Cerrar`                         | `Close`                    |
| `like-this-post`   | `Me gusta este artículo`         | `Like this post`           |
| `unlike-this-post` | `Ya no me gusta este artículo`   | `Unlike this post`         |
| `tags`             | `Etiquetas`                      | `Tags`                     |

---

### Task 1 (CP1): `BlogPostActions` locale keys + parity test

**Files:**

- Create: `apps/web/src/i18n/blog-post-actions-i18n.test.ts`
- Modify: `apps/web/public/locales/es-AR.json` (add `BlogPostActions` block)
- Modify: `apps/web/public/locales/en-US.json` (add `BlogPostActions` block)

**Interfaces:**

- Produces: the `BlogPostActions` namespace with the 8 locked keys in both locale files. Task 2's `t("...")` / `getTranslations("BlogPostActions")` calls resolve against these.

- [ ] **Step 1: Write the failing parity test**

Create `apps/web/src/i18n/blog-post-actions-i18n.test.ts`. JSON import path mirrors `src/i18n/request.ts` (`../../public/locales/...`).

```ts
import { describe, it, expect } from "vitest";
import esAR from "../../public/locales/es-AR.json";
import enUS from "../../public/locales/en-US.json";

const EXPECTED_KEYS = [
  "share-this-post",
  "copy-link",
  "email",
  "link-copied",
  "close",
  "like-this-post",
  "unlike-this-post",
  "tags",
] as const;

type Messages = Record<string, Record<string, string>>;

describe("BlogPostActions i18n namespace", () => {
  const es = (esAR as Messages).BlogPostActions;
  const en = (enUS as Messages).BlogPostActions;

  it("exists in both locale files", () => {
    expect(es).toBeTypeOf("object");
    expect(en).toBeTypeOf("object");
  });

  it("contains exactly the expected keys in both locales", () => {
    expect(Object.keys(es ?? {}).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(Object.keys(en ?? {}).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("has identical key sets across locales (parity)", () => {
    expect(Object.keys(es ?? {}).sort()).toEqual(Object.keys(en ?? {}).sort());
  });

  it("has non-empty string values for every key in both locales", () => {
    for (const key of EXPECTED_KEYS) {
      expect(typeof es?.[key]).toBe("string");
      expect(es?.[key].trim().length).toBeGreaterThan(0);
      expect(typeof en?.[key]).toBe("string");
      expect(en?.[key].trim().length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test, verify it FAILS**

Run: `pnpm -C apps/web test -- blog-post-actions-i18n`
Expected: FAIL — `BlogPostActions` is undefined (namespace not added yet).

- [ ] **Step 3: Add the `BlogPostActions` block to `es-AR.json`**

In `apps/web/public/locales/es-AR.json`, after the closing `}` of the `ContactForm` block (the last block) add a comma and the new block, keeping it the last top-level entry:

```json
  "ContactForm": {
    "form-heading": "Enviános un mensaje",
    "error-required-fields": "Por favor completá todos los campos obligatorios.",
    "error-invalid-email": "Por favor ingresá una dirección de correo válida.",
    "success-message": "¡Tu mensaje fue enviado con éxito!",
    "error-save-failed": "No pudimos guardar tu mensaje. Por favor intentá de nuevo más tarde.",
    "error-unexpected": "Ocurrió un error inesperado. Por favor intentá de nuevo más tarde."
  },
  "BlogPostActions": {
    "share-this-post": "Compartir este artículo",
    "copy-link": "Copiar enlace",
    "email": "Correo",
    "link-copied": "Enlace copiado al portapapeles",
    "close": "Cerrar",
    "like-this-post": "Me gusta este artículo",
    "unlike-this-post": "Ya no me gusta este artículo",
    "tags": "Etiquetas"
  }
```

- [ ] **Step 4: Add the `BlogPostActions` block to `en-US.json`**

In `apps/web/public/locales/en-US.json`, same position (after `ContactForm`):

```json
  "ContactForm": {
    "form-heading": "Send us a Message",
    "error-required-fields": "Please fill in all required fields.",
    "error-invalid-email": "Please enter a valid email address.",
    "success-message": "Your message was sent successfully!",
    "error-save-failed": "Failed to save your message. Please try again later.",
    "error-unexpected": "An unexpected error occurred. Please try again later."
  },
  "BlogPostActions": {
    "share-this-post": "Share this post",
    "copy-link": "Copy link",
    "email": "Email",
    "link-copied": "Link copied to clipboard",
    "close": "Close",
    "like-this-post": "Like this post",
    "unlike-this-post": "Unlike this post",
    "tags": "Tags"
  }
```

- [ ] **Step 5: Run the test, verify it PASSES**

Run: `pnpm -C apps/web test -- blog-post-actions-i18n`
Expected: PASS (4 assertions green).

- [ ] **Step 6: type-check + lint + format the JSON**

Run: `pnpm -C apps/web type-check && pnpm -C apps/web lint`
Expected: clean. (If Prettier reorders/normalizes the JSON, accept it — run `pnpm -C apps/web format` if format:check is part of lint-staged.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/public/locales/es-AR.json apps/web/public/locales/en-US.json apps/web/src/i18n/blog-post-actions-i18n.test.ts
git commit -m "fix(ICR-39): add BlogPostActions i18n keys + locale parity test"
```

---

### Task 2 (CP2): Wire ShareButton, LikeButton, KeywordTags to the keys

**Files:**

- Modify: `apps/web/src/components/features/blog-post-details/ShareButton.tsx`
- Modify: `apps/web/src/components/features/blog-post-details/LikeButton.tsx`
- Modify: `apps/web/src/components/features/blog-post-details/KeywordTags.tsx`

**Interfaces:**

- Consumes: `BlogPostActions` namespace keys from Task 1.
- Produces: no exported API change. `KeywordTags` becomes `async` (same props `{ keywords: string[] }`).

> No new unit test in this task: the change is declarative string substitution (no branching logic added). The meaningful guards are (a) the Task 1 parity test, (b) `pnpm build` — next-intl throws on a missing key at build, so a typo'd key fails the build, and (c) manual bilingual QA on the preview. A component render test would assert next-intl behavior, not our logic, and is intentionally omitted (project rule: no tests for trivial boilerplate).

- [ ] **Step 1: `ShareButton.tsx` — import the hook**

The file already does `import { useLocale } from "next-intl";` (L16). Change it to also import `useTranslations`:

```ts
import { useLocale, useTranslations } from "next-intl";
```

- [ ] **Step 2: `ShareButton.tsx` — add a label resolver helper (module-level, pure)**

`SHARE_OPTIONS` is a module-level `const`, so `t` is not in scope there. Add a small pure helper near the other file-local helpers (e.g. just below `SHARE_OPTIONS`). It translates only the two non-brand ids and falls back to the literal label for brands:

```ts
function shareOptionLabel(
  id: string,
  fallback: string,
  t: (key: string) => string,
): string {
  if (id === "copy_link") return t("copy-link");
  if (id === "email") return t("email");
  return fallback; // Facebook / WhatsApp / X — brand names, not translated
}
```

- [ ] **Step 3: `ShareButton.tsx` — get `t` in the component**

Inside `export function ShareButton(...)`, just after `const locale = useLocale();` (L122):

```ts
const t = useTranslations("BlogPostActions");
```

- [ ] **Step 4: `ShareButton.tsx` — translate the toast (both call sites)**

L166 and L177, replace both:

```ts
toast({ title: "Link copied to clipboard" });
```

with:

```ts
toast({ title: t("link-copied") });
```

- [ ] **Step 5: `ShareButton.tsx` — translate the trigger aria-label**

L198:

```tsx
      aria-label={t("share-this-post")}
```

- [ ] **Step 6: `ShareButton.tsx` — translate the dialog title**

L231-233, the `DialogTitle` body:

```tsx
<DialogTitle className="text-base font-semibold text-foreground">
  {t("share-this-post")}
</DialogTitle>
```

- [ ] **Step 7: `ShareButton.tsx` — translate the close button aria-label**

L238:

```tsx
                aria-label={t("close")}
```

- [ ] **Step 8: `ShareButton.tsx` — translate the share-option label at render**

L280-282, the option label `<span>`. Replace `{option.label}` with the resolver:

```tsx
<span className="text-[11px] text-muted-foreground leading-tight text-center">
  {shareOptionLabel(option.id, option.label, t)}
</span>
```

- [ ] **Step 9: `LikeButton.tsx` — import the hook + get `t`**

At the top of `LikeButton.tsx`, add the import:

```ts
import { useTranslations } from "next-intl";
```

Inside `export function LikeButton(...)`, near the top of the body (e.g. before the `useState`):

```ts
const t = useTranslations("BlogPostActions");
```

- [ ] **Step 10: `LikeButton.tsx` — translate the aria-label**

L87:

```tsx
      aria-label={hasLiked ? t("unlike-this-post") : t("like-this-post")}
```

- [ ] **Step 11: `KeywordTags.tsx` — import server helper, make async, translate heading**

Add the import:

```ts
import { getTranslations } from "next-intl/server";
```

Make the component `async` and resolve `t`:

```tsx
export async function KeywordTags({ keywords }: KeywordTagsProps) {
  if (!keywords || keywords.length === 0) {
    return null;
  }

  const t = await getTranslations("BlogPostActions");
```

Replace the heading text (`Tags`, L24) with `{t("tags")}`:

```tsx
<Typography component="h3" variant="h6" className="text-foreground/70">
  {t("tags")}
</Typography>
```

(The early `return null` may stay before or after `const t` — keep it before to avoid an unused translation fetch on the empty path.)

- [ ] **Step 12: Verify the full stack**

Run: `pnpm -C apps/web type-check && pnpm -C apps/web lint && pnpm -C apps/web test && pnpm -C apps/web build`
Expected: all green. `build` confirms the async-RSC change compiles and every `BlogPostActions` key resolves (no missing-key throw).

- [ ] **Step 13: Commit**

```bash
git add apps/web/src/components/features/blog-post-details/ShareButton.tsx apps/web/src/components/features/blog-post-details/LikeButton.tsx apps/web/src/components/features/blog-post-details/KeywordTags.tsx
git commit -m "fix(ICR-39): translate ShareButton, LikeButton, KeywordTags via BlogPostActions"
```

---

## Self-Review

**Spec coverage:**

- R1 (8 keys both files) → Task 1 Steps 3–4. ✓
- R2 (ShareButton: aria-label, dialog title, close, toast ×2, copy-link/email labels) → Task 2 Steps 1–8. ✓
- R3 (LikeButton like/unlike aria-label) → Task 2 Steps 9–10. ✓
- R4 (KeywordTags async + tags heading) → Task 2 Step 11. ✓
- Testing (parity unit test) → Task 1 Step 1. ✓
- contactFormAction (no change) → out of scope by decision. ✓

**Placeholder scan:** none — every code step shows the actual code.

**Type consistency:** `shareOptionLabel(id, fallback, t)` defined (Step 2) and called (Step 8) with matching signature. `useTranslations`/`getTranslations` namespace string `"BlogPostActions"` consistent across all call sites and matches the keys added in Task 1. Key strings used in Task 2 all exist in the Task 1 locked table.
