import { useTranslations } from "next-intl";
import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";
import type { Sermon } from "@src/types/Sermon";
import { SermonCard } from "./SermonCard";

interface SermonSectionProps {
  readonly sermons: Sermon[];
}

export function SermonSection({ sermons }: SermonSectionProps) {
  const t = useTranslations("Sermons");

  const sorted = [...sermons].sort(
    (a, b) =>
      new Date(b.sermonDate).getTime() - new Date(a.sermonDate).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <section className="py-24 bg-background">
        <Container>
          <div className="flex items-center justify-center py-16">
            <Typography
              component="p"
              variant="body1"
              className="text-muted-foreground text-center"
            >
              {t("no-sermons")}
            </Typography>
          </div>
        </Container>
      </section>
    );
  }

  return (
    <section className="py-12 bg-background">
      <Container>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {sorted.map((sermon, index) => (
            <SermonCard key={sermon.sys.id} sermon={sermon} index={index} />
          ))}
        </div>
      </Container>
    </section>
  );
}
