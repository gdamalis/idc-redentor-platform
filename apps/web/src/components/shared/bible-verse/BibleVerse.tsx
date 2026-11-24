import { Typography } from "@src/components/ui/typography";

interface BibleVerseProps {
  readonly book: string;
  readonly chapter: number | string;
  readonly fromVerse: number | string;
  readonly toVerse?: number | string | null;
  readonly verseContent: string;
  readonly className?: string;
}

export default function BibleVerse({
  book,
  chapter,
  fromVerse,
  toVerse,
  verseContent,
  className = "",
}: BibleVerseProps) {
  const fromStr = String(fromVerse);
  const toStr = toVerse != null ? String(toVerse).trim() : "";
  const verse = toStr !== "" && toStr !== fromStr ? `${fromStr}-${toStr}` : fromStr;

  return (
    <figure className={`${className}`}>
      <blockquote className="text-lg text-gray-900">
        <Typography component="p" variant="body1">
          &quot;{verseContent}&quot;
        </Typography>
      </blockquote>
      <figcaption className="mt-2 flex gap-x-2">
        —
        <cite className="text-base font-semibold text-gray-900 dark:text-gray-300">
          {book} {chapter}:{verse}
        </cite>
      </figcaption>
    </figure>
  );
}
