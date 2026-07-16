import { Input, Label } from "@idcr/web";

// Ported from the repo's real usage:
// apps/web/src/components/features/contact-form/formFields.tsx — every field is
// a `space-y-2` div wrapping a <Label htmlFor> + <Input id className="bg-background">.
// Input itself is bg-transparent by default; the contact form opts into
// bg-background so the field reads against the Card it sits on.

/** The contact form's real field pair: label above, input below. */
export const WithLabel = () => (
  <div className="max-w-sm space-y-6">
    <div className="space-y-2">
      <Label htmlFor="nombre">Nombre</Label>
      <Input
        id="nombre"
        name="nombre"
        type="text"
        autoComplete="given-name"
        placeholder="¿Cómo te llamás?"
        className="bg-background"
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="email">Correo electrónico</Label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="tunombre@ejemplo.com"
        className="bg-background"
      />
    </div>
  </div>
);

/** A filled field next to an empty one — placeholder is muted-foreground. */
export const Filled = () => (
  <div className="max-w-sm space-y-6">
    <div className="space-y-2">
      <Label htmlFor="nombre-filled">Nombre</Label>
      <Input
        id="nombre-filled"
        name="nombre"
        type="text"
        defaultValue="María Fernández"
        className="bg-background"
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="email-empty">Correo electrónico</Label>
      <Input
        id="email-empty"
        name="email"
        type="email"
        placeholder="tunombre@ejemplo.com"
        className="bg-background"
      />
    </div>
  </div>
);

/** Disabled — `disabled:opacity-50 disabled:cursor-not-allowed`. */
export const Disabled = () => (
  <div className="max-w-sm space-y-6">
    <div className="space-y-2">
      <Label htmlFor="email-disabled">Correo electrónico</Label>
      <Input
        id="email-disabled"
        name="email"
        type="email"
        defaultValue="maria@ejemplo.com"
        disabled
        className="bg-background"
      />
    </div>
  </div>
);

/** The default bg-transparent input, sitting on the warm sand section band. */
export const OnSecondary = () => (
  <div className="max-w-sm rounded-md bg-secondary p-6">
    <div className="space-y-2">
      <Label htmlFor="email-newsletter">Suscribite al boletín</Label>
      <Input
        id="email-newsletter"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="tunombre@ejemplo.com"
      />
    </div>
  </div>
);
