import { Container } from '@src/components/ui/container';
import { Typography } from '@src/components/ui/typography';

export const CredoSection = () => {
  const credos = [
    {
      name: 'Vocación',
      description:
        'Asumimos la vocación que Dios nos dio, respondiendo a su llamado a participar en su obra redentora.',
      bibleVerse:
        '"Porque somos hechura de Dios, creados en Cristo Jesús para buenas obras, las cuales Dios dispuso de antemano a fin de que las pongamos en práctica." (Efesios 2:10)',
    },
    {
      name: 'Testimonio',
      description:
        'Damos testimonio de la persona de Cristo en nuestras vidas, reflejando su amor y verdad.',
      bibleVerse:
        '"Sin embargo, considero que mi vida carece de valor para mí mismo, con tal de que termine mi carrera y lleve a cabo el servicio que me ha encomendado el Señor Jesús, que es el de dar testimonio del evangelio de la gracia de Dios." (Hechos 20:24)',
    },
    {
      name: 'Redención',
      description:
        'Somos seres humanos comunes y corrientes que reconocen sus fallas, pero que celebran la redención que da Cristo.',
      bibleVerse:
        '"Pues todos han pecado y están privados de la gloria de Dios, pero por su gracia son justificados gratuitamente mediante la redención que Cristo Jesús efectuó." (Romanos 3:23-24)',
    },
    {
      name: 'Misericordia',
      description: 'Creemos en la misericordia y el perdón, siguiendo el ejemplo de Cristo.',
      bibleVerse: '"Sed misericordiosos, así como vuestro Padre es misericordioso." (Lucas 6:36)',
    },
    {
      name: 'Unidad',
      description:
        'Fomentamos la comunión entre hermanos y hermanas, reconociendo el valor y la importancia de cada miembro.',
      bibleVerse:
        '"Ámense los unos a los otros con amor fraternal, respetándose y honrándose mutuamente." (Romanos 12:10)',
    },
    {
      name: 'Un lugar de voluntarios',
      description:
        'Creemos que acercarse a Dios es un acto voluntario, una respuesta libre al amor de Dios.',
      bibleVerse:
        '"Venid a mí, todos los que estáis trabajados y cargados, y yo os haré descansar." (Mateo 11:28)',
    },
    {
      name: 'Servicio',
      description:
        'Nos comprometemos a compartir nuestro tiempo y esfuerzo para brindar bienestar a los demás, siguiendo el ejemplo de Jesús que vino a servir y no a ser servido.',
      bibleVerse:
        '"Porque ni aun el Hijo del Hombre vino para ser servido, sino para servir y para dar su vida en rescate por muchos." (Marcos 10:45)',
    },
  ];

  return (
    <Container>
      <div className="py-24 sm:py-32">
        <Typography component="h2" variant="h1" className="text-center dark:text-white">
          Nuestro Credo
        </Typography>

        <dl className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 text-base/7 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {credos.map(credo => (
            <div key={credo.name}>
              <dt className="text-lg font-bold text-blue-700">{credo.name}</dt>
              <dd className="mt-2 text-gray-800 dark:text-gray-100">{credo.description}</dd>
              <dd className="mt-3 italic text-gray-600 dark:text-gray-400">{credo.bibleVerse}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Container>
  );
};
