import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";

type ComponentCtaProps = {
  content: {
    headline: string;
    ctaText: string;
    targetPage?: {
      slug: string;
    };
    urlParameters?: string;
  };
};

export const ComponentCta = ({ content }: ComponentCtaProps) => {
  const targetUrl = content?.targetPage?.slug 
    ? `/${content.targetPage.slug}${content.urlParameters ? `?${content.urlParameters}` : ''}`
    : '#';

  return (
    <div className="bg-blue-700">
      <div className="px-6 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Typography
            component="h2"
            variant="h2"
            className="text-3xl font-bold tracking-tight text-white sm:text-4xl"
          >
            {content?.headline}
          </Typography>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href={targetUrl}
              className="rounded-3xl bg-white px-3.5 py-2.5 text-sm font-semibold text-blue-600 shadow-sm hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {content?.ctaText}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
