// Provider surface for design-sync previews.
//
// Almost every component in this DS calls next-intl's useTranslations()/
// useLocale(), which throw outside NextIntlClientProvider. cfg.provider names
// the wrapper, but the converter requires the wrapper to be a BUNDLE EXPORT
// ([PROVIDER_UNEXPORTED] is fatal) — hence this module, wired via
// cfg.extraEntries.
//
// dsMessages is imported from the REAL locale file, not inlined into config:
// an inlined copy would be duplicated into every card and would silently rot
// whenever the translations change.
//
// next-themes' ThemeProvider is deliberately NOT here: no component imports
// next-themes (it's only used in app/[locale]/layout.tsx to toggle a `.dark`
// class), so previews render the light theme with no provider needed.
export { NextIntlClientProvider } from "next-intl";

import esAR from "../apps/web/public/locales/es-AR.json";

export const dsMessages = esAR;

// ---------------------------------------------------------------------------
// Browser shim for Node's `process` global.
//
// The converter's esbuild pass defines the exact expression
// `process.env.NODE_ENV` (lib/bundle.mjs), but a bundled dependency reads it as
// `process?.env?.["NODE_ENV"]`, which that define does not match. Optional
// chaining does NOT rescue an UNDECLARED identifier — `process?.env` still
// throws ReferenceError — so without this every preview dies with
// "ReferenceError: process is not defined" at render time.
//
// ShareButton also reads process.env.NEXT_PUBLIC_BASE_URL; it degrades to its
// own fallback when undefined, which is correct for a preview.
//
// This module is an extraEntry, so it is part of the bundle and this top-level
// statement runs at load — before any component renders.
// ---------------------------------------------------------------------------
declare global {
  // eslint-disable-next-line no-var
  var process: { env: Record<string, string | undefined> } | undefined;
}

if (typeof globalThis.process === "undefined") {
  globalThis.process = { env: { NODE_ENV: "production" } };
}
