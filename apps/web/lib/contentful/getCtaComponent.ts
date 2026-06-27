import { getSection } from "./getSection";

export async function getCtaComponent(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  return getSection(name, locale, isDraftMode);
}
