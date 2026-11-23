import type { SectionFields, SectionLayout } from "@idcr/content";

export interface SectionLayoutFieldConfig {
  readonly showHeadline: boolean;
  readonly requireHeadlineEs: boolean;
  readonly showSubHeadline: boolean;
  readonly showBody: boolean;
  readonly requireBodyEs: boolean;
  readonly showCtaText: boolean;
  readonly requireCtaTextEs: boolean;
  readonly showTargetPage: boolean;
  readonly requireTargetPage: boolean;
  readonly showUrlParameters: boolean;
  readonly showSingleImage: boolean;
  readonly requireSingleImage: boolean;
  readonly showImageList: boolean;
}

const SECTION_LAYOUT_FIELD_CONFIG: Readonly<
  Record<SectionLayout, SectionLayoutFieldConfig>
> = {
  hero: {
    showHeadline: true,
    requireHeadlineEs: true,
    showSubHeadline: true,
    showBody: true,
    requireBodyEs: true,
    showCtaText: true,
    requireCtaTextEs: true,
    showTargetPage: true,
    requireTargetPage: true,
    showUrlParameters: false,
    showSingleImage: true,
    requireSingleImage: true,
    showImageList: false,
  },
  cta: {
    showHeadline: true,
    requireHeadlineEs: true,
    showSubHeadline: false,
    showBody: false,
    requireBodyEs: false,
    showCtaText: true,
    requireCtaTextEs: true,
    showTargetPage: true,
    requireTargetPage: false,
    showUrlParameters: true,
    showSingleImage: false,
    requireSingleImage: false,
    showImageList: false,
  },
  textBlock: {
    showHeadline: true,
    requireHeadlineEs: false,
    showSubHeadline: false,
    showBody: true,
    requireBodyEs: true,
    showCtaText: false,
    requireCtaTextEs: false,
    showTargetPage: false,
    requireTargetPage: false,
    showUrlParameters: false,
    showSingleImage: false,
    requireSingleImage: false,
    showImageList: true,
  },
};

/**
 * Returns the layout-keyed field visibility and publish-requirement config
 * (`hero`, `cta`, `textBlock` — no `duplex`). On `hero`, surfaces `urlParameters`
 * only if already populated in the draft so existing data is never hidden.
 */
export function getSectionLayoutFieldConfig(
  layout: SectionLayout | undefined,
  draft?: Pick<SectionFields, "urlParameters">,
): SectionLayoutFieldConfig {
  const effective: SectionLayout = layout ?? "textBlock";
  const base = SECTION_LAYOUT_FIELD_CONFIG[effective];
  if (effective === "hero" && draft?.urlParameters?.trim()) {
    return { ...base, showUrlParameters: true };
  }
  return base;
}
