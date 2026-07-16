import { IconCard } from "@idcr/web";
import { Heart, HeartHandshake, MessageCircle, Users } from "lucide-react";

// `icon` is a ComponentType, not an element — IconCard renders it itself as
// <Icon className="w-6 h-6" />. Card body copy mirrors CreedSection's
// `cardDescriptionOptions` paragraph: <p className="text-muted-foreground leading-relaxed">.

export const Default = () => (
  <IconCard icon={MessageCircle} title="Testimonio">
    <p className="text-muted-foreground leading-relaxed">
      Creemos que cada historia importa. Contamos lo que Dios hizo en nosotros
      sin adornos, porque la gracia no necesita maquillaje.
    </p>
  </IconCard>
);

// The footer slot is how CreedSection hangs a scripture reference under the copy.
export const WithVerseFooter = () => (
  <IconCard
    icon={Heart}
    title="Redención"
    footer={
      <div className="border-t border-border pt-4 mt-4">
        <p className="text-sm italic text-muted-foreground/80">
          &quot;Rasguen el corazón y no las vestiduras&quot; (Joel 2:13)
        </p>
      </div>
    }
  >
    <p className="text-muted-foreground leading-relaxed">
      Nadie llega acá por mérito propio. Fuimos comprados por la sangre de
      Cristo y eso iguala a todos los que entran por esa puerta.
    </p>
  </IconCard>
);

// CreedSection renders these in a grid with `className="h-full"` on each card so
// the row's tallest card sets the height. This cell proves that stretch works
// with uneven copy lengths.
export const Grid = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
    <IconCard icon={Users} title="Unidad" index={0} className="h-full">
      <p className="text-muted-foreground leading-relaxed">
        Somos distintos y eso no se negocia. Nos une Cristo, no la coincidencia
        de opiniones.
      </p>
    </IconCard>
    <IconCard
      icon={HeartHandshake}
      title="Servicio"
      index={1}
      className="h-full"
    >
      <p className="text-muted-foreground leading-relaxed">
        Servir no es un puesto: es lavar los platos después del almuerzo
        comunitario y acompañar a quien está solo un martes cualquiera.
      </p>
    </IconCard>
    <IconCard icon={Heart} title="Misericordia" index={2} className="h-full">
      <p className="text-muted-foreground leading-relaxed">
        Recibimos misericordia, así que la damos.
      </p>
    </IconCard>
  </div>
);
