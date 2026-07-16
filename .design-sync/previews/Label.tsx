import { Input, Label, Textarea } from "@idcr/web";

// Label is a Radix LabelPrimitive.Root styled `text-sm font-medium
// leading-none` plus `peer-disabled:` hooks. It only means anything bound to a
// control, so every story pairs it with the field it labels — the shape used in
// apps/web/src/components/features/contact-form/formFields.tsx.

/** The contact form's real pairing across its three field types. */
export const Default = () => (
  <div className="max-w-sm space-y-6">
    <div className="space-y-2">
      <Label htmlFor="label-nombre">Nombre</Label>
      <Input
        id="label-nombre"
        name="nombre"
        type="text"
        placeholder="¿Cómo te llamás?"
        className="bg-background"
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="label-email">Correo electrónico</Label>
      <Input
        id="label-email"
        name="email"
        type="email"
        placeholder="tunombre@ejemplo.com"
        className="bg-background"
      />
    </div>
  </div>
);

/** Label marking a required field — the asterisk is the caller's, not the DS's. */
export const Required = () => (
  <div className="max-w-sm space-y-2">
    <Label htmlFor="label-mensaje">
      Mensaje <span className="text-destructive">*</span>
    </Label>
    <Textarea
      id="label-mensaje"
      name="mensaje"
      rows={4}
      required
      placeholder="Contanos en qué podemos acompañarte"
      className="mt-2 resize-none bg-background"
    />
  </div>
);

/**
 * `peer-disabled:opacity-70` — the Label dims only when it follows a disabled
 * `peer` input in the DOM, so the input must come first and carry `peer`.
 */
export const PeerDisabled = () => (
  <div className="max-w-sm space-y-6">
    <div className="flex flex-col-reverse gap-2">
      <Input
        id="label-peer-disabled"
        name="email"
        type="email"
        defaultValue="maria@ejemplo.com"
        disabled
        className="peer bg-background"
      />
      <Label htmlFor="label-peer-disabled">Correo electrónico (deshabilitado)</Label>
    </div>
    <div className="flex flex-col-reverse gap-2">
      <Input
        id="label-peer-enabled"
        name="nombre"
        type="text"
        defaultValue="María Fernández"
        className="peer bg-background"
      />
      <Label htmlFor="label-peer-enabled">Nombre (habilitado)</Label>
    </div>
  </div>
);
