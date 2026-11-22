export type SiteTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export type SiteErrorContext =
  | "section"
  | "beliefCollection"
  | "eventBanner"
  | "seoEntry"
  | "navigationMenu"
  | "footer"
  | "location"
  | "singleEmailForm"
  | "contactForm";

const BELIEF_ITEM_PATH_RE = /^items\.(\d+)\.(title|description|kind)(?:\.(es-AR|en-US))?(?:\..*)?$/;
const MENU_ITEM_PATH_RE = /^menuItems\.(\d+)\.(groupName|groupLink)(?:\.(es-AR|en-US))?$/;
const SOCIAL_LINK_PATH_RE = /^socialLinks\.(\d+)\.(platform|url)$/;
const CONTACT_FIELD_PATH_RE = /^fields\.(\d+)\.(name|placeholder|values)(?:\.(es-AR|en-US))?(?:\..*)?$/;

function isRichTextProfileError(rawMessages: readonly string[]): boolean {
  return rawMessages.some((msg) => {
    const lower = msg.toLowerCase();
    return (
      lower.includes("node") ||
      lower.includes("mark") ||
      lower.includes("profile") ||
      lower.includes("allowed")
    );
  });
}

/**
 * Builds a `customFieldErrorMap` callback for `EntryEditor` covering all 9
 * site-content schemas so zero raw Zod strings ever surface in the UI (`ICR-198` AC8).
 */
export function createSiteFieldErrorMapper(
  t: SiteTranslator,
  context: SiteErrorContext,
): (path: string, rawMessages: readonly string[]) => string | undefined {
  return (path, rawMessages) => {
    // Structural immutable field refusal
    if (path === "machineName" || path === "layout" || path === "kind") {
      return t("errors.immutableField");
    }

    // Belief collection indexed item errors
    if (context === "beliefCollection") {
      if (path === "items") return t("errors.beliefItemsEmpty");
      if (path === "title" || path === "title.es-AR") return t("errors.titleEs");
      if (path === "title.en-US") return t("errors.titleEn");
      if (path.startsWith("description.es-AR") || path === "description") {
        return isRichTextProfileError(rawMessages)
          ? t("errors.richTextInline")
          : t("errors.descriptionEs");
      }
      if (path.startsWith("description.en-US")) {
        return isRichTextProfileError(rawMessages)
          ? t("errors.richTextInline")
          : t("errors.descriptionEn");
      }
      const itemMatch = BELIEF_ITEM_PATH_RE.exec(path);
      if (itemMatch) {
        const index = Number(itemMatch[1]) + 1;
        const field = itemMatch[2];
        const loc = itemMatch[3];
        if (field === "title") {
          return loc === "en-US"
            ? t("errors.beliefItemTitleEn", { index })
            : t("errors.beliefItemTitleEs", { index });
        }
        if (field === "description") {
          if (isRichTextProfileError(rawMessages)) {
            return t("errors.richTextInline");
          }
          return loc === "en-US"
            ? t("errors.beliefItemDescriptionEn", { index })
            : t("errors.beliefItemDescriptionEs", { index });
        }
        if (field === "kind") {
          return t("errors.beliefItemKind", { index });
        }
      }
    }

    // Section errors
    if (context === "section") {
      if (path === "headline" || path === "headline.es-AR") {
        return t("errors.headlineEs");
      }
      if (path === "body" || path.startsWith("body.")) {
        return isRichTextProfileError(rawMessages)
          ? t("errors.richTextInline")
          : t("errors.bodyEs");
      }
      if (path === "ctaText" || path === "ctaText.es-AR") {
        return t("errors.ctaTextEs");
      }
      if (path === "targetPage") return t("errors.targetPage");
      if (path === "image") return t("errors.image");
    }

    // Event banner errors
    if (context === "eventBanner") {
      if (path === "event" || path === "event.name" || path === "event.name.es-AR") {
        return t("errors.eventNameEs");
      }
      if (path === "event.dayOfWeek" || path === "event.dayOfWeek.es-AR") {
        return t("errors.eventDayEs");
      }
      if (path === "event.time") return t("errors.eventTime");
      if (path === "event.date") return t("errors.eventDate");
      if (path === "image") return t("errors.image");
    }

    // SEO entry errors
    if (context === "seoEntry") {
      if (path === "title" || path === "title.es-AR") return t("errors.titleEs");
      if (path === "description" || path === "description.es-AR") {
        return t("errors.descriptionEs");
      }
    }

    // Navigation menu errors
    if (context === "navigationMenu") {
      if (path === "menuItems") return t("errors.menuItemsEmpty");
      const menuMatch = MENU_ITEM_PATH_RE.exec(path);
      if (menuMatch) {
        const index = Number(menuMatch[1]) + 1;
        return menuMatch[2] === "groupLink"
          ? t("errors.menuItemLink", { index })
          : t("errors.menuItemNameEs", { index });
      }
    }

    // Footer errors
    if (context === "footer") {
      if (path === "logo") return t("errors.logo");
      if (path === "shortDescription" || path === "shortDescription.es-AR") {
        return t("errors.shortDescriptionEs");
      }
      const socialMatch = SOCIAL_LINK_PATH_RE.exec(path);
      if (socialMatch) {
        const index = Number(socialMatch[1]) + 1;
        return socialMatch[2] === "platform"
          ? t("errors.socialPlatform", { index })
          : t("errors.socialUrl", { index });
      }
    }

    // Location errors
    if (context === "location") {
      if (path === "addressLine1") return t("errors.addressLine1");
      if (path === "city") return t("errors.city");
      if (path === "country") return t("errors.country");
      if (path === "googleMapsUrl") return t("errors.googleMapsUrl");
      if (path === "mapEmbedUrl") return t("errors.mapEmbedUrl");
      if (path === "lat") return t("errors.lat");
      if (path === "lon") return t("errors.lon");
    }

    // Single email form errors
    if (context === "singleEmailForm") {
      if (path === "title" || path === "title.es-AR") return t("errors.titleEs");
      if (path === "ctaText" || path === "ctaText.es-AR") {
        return t("errors.ctaTextEs");
      }
    }

    // Contact form errors
    if (context === "contactForm") {
      if (path === "title" || path === "title.es-AR") return t("errors.titleEs");
      if (path === "description" || path === "description.es-AR") {
        return t("errors.descriptionEs");
      }
      if (path === "ctaText" || path === "ctaText.es-AR") {
        return t("errors.ctaTextEs");
      }
      if (path === "bibleVerseId") return t("errors.bibleVerse");
      if (path === "agreementNote" || path.startsWith("agreementNote.")) {
        return isRichTextProfileError(rawMessages)
          ? t("errors.richTextInlineLink")
          : t("errors.agreementNoteEs");
      }
      if (path === "fields") return t("errors.contactFieldsEmpty");
      const fieldMatch = CONTACT_FIELD_PATH_RE.exec(path);
      if (fieldMatch) {
        const index = Number(fieldMatch[1]) + 1;
        if (fieldMatch[2] === "name") {
          return t("errors.contactFieldNameEs", { index });
        }
      }
    }

    return undefined;
  };
}
