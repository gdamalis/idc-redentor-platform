import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@idcr/web";

// Three things about composing Toast for a static sheet:
//
// 1. Radix portals every <Toast> into the <ToastViewport> node, so the toast
//    renders wherever the viewport is — not where the JSX sits. The viewport's
//    own classes are `fixed ... top-0 sm:bottom-0 sm:right-0 md:max-w-[420px]`,
//    which would pin the toast to the browser corner and escape the card.
//    `static` + `md:max-w-none` (merged by cn/tailwind-merge) drops it back
//    in-flow. Nothing else about the toast changes.
// 2. `duration` is set past the capture window so Radix's auto-dismiss timer
//    never fires mid-screenshot.
// 3. ToastClose is `opacity-0 ... group-hover:opacity-100` — the X only appears
//    on hover. It is forced visible here so the close affordance is reviewable;
//    in the app it stays hidden until you hover the toast.

const VIEWPORT = "static w-full md:max-w-none";
const HOLD = 86_400_000;

// The one real toast in the app: ShareButton.tsx:177 fires
// toast({ title: t("link-copied") }) after copying the article URL.
export const Default = () => (
  <ToastProvider duration={HOLD}>
    <Toast open>
      <div className="grid gap-1">
        <ToastTitle>Enlace copiado al portapapeles</ToastTitle>
      </div>
      <ToastClose className="opacity-100" />
    </Toast>
    <ToastViewport className={VIEWPORT} />
  </ToastProvider>
);

export const WithDescription = () => (
  <ToastProvider duration={HOLD}>
    <Toast open>
      <div className="grid gap-1">
        <ToastTitle>Mensaje enviado</ToastTitle>
        <ToastDescription>
          Gracias por escribirnos. Te respondemos dentro de las próximas 48
          horas.
        </ToastDescription>
      </div>
      <ToastClose className="opacity-100" />
    </Toast>
    <ToastViewport className={VIEWPORT} />
  </ToastProvider>
);

export const Destructive = () => (
  <ToastProvider duration={HOLD}>
    <Toast open variant="destructive">
      <div className="grid gap-1">
        <ToastTitle>No pudimos enviar tu mensaje</ToastTitle>
        <ToastDescription>
          Revisá tu conexión e intentá de nuevo.
        </ToastDescription>
      </div>
      <ToastClose className="opacity-100" />
    </Toast>
    <ToastViewport className={VIEWPORT} />
  </ToastProvider>
);

export const WithAction = () => (
  <ToastProvider duration={HOLD}>
    <Toast open>
      <div className="grid gap-1">
        <ToastTitle>Predicación descargada</ToastTitle>
        <ToastDescription>
          El PDF quedó guardado en tus descargas.
        </ToastDescription>
      </div>
      <ToastAction altText="Abrir el PDF de la predicación">Abrir</ToastAction>
      <ToastClose className="opacity-100" />
    </Toast>
    <ToastViewport className={VIEWPORT} />
  </ToastProvider>
);
