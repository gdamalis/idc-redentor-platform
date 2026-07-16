import { Dropdown, Label } from "@idcr/web";

// Dropdown is Headless UI's Listbox and owns its own selection state — there is
// no `value`/`open` prop to drive from outside, so these cells necessarily show
// the closed button. The options list only mounts while the Listbox is open.

const SUBJECT_OPTIONS = [
  { id: "0", value: "Quiero visitar la iglesia" },
  { id: "1", value: "Consulta sobre las reuniones" },
  { id: "2", value: "Quiero servir como voluntario" },
  { id: "3", value: "Pedido de oración" },
];

export const Placeholder = () => (
  <Dropdown options={SUBJECT_OPTIONS} placeholder="Elegí un motivo" />
);

// Ported from formFields.tsx#getDropdownField — the contact form's real
// composition: a Label bound to the hidden input the Dropdown submits with.
export const WithLabel = () => (
  <div className="space-y-2">
    <Label htmlFor="contact-subject">Motivo de tu mensaje</Label>
    <Dropdown
      options={SUBJECT_OPTIONS}
      placeholder="Elegí un motivo"
      name="contact-subject"
      id="contact-subject"
    />
  </div>
);

export const InFormRow = () => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <div className="space-y-2">
      <Label htmlFor="preferred-service">Reunión a la que venís</Label>
      <Dropdown
        options={[
          { id: "0", value: "Domingo 11:00 — Reunión general" },
          { id: "1", value: "Miércoles 19:30 — Estudio bíblico" },
        ]}
        placeholder="Elegí un horario"
        name="preferred-service"
        id="preferred-service"
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="contact-locale">Idioma preferido</Label>
      <Dropdown
        options={[
          { id: "0", value: "Español" },
          { id: "1", value: "English" },
        ]}
        placeholder="Elegí un idioma"
        name="contact-locale"
        id="contact-locale"
      />
    </div>
  </div>
);
