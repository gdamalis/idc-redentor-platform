import { SectionHeader } from "@idcr/web";

// SectionHeader's `description` is a ReactNode, not a string: every real caller
// (OurMissionSection, CreedSection) passes Contentful rich text rendered through
// `sectionDescriptionOptions`, whose PARAGRAPH renderer is exactly the
// <p className="text-muted-foreground text-lg"> reproduced below. Passing a bare
// string here would render unstyled copy and misrepresent the component.

export const WithDescription = () => (
  <SectionHeader
    title="Nuestro Credo"
    description={
      <p className="text-muted-foreground text-lg">
        Esto es lo que creemos y lo que nos sostiene como comunidad. No son
        reglas que nos separan, sino convicciones que nos reúnen cada domingo.
      </p>
    }
  />
);

export const TitleOnly = () => <SectionHeader title="Nuestra misión" />;

export const LongTitle = () => (
  <SectionHeader
    title="Vení a conocernos este domingo"
    description={
      <p className="text-muted-foreground text-lg">
        Nos reunimos todos los domingos a las 11:00 en Av. Cabildo 2230,
        Belgrano. Si es tu primera vez, escribinos y te esperamos en la puerta.
      </p>
    }
  />
);
