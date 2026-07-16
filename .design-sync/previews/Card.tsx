import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@idcr/web";
import { ArrowRight, Calendar, MapPin } from "lucide-react";

// Card renders nothing on its own — it is a shell (`rounded-xl border bg-card
// shadow`). Every story here is a full composition, which is the only honest
// render. Compositions follow the repo's real usage in
// apps/web/src/components/features/{contact-form/ContactForm,blog-section/BlogPostCard}.tsx
// where CardTitle-equivalent headings are always font-serif (Playfair).

export const Default = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">La gracia de Dios</CardTitle>
        <CardDescription>Pastor Juan · 1 de junio de 2025</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          La gracia es suficiente: no llegamos a Dios por nuestro mérito, sino
          por su favor inmerecido.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" className="w-full justify-between">
          Escuchar la predicación
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  </div>
);

/** The "vení a conocernos" panel: header + a small definition list + a CTA. */
export const ServiceInfo = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          Reuniones dominicales
        </CardTitle>
        <CardDescription>
          Te esperamos. Si es tu primera vez, avisanos y te recibimos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <span>Domingos a las 11:00</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span>Av. Cabildo 1234, Belgrano, CABA</span>
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Cómo llegar</Button>
      </CardFooter>
    </Card>
  </div>
);

/** How cards actually sit on the site: a responsive grid of equal-height cards. */
export const Grid = () => (
  <div className="grid gap-6 sm:grid-cols-2">
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="font-serif text-xl">Vivir en comunidad</CardTitle>
        <CardDescription>Pastor Martín · 18 de mayo de 2025</CardDescription>
      </CardHeader>
      <CardContent className="grow">
        <p className="text-sm text-muted-foreground">
          La iglesia no es un edificio: es un pueblo que camina junto.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" className="w-full justify-between">
          Leer más
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="font-serif text-xl">Nuestro Credo</CardTitle>
        <CardDescription>Lo que creemos y confesamos juntos</CardDescription>
      </CardHeader>
      <CardContent className="grow">
        <p className="text-sm text-muted-foreground">
          Creemos en un solo Dios, Padre todopoderoso, creador del cielo y de la
          tierra.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" className="w-full justify-between">
          Leer el Credo
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  </div>
);
