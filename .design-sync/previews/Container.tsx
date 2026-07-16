import { Container } from "@idcr/web";

// Container is the site's width-and-gutter wrapper: `mx-auto px-4` plus a
// max-width from its size map — sm = max-w-3xl (768px, centered text),
// md = max-w-5xl (1024px, callout), default = max-w-6xl (1152px, standard
// sections). It has no background of its own, so these stories tint it to make
// the box it creates visible.
// Real usage: SermonSection.tsx, ContactForm.tsx, CreedSection.tsx — always a
// <section> wrapping a <Container> wrapping a grid or prose block.

/** The default (max-w-6xl) wrapping a section grid — SermonSection.tsx's shape. */
export const Default = () => (
  <section className="bg-background py-6">
    <Container className="rounded-md bg-secondary/30 py-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-md bg-card p-4 shadow-sm">
          <p className="font-serif font-bold">La gracia de Dios</p>
          <p className="mt-1 text-sm text-muted-foreground">Pastor Juan</p>
        </div>
        <div className="rounded-md bg-card p-4 shadow-sm">
          <p className="font-serif font-bold">Vivir en comunidad</p>
          <p className="mt-1 text-sm text-muted-foreground">Pastor Martín</p>
        </div>
        <div className="rounded-md bg-card p-4 shadow-sm">
          <p className="font-serif font-bold">Volver al Padre</p>
          <p className="mt-1 text-sm text-muted-foreground">Pastor Martín</p>
        </div>
      </div>
    </Container>
  </section>
);

/**
 * The three sizes stacked and tinted.
 * The capture stage is ~844px wide, so only `sm` (768px) is narrow enough to
 * visibly cap — `md` (1024px) and `default` (1152px) both exceed the stage and
 * render full-bleed here. That is the honest render: the sizes only diverge
 * from each other above 1024px.
 */
export const Sizes = () => (
  <div className="space-y-4 bg-background py-4">
    <Container size="sm" className="rounded-md bg-primary/20 py-4 text-center">
      <p className="text-sm font-semibold">size=&quot;sm&quot; · max-w-3xl</p>
      <p className="text-sm text-muted-foreground">Texto centrado y legible</p>
    </Container>
    <Container size="md" className="rounded-md bg-primary/10 py-4 text-center">
      <p className="text-sm font-semibold">size=&quot;md&quot; · max-w-5xl</p>
      <p className="text-sm text-muted-foreground">Bloques destacados</p>
    </Container>
    <Container className="rounded-md bg-secondary py-4 text-center">
      <p className="text-sm font-semibold">
        size=&quot;default&quot; · max-w-6xl
      </p>
      <p className="text-sm text-muted-foreground">Secciones estándar</p>
    </Container>
  </div>
);

/** size="sm" holding centered prose — the Credo/mission reading measure. */
export const NarrowProse = () => (
  <section className="bg-background py-6">
    <Container size="sm" className="rounded-md bg-secondary/30 py-6 text-center">
      <h2 className="font-serif text-3xl font-bold">Nuestro Credo</h2>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Creemos en un solo Dios, Padre todopoderoso, creador del cielo y de la
        tierra, de todo lo visible y lo invisible. Creemos en un solo Señor,
        Jesucristo, Hijo único de Dios, nacido del Padre antes de todos los
        siglos.
      </p>
    </Container>
  </section>
);
