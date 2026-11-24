import { infoCommunityPreset, renderRichText } from "@lib/content/rich-text";
import type { SectionView } from "@lib/content/types";
import { Container } from "@src/components/ui/container";

interface InfoCommunityProps {
  readonly content: SectionView;
}

export default function InfoCommunity({ content }: InfoCommunityProps) {
  const bodyText = content?.body
    ? renderRichText(content.body, infoCommunityPreset)
    : null;

  return (
    <div className="bg-muted/50">
      <Container
        size="md"
        className="py-16 text-center md:space-y-6 sm:py-24"
      >
        {bodyText}
      </Container>
    </div>
  );
}
