import { useTranslations } from "next-intl";
import { Typography } from "@src/components/ui/typography";
import type { ScriptureRef } from "@src/types/Sermon";

interface ScriptureReferencesProps {
  readonly refs: ScriptureRef[];
}

function formatRef(ref: ScriptureRef): string {
  const verseRange =
    ref.toVerse != null
      ? `${ref.fromVerse}-${ref.toVerse}`
      : `${ref.fromVerse}`;
  return `${ref.book} ${ref.chapter}:${verseRange} (${ref.bibleVersion})`;
}

export function ScriptureReferences({ refs }: ScriptureReferencesProps) {
  const t = useTranslations("Sermons");

  if (!refs.length) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4">
      <Typography
        component="h3"
        variant="h3"
        className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {t("scripture")}
      </Typography>

      <ul className="flex flex-col gap-3">
        {refs.map((ref, i) => (
          <li key={i} className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              {formatRef(ref)}
            </span>
            {ref.verseContent && (
              <blockquote className="border-l-2 border-primary pl-3 text-sm italic text-muted-foreground">
                {ref.verseContent}
              </blockquote>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
