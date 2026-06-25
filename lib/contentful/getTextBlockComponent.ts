import { getSection } from "./getSection";

export async function getTextBlockComponent(
  name: string,
  locale: string,
  isDraftMode = false,
) {
  return getSection(name, locale, isDraftMode);
}
