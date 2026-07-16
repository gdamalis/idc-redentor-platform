import { Typography } from "@idcr/web";

// Headings render in Playfair Display (font-serif via the @layer base h1-h6
// rule); body copy renders in Outfit (font-sans on body). If either shows a
// generic serif/sans, the --font-outfit / --font-playfair chain is broken.
export const Headings = () => (
  <div className="flex flex-col gap-2">
    <Typography component="h1" variant="h1">
      Iglesia de Cristo Redentor
    </Typography>
    <Typography component="h2" variant="h2">
      ¿Quién es Jesús?
    </Typography>
    <Typography component="h3" variant="h3">
      Nuestra misión
    </Typography>
    <Typography component="h4" variant="h4">
      Reuniones dominicales
    </Typography>
    <Typography component="h5" variant="h5">
      Vení a conocernos
    </Typography>
    <Typography component="h6" variant="h6">
      Credo
    </Typography>
  </div>
);

export const BodyCopy = () => (
  <div className="flex flex-col gap-3">
    <Typography component="p" variant="body">
      Somos una comunidad que se reúne cada domingo para adorar a Dios, estudiar
      juntos las Escrituras y acompañarnos en la vida cotidiana.
    </Typography>
    <Typography component="p" variant="body1">
      Nos encontramos todos los domingos a las 11:00 en el barrio de Belgrano.
      Si es tu primera vez, escribinos y te esperamos.
    </Typography>
    <Typography component="p" variant="body2">
      Las predicaciones quedan disponibles en audio y PDF durante la semana.
    </Typography>
  </div>
);

export const Supporting = () => (
  <div className="flex flex-col gap-3">
    <Typography component="span" variant="overline">
      Predicaciones
    </Typography>
    <Typography component="span" variant="caption">
      Publicado el 1 de junio de 2025 · Pastor Juan
    </Typography>
  </div>
);

export const Blockquote = () => (
  <Typography component="blockquote" variant="blockquote">
    Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito,
    para que todo aquel que en él cree no se pierda, mas tenga vida eterna.
  </Typography>
);
