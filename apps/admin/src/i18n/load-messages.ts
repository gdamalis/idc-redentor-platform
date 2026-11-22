import type { Locale } from "./config";

import esARCore from "../../messages/es-AR.json";
import enUSCore from "../../messages/en-US.json";
import esARContentShell from "../../messages/content/shell.es-AR.json";
import enUSContentShell from "../../messages/content/shell.en-US.json";
import esARContentMedia from "../../messages/content/media.es-AR.json";
import enUSContentMedia from "../../messages/content/media.en-US.json";
import esARContentSite from "../../messages/content/site.es-AR.json";
import enUSContentSite from "../../messages/content/site.en-US.json";
import esARContentEditorial from "../../messages/content/editorial.es-AR.json";
import enUSContentEditorial from "../../messages/content/editorial.en-US.json";
import esARContentSermons from "../../messages/content/sermons.es-AR.json";
import enUSContentSermons from "../../messages/content/sermons.en-US.json";

/**
 * Statically merges the core admin message catalog with per-domain content
 * namespace JSON files so Waves 3–4 (`ICR-196`, `ICR-198`, `ICR-199`, `ICR-200`)
 * edit completely disjoint message files with zero merge conflicts.
 */
export function loadMessages(locale: Locale) {
  if (locale === "en-US") {
    return {
      ...enUSCore,
      content: enUSContentShell,
      contentMedia: enUSContentMedia,
      contentSite: enUSContentSite,
      contentEditorial: enUSContentEditorial,
      contentSermons: enUSContentSermons,
    };
  }

  return {
    ...esARCore,
    content: esARContentShell,
    contentMedia: esARContentMedia,
    contentSite: esARContentSite,
    contentEditorial: esARContentEditorial,
    contentSermons: esARContentSermons,
  };
}
