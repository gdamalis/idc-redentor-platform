import { shouldUseDraftMode } from "@lib/contentful/draftMode";
import { getChurchInfoTopic } from "@lib/contentful/getChurchInfoTopic";
import { articleRichTextOptions } from "@lib/contentful/rich-text-options";
import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

type TopicPageParams = {
  locale: string;
  topic: string;
};

type TopicPageProps = Readonly<{
  params: Promise<TopicPageParams>;
}>;

export async function generateMetadata({
  params,
}: TopicPageProps): Promise<Metadata> {
  const { locale, topic } = await params;

  const isEnabled = await shouldUseDraftMode();
  const topicData = await getChurchInfoTopic(topic, locale, isEnabled);

  if (!topicData) {
    return { title: "Not found" };
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  return {
    title: topicData.name,
    description: topicData.shortDescription ?? undefined,
    alternates: {
      canonical: `${baseUrl}/${locale}/${topic}`,
    },
  };
}

export default async function TopicPage({ params }: TopicPageProps) {
  const { locale, topic } = await params;
  setRequestLocale(locale);

  const isEnabled = await shouldUseDraftMode();
  const topicData = await getChurchInfoTopic(topic, locale, isEnabled);

  if (!topicData) {
    notFound();
  }

  let richTextContent = null;
  if (topicData.body?.json) {
    try {
      richTextContent = documentToReactComponents(
        topicData.body.json,
        articleRichTextOptions,
      );
    } catch (error) {
      console.error("Error rendering rich text for topic:", topic, error);
    }
  }

  return (
    <main>
      <section className="relative pt-32 pb-10 bg-muted/30">
        <Container size="sm">
          <Typography
            component="h1"
            variant="h1"
            className="font-serif text-4xl font-bold leading-tight sm:text-5xl"
          >
            {topicData.name}
          </Typography>
          {topicData.shortDescription && (
            <Typography
              component="p"
              variant="body1"
              className="mt-4 text-lg text-muted-foreground leading-relaxed"
            >
              {topicData.shortDescription}
            </Typography>
          )}
        </Container>
      </section>

      <Container size="sm" className="pt-10 pb-20">
        <div className="rich-text-content flex flex-col gap-y-4">
          {richTextContent}
        </div>
      </Container>
    </main>
  );
}
