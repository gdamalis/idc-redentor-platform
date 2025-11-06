 
import { documentToPlainTextString } from "@contentful/rich-text-plain-text-renderer";
import { Container } from "@src/components/ui/container";
import { Typography } from "@src/components/ui/typography";

type CreedSectionProps = {
  content: {
    title: string;
    description: {
      json: any;
    };
    creedItems: {
      title: string;
      description: {
        json: any;
      };
      bibleVerse: {
        json: any;
      };
      image: {
        title: string;
        url: string;
      };
    }[];
  };
};

export const CreedSection = ({ content }: CreedSectionProps) => {
  const description = documentToPlainTextString(content.description?.json);

  return (
    <Container>
      <div className="py-24 sm:py-32">
        <Typography component="h2" variant="h1" className="text-center">
          {content?.title}
        </Typography>
        <Typography component="p" variant="body1" className="text-center">
          {description}
        </Typography>

        <dl className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 text-base/7 sm:grid-cols-2 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {content?.creedItems?.map((credo: any) => {
            const description = documentToPlainTextString(
              credo.description.json,
            );
            const bibleVerse = documentToPlainTextString(credo.bibleVerse.json);

            return (
              <div key={credo.title}>
                <dt className="text-lg font-bold text-blue-700">
                  {credo.title}
                </dt>
                <dd className="mt-2 text-gray-800 dark:text-gray-100">
                  {description}
                </dd>
                <dd className="mt-3 italic text-gray-600 dark:text-gray-400">
                  {bibleVerse}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </Container>
  );
};
