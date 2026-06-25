import { getSection } from "./getSection";

export async function getHeroBannerComponent(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  return getSection(name, locale, isDraftMode);
}
