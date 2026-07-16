import { Button } from "@idcr/web";
import { PlayCircle } from "lucide-react";

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="default">Conocé más</Button>
    <Button variant="secondary">Ver predicaciones</Button>
    <Button variant="outline">Contactanos</Button>
    <Button variant="ghost">Leer artículo</Button>
    <Button variant="link">Nuestra misión</Button>
    <Button variant="destructive">Eliminar</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="sm">Pequeño</Button>
    <Button size="default">Mediano</Button>
    <Button size="lg">Grande</Button>
    <Button size="icon" aria-label="Reproducir">
      <PlayCircle />
    </Button>
  </div>
);

export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="default">
      <PlayCircle />
      Escuchar la predicación
    </Button>
    <Button variant="outline">
      <PlayCircle />
      Descargar PDF
    </Button>
  </div>
);

export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>Enviando…</Button>
    <Button variant="outline" disabled>
      No disponible
    </Button>
  </div>
);
