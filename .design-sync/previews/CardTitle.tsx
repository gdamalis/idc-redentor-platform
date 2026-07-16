import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@idcr/web";

// CardTitle alone renders blank — it is `font-semibold leading-none
// tracking-tight` on a bare div (no size, no family of its own). Every story is
// a full Card; the title is what varies.
//
// Note it is a <div>, so it does NOT pick up the @layer base h1-h6 Playfair
// rule. The site always pairs it with font-serif explicitly — see the headings
// inside Card in apps/web/src/components/features/contact-form/ContactForm.tsx.

/** The site's real pairing: font-serif (Playfair) title over a sans description. */
export const Default = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          La gracia de Dios
        </CardTitle>
        <CardDescription>Pastor Juan · 1 de junio de 2025</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          No llegamos a Dios por nuestro mérito, sino por su favor inmerecido.
        </p>
      </CardContent>
    </Card>
  </div>
);

/** A long title wrapping to two lines — `leading-none` is what to watch here. */
export const LongTitle = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          El Dios que nos busca primero: una lectura de Lucas 15
        </CardTitle>
        <CardDescription>Pastor Martín · 22 de junio de 2025</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Tres parábolas, un solo corazón: el de un Padre que sale a buscar.
        </p>
      </CardContent>
    </Card>
  </div>
);

/** Title left at its unstyled default (no font-serif) — the DS baseline. */
export const Unstyled = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle>Reuniones dominicales</CardTitle>
        <CardDescription>Domingos a las 11:00 · Belgrano, CABA</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Nos reunimos para adorar a Dios y estudiar juntos las Escrituras.
        </p>
      </CardContent>
    </Card>
  </div>
);
