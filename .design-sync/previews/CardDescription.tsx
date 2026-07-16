import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@idcr/web";

// CardDescription alone renders blank — it is `text-sm text-muted-foreground`
// on a bare div. Every story is a full Card; the description is what varies.

/** The common case: a one-line byline under the title. */
export const Default = () => (
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
    </Card>
  </div>
);

/** A description carrying a full sentence and wrapping — muted against the title. */
export const Multiline = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Vení a conocernos</CardTitle>
        <CardDescription>
          Somos una comunidad que se reúne cada domingo para adorar a Dios,
          estudiar juntos las Escrituras y acompañarnos en la vida cotidiana.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button className="w-full">Escribinos</Button>
      </CardFooter>
    </Card>
  </div>
);

/** Description used as a metadata strip — the contrast step below CardTitle. */
export const AsMetadata = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          Encuentro de jóvenes
        </CardTitle>
        <CardDescription>
          Viernes 4 de julio · 19:30 · Salón principal
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Una noche de adoración, palabra y cena compartida. Traé a un amigo.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full">
          Quiero participar
        </Button>
      </CardFooter>
    </Card>
  </div>
);
