import { Typography } from "@src/components/ui/typography";

type BibleVerseProps = {
  book: string;
  chapter: number;
  fromVerse: number;
  toVerse: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verseContent: any;
  className?: string;
};

export default function BibleVerse({
  book,
  chapter,
  fromVerse,
  toVerse,
  verseContent,
  className = "",
}: Readonly<BibleVerseProps>) {
  const verse = fromVerse === toVerse ? fromVerse : `${fromVerse}-${toVerse}`;

  return (
    <figure className={`${className}`}>
      <blockquote className="text-lg text-gray-900">
        <Typography component="p" variant="body1">
          &quot;{verseContent}&quot;
        </Typography>
      </blockquote>
      <figcaption className="mt-2 flex gap-x-2">
        —<cite className="text-base font-semibold text-gray-900 dark:text-gray-300">
          {book} {chapter}:{verse}
        </cite>
      </figcaption>
    </figure>
  );
}
