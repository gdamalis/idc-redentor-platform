import { InformationCircleIcon } from "@heroicons/react/24/outline";
import Image from "next/image";

type FeaturedImageProps = {
  url: string;
  title: string;
  width?: number;
  height?: number;
};

export function FeaturedImage({
  url,
  title,
  width = 800,
  height = 450,
}: Readonly<FeaturedImageProps>) {
  return (
    <figure className="relative">
      <Image
        src={url}
        alt={title}
        width={width}
        height={height}
        className="aspect-video rounded-xl bg-gray-50 object-cover"
        priority
      />
      <figcaption className="mt-2 flex items-center gap-x-2 text-sm leading-6 text-gray-500">
        <InformationCircleIcon
          aria-hidden="true"
          className="mt-0.5 h-5 w-5 flex-none text-gray-300"
        />
        <span>{title}</span>
      </figcaption>
    </figure>
  );
} 