import { Button, Input, Label, Textarea } from "@idcr/web";

// Ported from the repo's real usage:
// apps/web/src/components/features/contact-form/formFields.tsx#getLongTextInput
// — `<Label htmlFor>` + `<Textarea rows={4} className="bg-background resize-none mt-2">`.
// Textarea's own floor is min-h-[60px]; rows={4} is what gives it real height.

/** The contact form's message field, exactly as the site renders it. */
export const WithLabel = () => (
  <div className="max-w-sm">
    <Label htmlFor="ta-mensaje">Mensaje</Label>
    <Textarea
      id="ta-mensaje"
      name="mensaje"
      rows={4}
      placeholder="Contanos en qué podemos acompañarte"
      className="mt-2 resize-none bg-background"
    />
  </div>
);

/** Filled with a real message — how the field reads once typed into. */
export const Filled = () => (
  <div className="max-w-sm">
    <Label htmlFor="ta-filled">Mensaje</Label>
    <Textarea
      id="ta-filled"
      name="mensaje"
      rows={4}
      defaultValue="Hola, los encontré por la web y me gustaría visitarlos este domingo. ¿A qué hora empieza la reunión? Voy con mis dos hijos."
      className="mt-2 resize-none bg-background"
    />
  </div>
);

/** Disabled — `disabled:opacity-50 disabled:cursor-not-allowed`. */
export const Disabled = () => (
  <div className="max-w-sm">
    <Label htmlFor="ta-disabled">Mensaje</Label>
    <Textarea
      id="ta-disabled"
      name="mensaje"
      rows={4}
      disabled
      defaultValue="El formulario se está enviando…"
      className="mt-2 resize-none bg-background"
    />
  </div>
);

/** In context: the tail of the contact form — last field plus the submit CTA. */
export const InContactForm = () => (
  <form className="max-w-sm space-y-6 rounded-3xl border border-border bg-card p-8 shadow-lg">
    <h3 className="mb-6 font-serif text-2xl font-bold">Escribinos</h3>
    <div className="space-y-2">
      <Label htmlFor="ta-form-nombre">Nombre</Label>
      <Input
        id="ta-form-nombre"
        name="nombre"
        type="text"
        placeholder="¿Cómo te llamás?"
        className="bg-background"
      />
    </div>
    <div>
      <Label htmlFor="ta-form-mensaje">Mensaje</Label>
      <Textarea
        id="ta-form-mensaje"
        name="mensaje"
        rows={4}
        placeholder="Contanos en qué podemos acompañarte"
        className="mt-2 resize-none bg-background"
      />
    </div>
    <Button type="submit" size="lg" className="h-12 w-full rounded-full text-lg">
      Enviar mensaje
    </Button>
  </form>
);
