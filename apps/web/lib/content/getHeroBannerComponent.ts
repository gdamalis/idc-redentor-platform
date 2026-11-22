import { getSection } from "./getSection";
import type { SectionView } from "./types";

export async function getHeroBannerComponent(
  name: string,
  locale: string,
  isDraftMode = false,
): Promise<SectionView | undefined> {
  return getSection(name, locale, isDraftMode);
}
