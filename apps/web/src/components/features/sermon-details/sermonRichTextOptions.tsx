import Image from "next/image";
import { BLOCKS } from "@contentful/rich-text-types";
import type { CommonNode, Options } from "@contentful/rich-text-react-renderer";
import { articleRichTextOptions } from "@lib/contentful/rich-text-options";
import type { Sermon } from "@src/types/Sermon";
import { SermonAudioPlayer } from "./SermonAudioPlayer";
import { PdfDownloadButton } from "./PdfDownloadButton";

type AssetBlock = NonNullable<Sermon["content"]>["links"]["assets"]["block"][number];

/**
 * Rich-text options for a sermon body that may interleave embedded media
 * (multi-preacher services: per-segment audio player + PDF download inside the body).
 *
 * It reuses the base article renderers (paragraph / headings / lists / blockquote)
 * and adds a `BLOCKS.EMBEDDED_ASSET` handler that resolves the asset from the
 * GraphQL-fetched `content.links.assets.block` set by `node.data.target.sys.id`,
 * then renders by contentType: `audio/*` → player, `application/pdf` → download,
 * `image/*` → image. Blog posts keep using the static `articleRichTextOptions`.
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
