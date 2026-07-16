import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@idcr/web";
import { ArrowRight, Heart } from "lucide-react";

// CardFooter alone renders blank — it is a `flex items-center p-6 pt-0` slot.
// Every story is a full Card; the footer is what varies.

/** Single full-width CTA — the pattern ContactForm.tsx uses inside its Card. */
export const SingleAction = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Vení a conocernos</CardTitle>
        <CardDescription>Domingos a las 11:00 · Belgrano, CABA</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Si es tu primera vez, escribinos y te esperamos en la puerta.
        </p>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Cómo llegar</Button>
      </CardFooter>
    </Card>
  </div>
);

/** Two actions sharing the row — the footer's `flex items-center` doing its job. */
export const TwoActions = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">La gracia de Dios</CardTitle>
        <CardDescription>Pastor Juan · 1 de junio de 2025</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          La gracia es suficiente: no llegamos a Dios por nuestro mérito.
        </p>
      </CardContent>
      <CardFooter className="gap-3">
        <Button className="flex-1">Escuchar</Button>
        <Button variant="outline" className="flex-1">
          Descargar PDF
        </Button>
      </CardFooter>
    </Card>
  </div>
);

/** Footer split: metadata left, action right — `justify-between`. */
export const MetaAndAction = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Vivir en comunidad</CardTitle>
        <CardDescription>Pastor Martín · 18 de mayo de 2025</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          La iglesia no es un edificio: es un pueblo que camina junto.
        </p>
      </CardContent>
      <CardFooter className="justify-between">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Heart className="h-4 w-4" />
          24
        </span>
        <Button variant="ghost">
          Leer más
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  </div>
);
