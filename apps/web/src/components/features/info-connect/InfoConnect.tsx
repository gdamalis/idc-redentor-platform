import { infoConnectPreset, renderRichText } from "@lib/content/rich-text";
import type { SectionView } from "@lib/content/types";
import { Container } from "@src/components/ui/container";

interface InfoConnectProps {
  readonly content: SectionView;
}

export function InfoConnect({ content }: InfoConnectProps) {
  const bodyText = content?.body
    ? renderRichText(content.body, infoConnectPreset)
    : null;

  return (
    <div className="bg-gray-50 dark:bg-slate-900/50 transition-colors">
      <Container size="md" className="py-16 text-center sm:py-24">
        {bodyText}
      </Container>
    </div>
  );
}
