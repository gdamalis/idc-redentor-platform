import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@idcr/web";
import { Bookmark } from "lucide-react";

// CardHeader alone renders blank — it is a `flex flex-col space-y-1.5 p-6`
// slot. Each story is a full Card; the header is what varies.

/** The stock header: title + description, the space-y-1.5 stack. */
export const Default = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          El Sermón del Monte
        </CardTitle>
        <CardDescription>Pastor Juan · 8 de junio de 2025</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Bienaventurados los pobres en espíritu, porque de ellos es el reino de
          los cielos.
        </p>
      </CardContent>
    </Card>
  </div>
);

/** Header carrying an overline/eyebrow above the title — the blog-card pattern. */
export const WithEyebrow = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          Predicaciones
        </span>
        <CardTitle className="font-serif text-xl">
          Volver al Padre
        </CardTitle>
        <CardDescription>Pastor Martín · 22 de junio de 2025</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          La parábola del hijo pródigo no trata sobre un hijo que se fue, sino
          sobre un padre que espera.
        </p>
      </CardContent>
    </Card>
  </div>
);

/** Header with a trailing action — title/description and an icon share the row. */
export const WithAction = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="font-serif text-xl">Nuestra misión</CardTitle>
          <CardDescription>Comunidad · Valores</CardDescription>
        </div>
        <Button variant="ghost" size="icon" aria-label="Guardar">
          <Bookmark className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Anunciar a Cristo en Buenos Aires y acompañarnos como familia en la
          vida cotidiana.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="outline" className="w-full">
          Conocé más
        </Button>
      </CardFooter>
    </Card>
  </div>
);
