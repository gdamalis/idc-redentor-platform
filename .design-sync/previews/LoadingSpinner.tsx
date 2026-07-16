import { Button, LoadingSpinner } from "@idcr/web";

// LoadingSpinner is styled for dark/branded surfaces (`text-white/80` track,
// `fill-primary/40` arc) and is only ever rendered inside a pending submit
// button — on a plain white card it is effectively invisible. Every cell here
// gives it the surface it was designed for.
// The visible label is the sr-only "Cargando..." (`status.sr-loading`), so the
// button copy around it carries the meaning.

// Exact usage from ContactForm.tsx:172-183 (isPending branch).
export const InSubmitButton = () => (
  <Button
    type="submit"
    disabled
    className="w-full rounded-full text-lg h-12"
    size="lg"
  >
    <LoadingSpinner size="sm" className="text-white" />
  </Button>
);

// Exact usage from SubscribeBanner.tsx:76-82 (isPending branch) — the raw
// primary button the banner hand-rolls rather than using <Button>.
export const InSubscribeBanner = () => (
  <div className="flex w-full items-center gap-2">
    <input
      type="email"
      placeholder="tu@correo.com"
      readOnly
      className="min-w-0 flex-1 rounded-lg border-0 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 md:w-64"
    />
    <button
      type="submit"
      disabled
      className="shrink-0 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
    >
      <LoadingSpinner size="sm" />
    </button>
  </div>
);

export const Sizes = () => (
  <div className="flex items-center gap-8 rounded-2xl bg-primary p-8">
    <div className="flex flex-col items-center gap-2">
      <LoadingSpinner size="sm" />
      <span className="text-xs text-white/80">sm — 16px</span>
    </div>
    <div className="flex flex-col items-center gap-2">
      <LoadingSpinner size="lg" />
      <span className="text-xs text-white/80">lg — 24px</span>
    </div>
  </div>
);
