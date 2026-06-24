import { Container } from "@src/components/ui/container";
import { getTranslations } from "next-intl/server";
import { PostActions } from "@src/components/features/blog-post-details/PostActions";
import type { Sermon } from "@src/types/Sermon";
import { SermonHeader } from "./SermonHeader";
import { SermonAudioPlayer } from "./SermonAudioPlayer";
import { SermonContent } from "./SermonContent";
import { PdfDownloadButton } from "./PdfDownloadButton";
import { ScriptureReferences } from "./ScriptureReferences";
import { RelatedSermons } from "./RelatedSermons";

interface SermonDetailsProps {
  readonly sermon: Sermon;
  readonly relatedSermons: Sermon[];
  readonly locale: string;
  readonly initialLikeCount: number;
  readonly initialHasLiked: boolean;
}

export default async function SermonDetails({
  sermon,
  relatedSermons,
  locale,
  initialLikeCount,
  initialHasLiked,
}: SermonDetailsProps) {
  if (!sermon) return null;

  const t = await getTranslations("Sermons");
  const isEnUs = locale === "en-US";

  return (
    <Container className="pt-28 pb-20 lg:py-32">
      <div className="mx-auto max-w-2xl flex flex-col gap-y-4">
        {/* 1. Header */}
        <SermonHeader sermon={sermon} />

        {/* 2. Audio player (when audio present) */}
        {sermon.audio && (
          <SermonAudioPlayer
            src={sermon.audio.url}
            title={sermon.title}
            durationSeconds={sermon.durationSeconds}
          />
        )}

        {/* 3. Audio-in-Spanish note (audio present AND locale is en-US) */}
        {sermon.audio && isEnUs && (
          <p className="text-sm text-muted-foreground">
            {t("audio-in-spanish")}
          </p>
        )}

        {/* 4. PDF summary download */}
        {sermon.pdfSummary && (
          <PdfDownloadButton pdfSummary={sermon.pdfSummary} />
        )}

        {/* 5. Rich-text body */}
        {sermon.content && <SermonContent content={sermon.content} />}

        {/* 6. Scripture references */}
        {sermon.scriptureReferences && sermon.scriptureReferences.length > 0 && (
          <ScriptureReferences refs={sermon.scriptureReferences} />
        )}

        {/* 7. Like + Share */}
        <PostActions
          slug={sermon.slug}
          basePath="predicas"
          likeKey={`predicas/${sermon.slug}`}
          title={sermon.title}
          featuredImageUrl={sermon.featuredImage.url}
          initialLikeCount={initialLikeCount}
          initialHasLiked={initialHasLiked}
        />

        {/* 8. Related sermons */}
        {relatedSermons.length > 0 && (
          <RelatedSermons sermons={relatedSermons as NonNullable<Sermon["relatedSermons"]>} locale={locale} />
        )}
      </div>
    </Container>
  );
}
