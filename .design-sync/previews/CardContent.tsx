import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@idcr/web";
import { Clock, MapPin, Users } from "lucide-react";

// CardContent alone renders blank — it is a `p-6 pt-0` slot (the pt-0 assumes a
// CardHeader sits above it). Every story is a full Card; the body is what varies.

/** Prose body — the shape used by the blog/sermon cards. */
export const Prose = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Nuestra misión</CardTitle>
        <CardDescription>Comunidad · Valores</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Anunciar a Cristo en Buenos Aires, formar discípulos que amen las
          Escrituras y acompañarnos como familia en la vida cotidiana. No somos
          un evento semanal: somos un pueblo.
        </p>
      </CardContent>
    </Card>
  </div>
);

/** Icon rows — the "come meet us" details block. */
export const DetailRows = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          Reuniones dominicales
        </CardTitle>
        <CardDescription>Todos los domingos, todo el año</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <span>11:00 a 12:30</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span>Av. Cabildo 1234, Belgrano, CABA</span>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span>Espacio para chicos durante la reunión</span>
        </div>
      </CardContent>
    </Card>
  </div>
);

/** A list body — the sermon's main points. */
export const List = () => (
  <div className="max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">Volver al Padre</CardTitle>
        <CardDescription>Puntos principales · Lucas 15</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-3">
            <span className="font-semibold text-primary">1.</span>
            <span>La oveja perdida: Dios sale a buscar.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-primary">2.</span>
            <span>La moneda perdida: Dios no se resigna.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-primary">3.</span>
            <span>El hijo pródigo: Dios corre al encuentro.</span>
          </li>
        </ol>
      </CardContent>
    </Card>
  </div>
);
