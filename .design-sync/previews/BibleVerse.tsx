import { BibleVerse } from "@idcr/web";

/** A single verse — `fromVerse === toVerse` renders the citation as "3:16". */
export const SingleVerse = () => (
  <div className="max-w-2xl">
    <BibleVerse
      book="Juan"
      chapter={3}
      fromVerse={16}
      toVerse={16}
      verseContent="Porque tanto amó Dios al mundo que dio a su Hijo unigénito, para que todo el que cree en él no se pierda, sino que tenga vida eterna."
    />
  </div>
);

/** A range — the citation collapses to "8:38-39". */
export const VerseRange = () => (
  <div className="max-w-2xl">
    <BibleVerse
      book="Romanos"
      chapter={8}
      fromVerse={38}
      toVerse={39}
      verseContent="Pues estoy convencido de que ni la muerte ni la vida, ni los ángeles ni los demonios, ni lo presente ni lo por venir, ni los poderes, ni lo alto ni lo profundo, ni cosa alguna de toda la creación podrá apartarnos del amor que Dios nos ha manifestado en Cristo Jesús nuestro Señor."
    />
  </div>
);

/**
 * Its only real call site: the contact page's left column, sitting under the
 * image inside a `hidden lg:block` (ContactForm.tsx:117-121).
 */
export const InContactPage = () => (
  <div className="max-w-sm">
    <img
      src="https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=780&q=80"
      alt="Personas conversando después del culto"
      className="h-auto w-full rounded-2xl shadow-lg"
    />
    <div className="mt-6">
      <BibleVerse
        book="Mateo"
        chapter={11}
        fromVerse={28}
        toVerse={28}
        verseContent="Vengan a mí todos ustedes que están cansados y agobiados, y yo les daré descanso."
      />
    </div>
  </div>
);
