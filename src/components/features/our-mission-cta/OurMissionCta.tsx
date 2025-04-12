import { BLOCKS } from "@contentful/rich-text-types";

import {
  CommonNode,
  documentToReactComponents,
} from "@contentful/rich-text-react-renderer";
import { Typography } from "@src/components/ui/typography";
import { Link } from "@src/i18n/routing";
import Image from "next/image";
import { ReactNode } from "react";

const options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (node: CommonNode, children: ReactNode) => (
      <Typography
        component="p"
        variant="body1"
        className="mt-6 text-xl leading-8"
      >
        {children}
      </Typography>
    ),
  },
};

type OurMissionCtaProps = {
  content: {
    headline: string;
    bodyText: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json: any;
    };
    ctaText: string;
    targetPage: {
      slug: string;
    };
    image: {
      title: string;
      url: string;
    };
    additionalImagesCollection: {
      items: {
        title: string;
        url: string;
      }[];
    };
  };
};

export const OurMissionCta = ({ content }: OurMissionCtaProps) => {
  const bodyText = documentToReactComponents(content.bodyText.json, options);

  return (
    <div className="overflow-hidden bg-white dark:bg-blue-900/80 py-32">
      <div className="mx-auto max-w-7xl px-6 lg:flex lg:px-8">
        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-12 gap-y-16 lg:mx-0 lg:min-w-full lg:max-w-none lg:flex-none lg:gap-y-8">
          <div className="lg:col-end-1 lg:w-full lg:max-w-lg lg:pb-8">
            <Typography
              component="h2"
              variant="h2"
              className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl"
            >
              {content?.headline}
            </Typography>

            {bodyText}

            <div className="mt-10 flex">
              <Link
                href={`/${content?.targetPage?.slug}`}
                className="rounded-3xl bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {content?.ctaText}
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-6 sm:gap-8 lg:contents">
            <div className="w-0 flex-auto lg:ml-auto lg:w-auto lg:flex-none lg:self-end">
              <Image
                width={800}
                height={800}
                alt={content.image.title}
                src={content.image.url}
                className="aspect-[7/5] w-[37rem] max-w-none rounded-2xl bg-gray-50 object-cover"
              />
            </div>
            <div className="contents lg:col-span-2 lg:col-end-2 lg:ml-auto lg:flex lg:w-[37rem] lg:items-start lg:justify-end lg:gap-x-8">
              <div className="order-first flex w-64 flex-none justify-end self-end lg:w-auto">
                <Image
                  width={800}
                  height={800}
                  alt={content.additionalImagesCollection.items[0].title}
                  src={content.additionalImagesCollection.items[0].url}
                  className="aspect-[4/3] w-[24rem] max-w-none flex-none rounded-2xl bg-gray-50 object-cover"
                />
              </div>
              <div className="flex w-96 flex-auto justify-end lg:w-auto lg:flex-none">
                <Image
                  width={800}
                  height={800}
                  alt={content.additionalImagesCollection.items[1].title}
                  src={content.additionalImagesCollection.items[1].url}
                  className="aspect-[7/5] w-[37rem] max-w-none flex-none rounded-2xl bg-gray-50 object-cover"
                />
              </div>
              <div className="hidden sm:block sm:w-0 sm:flex-auto lg:w-auto lg:flex-none">
                <Image
                  width={800}
                  height={800}
                  alt={content.additionalImagesCollection.items[2].title}
                  src={content.additionalImagesCollection.items[2].url}
                  className="aspect-[4/3] w-[24rem] max-w-none rounded-2xl bg-gray-50 object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
