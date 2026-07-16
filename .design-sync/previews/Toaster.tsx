import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@idcr/web";

// <Toaster /> itself renders nothing here: it reads its list from the
// useToast() store, which starts empty and can only be filled by calling
// toast() at runtime (the hook is not part of the DS bundle). So these cells
// reproduce toaster.tsx's markup verbatim — the same
// <Toast>{grid gap-1 + title + description}{action}<ToastClose /></Toast>
// inside <ToastProvider>, closed by <ToastViewport /> — with the list it would
// have once a toast fires. If toaster.tsx's structure changes, this file has to
// follow it by hand.
//
// The viewport is `fixed ... md:max-w-[420px]` and Radix portals toasts into
// it, so it would otherwise pin to the browser corner and escape the card;
// `static w-full md:max-w-none` puts it back in-flow. `duration` outruns the
// capture so the auto-dismiss timer never fires. ToastClose is forced visible
// (it is `opacity-0` until the toast is hovered).

const VIEWPORT = "static w-full md:max-w-none";
const HOLD = 86_400_000;

// The app's only live toast today: ShareButton copies the article link and
// fires toast({ title: t("link-copied") }) — title only, no description.
export const CopyLink = () => (
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

// The viewport stacks its children (`flex-col-reverse ... sm:flex-col p-4`);
// this is what two queued toasts of different variants look like together.
export const Stack = () => (
  <ToastProvider duration={HOLD}>
    <Toast open>
      <div className="grid gap-1">
        <ToastTitle>Enlace copiado al portapapeles</ToastTitle>
        <ToastDescription>
          Compartí la predicación con quien quieras.
        </ToastDescription>
      </div>
      <ToastClose className="opacity-100" />
    </Toast>
    <Toast open variant="destructive">
      <div className="grid gap-1">
        <ToastTitle>No pudimos guardar tu &quot;me gusta&quot;</ToastTitle>
        <ToastDescription>Intentá de nuevo en un momento.</ToastDescription>
      </div>
      <ToastClose className="opacity-100" />
    </Toast>
    <ToastViewport className={VIEWPORT} />
  </ToastProvider>
);
