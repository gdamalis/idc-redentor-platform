# IDC Redentor — Editorial & Content Rules

> **Purpose:** The rules that govern content — how the site is written, translated, and published, the voice it must hold, the doctrinal guardrail, and the bar for "done." These are the rules editors and agents follow when touching content.
> **Last reviewed:** 2026-06-21
> **Status:** DRAFT — voice and editorial defaults for church leadership ([@gdamalis](https://github.com/gdamalis) + leadership) to confirm/refine. Doctrinal content is **leadership-owned**.

---

## The bilingual rule (es-AR primary, en-US secondary)

- **es-AR is the source of truth.** Write content in Argentine Spanish first; en-US is the secondary translation that follows. When the two disagree, es-AR wins unless leadership says otherwise.
- **Keep both locales populated** for anything user-facing. Contentful localizes at the field level (one entry, two locale values) — don't ship a page where en-US is empty for a visible field.
- **UI strings live outside Contentful** in `public/locales/es-AR.json` and `public/locales/en-US.json` (served by next-intl). The two files must stay **structurally in sync** — same keys in both. Adding a key to one means adding it to the other.
- **Translate meaning, not words.** en-US should read naturally to an English speaker, not like a literal gloss of the Spanish. Preserve Scripture references and proper nouns exactly.

## Voice & tone (for a church audience)

Carry the voice from [overview.md](./overview.md) into every piece of copy:

- **Warm, welcoming, hospitable.** Write to a real person who may be visiting a church for the first time. Lead with welcome, then logistics.
- **Reverent but plain.** Respect the subject; drop the jargon. Avoid denominational insider shorthand and assumed knowledge on public pages — explain gently instead.
- **Second person, inclusive.** Speak _to_ the reader ("vos/usted" per the church's preference — confirm with leadership). Include newcomers and seekers; never make them feel like outsiders.
- **Honest and unpushy.** No salesy language, no manufactured urgency, no fear-based appeals. Invite; don't pressure.
- **Scripture is attributed.** Quote with book, chapter, and verse, and keep the Bible version consistent across the site. The church's confirmed translations are **NVI (Nueva Versión Internacional)** in Spanish and **NIV** in English. The `bibleVerse` field on Credo/ValueItem entries is the place for these; sermon scripture is stored as structured `bibleVerse` entries reused across sermons (see `docs/predica-bibleverse-reuse.md`).

## Doctrinal content guardrail (leadership-owned)

This is the most important content rule on a church site.

- **The Creed/Credo, "¿Quién es Jesús?", mission, and values are leadership-owned doctrine.** They live in Contentful as `ContentCollection` (Credo + ValueItem) entries and who-is-jesus/community `Page` sections.
- **Agents and editors may fix** typos, grammar, punctuation, formatting, broken markup, and translation accuracy.
- **Agents and editors must NOT alter doctrinal meaning** — wording of beliefs, theological claims, Scripture selection, or the framing of the gospel. Do not paraphrase doctrine "for clarity," do not invent beliefs, do not soften or sharpen claims.
- **Surface, don't silently change.** If a doctrinal edit seems warranted (e.g. an awkward sentence in the Creed), propose the change to leadership ([@gdamalis](https://github.com/gdamalis) + leadership) for confirmation rather than editing it directly. When in doubt, treat the text as fixed.

_(This mirrors the general "improve, don't overwrite" editorial standard, recast for theology: improve the presentation, never the meaning.)_

## Image guidelines

- **Use Contentful assets.** Images are served from the Contentful CDN (`images.ctfassets.net` / `images.eu.ctfassets.net`), which is already allow-listed in the CSP (`config/headers.js`). Don't introduce new external image hosts without updating the CSP.
- **Always set `title` / alt text.** Every image entry needs a meaningful `title` for accessibility and SEO. Describe what the image shows, in the page's locale.
- **Mind size and aspect ratio.** Optimize file size for fast mobile loads. For social sharing, provide a **1200×630** OG image (the default used by the metadata builder in `lib/metadata.ts`).
- **Respect photo consent.** Do not publish identifiable photos of congregants — especially children — without permission. When unsure, use general or stock imagery.

## SEO copy rules

- **Every Page and Blog post has SEO metadata** — inline `Page.seo`, the standalone `Seo` content type, or the blog `seoTitle`/`seoDescription`/`keywords` fields.
- **Title** ≤ ~60 characters; **description** ≤ ~155 characters; include the church name where natural; write for a human, not a keyword stuffer.
- **Keywords** should be a small, relevant set (location, "iglesia", topic) — not a dump.
- **OG image** set per page where it matters (home, blog posts); fall back to the default OG image otherwise.
- Keep es-AR and en-US SEO fields both populated and locale-appropriate (a Spanish title for es-AR, English for en-US). See [ai-era-strategy.md](./ai-era-strategy.md) and `docs/seo-and-metadata.md`.

## Publish & preview flow

- **Preview before publishing.** Draft mode is automatically on in development and on Vercel preview deployments (`shouldUseDraftMode()`), so editors can see unpublished changes in context before they go live.
- **Publishing triggers revalidation.** When an editor publishes in Contentful, the configured webhook calls `/api/revalidate`, which runs `revalidateTag("site-content")` and refreshes the affected pages. Editors don't need to redeploy.
- **Check both locales after publishing** a localized entry — verify es-AR and en-US both render correctly on the live (or preview) page.

---

## The bar for "done" (content)

A content change is done when:

1. **es-AR is written well** and reads naturally in Argentine Spanish.
2. **en-US is translated** and reads naturally in English (no empty visible fields).
3. **Images have titles/alt**, are reasonably sized, and respect consent.
4. **SEO fields** (title/description/keywords/OG) are filled and within limits, per locale.
5. **No doctrinal meaning was changed** without leadership confirmation.
6. **It previews correctly** (draft mode) before publish, and **publish triggers revalidation**.
