import Image from "next/image";
import { BLOCKS } from "@contentful/rich-text-types";
import type { CommonNode, Options } from "@contentful/rich-text-react-renderer";
import { articleRichTextOptions } from "@lib/contentful/rich-text-options";
import type { Sermon } from "@src/types/Sermon";
import { SermonAudioPlayer } from "@src/components/features/sermon-details/SermonAudioPlayer";
import { PdfDownloadButton } from "@src/components/features/sermon-details/PdfDownloadButton";

type AssetBlock = NonNullable<Sermon["content"]>["links"]["assets"]["block"][number];

/**
 * Legacy Contentful sermon rich-text options kept test-only for `ICR-202` rich-text
 * parity specs until `ICR-207` removes `@contentful/*` and `lib/contentful/`.
 */
export function buildSermonRichTextOptions(
  assetBlocks: AssetBlock[],
  audioTitleFallback = "",
): Options {
  const assetsById = new Map(assetBlocks.map((asset) => [asset.sys.id, asset]));

  return {
    renderMark: articleRichTextOptions.renderMark,
    renderNode: {
      ...articleRichTextOptions.renderNode,
      [BLOCKS.EMBEDDED_ASSET]: (node: CommonNode) => {
        const id = (node?.data?.target as { sys?: { id?: string } } | undefined)?.sys?.id;
        const asset = id ? assetsById.get(id) : undefined;
        if (!asset) return null;

        const contentType = asset.contentType ?? "";

        if (contentType.startsWith("audio/")) {
          return (
            <div className="my-4">
              <SermonAudioPlayer src={asset.url} title={asset.title || audioTitleFallback} />
            </div>
          );
        }

        if (contentType === "application/pdf") {
          return (
            <div className="my-4">
              <PdfDownloadButton
                pdfSummary={{ url: asset.url, title: asset.title }}
                label={asset.title || undefined}
              />
            </div>
          );
        }

        if (contentType.startsWith("image/")) {
          return (
            <span className="my-4 block">
              <Image
                src={asset.url}
                alt={asset.title || ""}
                width={asset.width ?? 1200}
                height={asset.height ?? 630}
                className="h-auto w-full rounded-md"
              />
            </span>
          );
        }

        return null;
      },
    },
  };
}
