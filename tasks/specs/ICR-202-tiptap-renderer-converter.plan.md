# ICR-202 — Implementation Plan

Spec: `tasks/specs/ICR-202-tiptap-renderer-converter.md` (PM reviewed + owner Q1 = Option A).
Zero edits to `packages/content/` or `ICR-201`'s files in Wave 1.

## Checkpoints

1. **Converter + self-contained PDF block/hash helpers:**
   - `apps/web/lib/content/rich-text/{types,convert-contentful}.ts`, `__tests__/convert-contentful.test.ts`
   - `apps/web/src/utils/predica/{tiptapRegenContent,tiptapRegenContent.test}.ts`
   - Dev-only `@tiptap/core` & `@tiptap/pm` in `apps/web/package.json` for headless ProseMirror round-trip tests.
2. **Allowlisted TipTap React renderer + all 11 call-site presets + synthetic/security/client/dormancy suites:**
   - `apps/web/lib/content/rich-text/{render,presets,sermon-preset,index}.ts(x)`
   - `apps/web/lib/content/rich-text/__tests__/{parity-helpers.ts,synthetic-parity.test.tsx,security.test.tsx,client-components.test.tsx,dormancy.test.ts}`
   - Hardening commit (`60e93ed`): renderer mark-length/duplicate-mark cap (C1), unconditional adjacent text merge before length gate (C2), relative `./rich-text` dormancy pattern (C3).
3. **Published-only scrubbed production fixture corpus (Q1 = Option A):**
   - `apps/web/scripts/contentful/export-rich-text-corpus.mjs` (GET-only CDA; scrubs `mailto:` + email strings to `contacto@example.org`; asserts zero real emails before write; zero drafts/author emails/secrets).
   - `apps/web/lib/content/rich-text/__fixtures__/production-corpus.json`.
4. **Full published corpus parity, round-trip & sermon PDF parity suites:**
   - `apps/web/lib/content/rich-text/__tests__/parity.test.tsx` (AC1, AC2, AC3 unconditional `PMNode.fromJSON().check()` + `.toJSON()` equality across all 11 call-site presets + scrubbed-corpus email/draft guard).
   - `apps/web/lib/content/rich-text/__tests__/pdf-parity.test.ts` (AC7 block equality across every published production sermon + per-field hash sensitivity).
5. **Specs, full workspace verify & draft PR:**
   - `tasks/specs/ICR-202-tiptap-renderer-converter.{md,plan.md}`
   - `pnpm type-check && pnpm lint && pnpm test && pnpm build` across all workspace packages, push, open draft PR, wait for CI + Vercel preview, write `evidence/ICR-202/verify.md`.
