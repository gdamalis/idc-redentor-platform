import { HeartIcon } from "@heroicons/react/24/outline";
import Image from "next/image";

import {
  CommonNode,
  documentToReactComponents,
} from "@contentful/rich-text-react-renderer";
import { BLOCKS } from "@contentful/rich-text-types";
import { Typography } from "@src/components/ui/typography";
import { ReactNode } from "react";

const options = {
  renderNode: {
    [BLOCKS.PARAGRAPH]: (node: CommonNode, children: ReactNode) => (
      <Typography component="p" variant="body1">
        {children}
      </Typography>
    ),
    [BLOCKS.UL_LIST]: (node: CommonNode, children: ReactNode) => (
      <ul className="mt-8 space-y-8 text-gray-600">{children}</ul>
    ),
    [BLOCKS.LIST_ITEM]: (node: CommonNode, children: ReactNode) => (
      <li className="flex gap-x-3">
        <HeartIcon
          aria-hidden="true"
          className="mt-1 h-8 w-8 flex-none text-primary"
        />
        <span className="flex items-center">
          <strong className="font-semibold text-gray-900">{children}</strong>
        </span>
      </li>
    ),
  },
};

type OurMissionSectionProps = {
  content: {
    headline: string;
    bodyText: {
       
      json: any;
    };
    image: {
      title: string;
      url: string;
    };
  };
};

export const OurMissionSection = ({ content }: OurMissionSectionProps) => {
  const bodyText = documentToReactComponents(content?.bodyText?.json, options);

  return (
    <div className="relative isolate overflow-hidden px-6 pb-24 pt-6 sm:pb-32 sm:pt-6 lg:overflow-visible lg:px-0">
      <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-8 gap-y-8 lg:mx-0 lg:max-w-none lg:grid-cols-2 lg:items-start lg:gap-y-6">
        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-1 lg:mx-auto lg:grid lg:w-full lg:max-w-6xl lg:grid-cols-2 lg:gap-x-8 lg:px-8">
          <div className="lg:pr-4">
            <div className="lg:max-w-lg">
              <Typography
                component="h1"
                variant="h1"
                className="mt-2 text-pretty text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl"
              >
                {content?.headline}
              </Typography>
            </div>
          </div>
        </div>
        <div className="-ml-12 -mt-12 p-12 pb-6 lg:sticky lg:top-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:overflow-hidden">
          <Image
            alt={content?.image.title}
            src={content?.image.url}
            width={768}
            height={432}
            className="w-[48rem] max-w-none rounded-xl bg-gray-900 shadow-xl ring-1 ring-gray-400/10"
          />
        </div>
        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-2 lg:mx-auto lg:grid lg:w-full lg:max-w-6xl lg:grid-cols-2 lg:gap-x-8 lg:px-8">
          <div className="lg:pr-4">
            <div className="max-w-xl text-base/7 text-gray-700 space-y-4 lg:max-w-lg">
              {bodyText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
