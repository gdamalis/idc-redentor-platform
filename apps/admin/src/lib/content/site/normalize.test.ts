import { describe, expect, it } from "vitest";
import {
  CONTENT_SCHEMAS,
  type ContactFormFieldItem,
  type RichTextDoc,
} from "@idcr/content";
import {
  EMPTY_RICH_TEXT_DOC,
  extractRichTextPlainText,
  lockContactFormFields,
  normalizeBeliefCollectionDraft,
  normalizeContactFormDraft,
  normalizeEventBannerDraft,
  normalizeFooterDraft,
  normalizeLocationDraft,
  normalizeLocalizedRichText,
  normalizeLocalizedStringList,
  normalizeLocalizedText,
  normalizeNavigationMenuDraft,
  normalizeOptionalNumber,
  normalizeOptionalText,
  normalizeSectionDraft,
  normalizeSeoEntryDraft,
  normalizeSingleEmailFormDraft,
} from "./normalize";

const sampleDoc = (text: string): RichTextDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("site content normalization helpers", () => {
  it("normalizes optional text and numbers cleanly", () => {
    expect(normalizeOptionalText(undefined)).toBeUndefined();
    expect(normalizeOptionalText("   ")).toBeUndefined();
    expect(normalizeOptionalText("  hello  ")).toBe("hello");

    expect(normalizeOptionalNumber("")).toBeUndefined();
    expect(normalizeOptionalNumber("   ")).toBeUndefined();
    expect(normalizeOptionalNumber("abc")).toBeUndefined();
    expect(normalizeOptionalNumber("-34.6058")).toBe(-34.6058);
  });

  it("omits empty en-US strings, string lists, and empty TipTap docs (Edge Case 9)", () => {
    expect(normalizeLocalizedText({ "es-AR": "Hola", "en-US": "   " })).toEqual(
      { "es-AR": "Hola" },
    );
    expect(normalizeLocalizedText({ "es-AR": " ", "en-US": "" })).toBeUndefined();

    expect(
      normalizeLocalizedRichText({
        "es-AR": sampleDoc("Bienvenidos"),
        "en-US": EMPTY_RICH_TEXT_DOC,
      }),
    ).toEqual({ "es-AR": sampleDoc("Bienvenidos") });

    expect(
      normalizeLocalizedStringList({
        "es-AR": [" iglesia ", " ", "fe"],
        "en-US": ["  "],
      }),
    ).toEqual({ "es-AR": ["iglesia", "fe"] });

    expect(
      normalizeLocalizedStringList({
        "es-AR": ["Información", "Oración"],
        "en-US": ["Information", "Prayer"],
      }),
    ).toEqual({
      "es-AR": ["Información", "Oración"],
      "en-US": ["Information", "Prayer"],
    });
  });

  it("extracts readable plain text from TipTap docs", () => {
    expect(extractRichTextPlainText(undefined)).toBe("");
    expect(extractRichTextPlainText(EMPTY_RICH_TEXT_DOC)).toBe("");
    expect(
      extractRichTextPlainText({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Uno" }] },
          { type: "paragraph", content: [{ type: "text", text: "Dos" }] },
        ],
      }),
    ).toBe("Uno\n\nDos");
  });

  it("locks contact-form structural fields (inputId, type, required, count, order)", () => {
    const baseline: ContactFormFieldItem[] = [
      {
        inputId: "name",
        type: "Short text",
        required: true,
        name: { "es-AR": "Nombre" },
      },
      {
        inputId: "subject",
        type: "Dropdown",
        required: true,
        name: { "es-AR": "Asunto" },
        values: { "es-AR": ["Información", "Oración"] },
      },
    ];

    // Even if a tampered array tries to alter inputId/type/required or add a 3rd field:
    const tampered: ContactFormFieldItem[] = [
      {
        inputId: "hacked",
        type: "Email",
        required: false,
        name: { "es-AR": "Nombre completo", "en-US": "Full name" },
        placeholder: { "es-AR": "Tu nombre", "en-US": "" },
      },
      {
        inputId: "other",
        type: "Long text",
        required: false,
        name: { "es-AR": "Motivo" },
        values: { "es-AR": ["Consulta", "Oración"], "en-US": ["Inquiry", "Prayer"] },
      },
      {
        inputId: "extra",
        type: "Short text",
        required: false,
        name: { "es-AR": "Extra" },
      },
    ];

    const locked = lockContactFormFields(baseline, tampered);
    expect(locked).toHaveLength(2);
    expect(locked?.[0]).toEqual({
      inputId: "name",
      type: "Short text",
      required: true,
      name: { "es-AR": "Nombre completo", "en-US": "Full name" },
      placeholder: { "es-AR": "Tu nombre" },
    });
    expect(locked?.[1]).toEqual({
      inputId: "subject",
      type: "Dropdown",
      required: true,
      name: { "es-AR": "Motivo" },
      values: { "es-AR": ["Consulta", "Oración"], "en-US": ["Inquiry", "Prayer"] },
    });
  });

  it("produces payloads that pass every @idcr/content draft & publishable schema", () => {
    const hero = normalizeSectionDraft({
      machineName: "our-mission",
      layout: "hero",
      headline: { "es-AR": "Bienvenidos", "en-US": "" },
      subHeadline: { "es-AR": "A casa" },
      body: { "es-AR": sampleDoc("Somos iglesia"), "en-US": EMPTY_RICH_TEXT_DOC },
      ctaText: { "es-AR": "Conocenos" },
      targetPage: "come-meet-us",
      urlParameters: "   ",
      image: "67a000000000000000000001",
    });
    expect(CONTENT_SCHEMAS.section.publishable.safeParse(hero).success).toBe(true);
    expect(hero.urlParameters).toBeUndefined();
    expect(hero.headline?.["en-US"]).toBeUndefined();

    const beliefs = normalizeBeliefCollectionDraft({
      machineName: "our-creed",
      title: { "es-AR": "Nuestro credo", "en-US": "Our creed" },
      items: [
        {
          title: { "es-AR": "Unidad", "en-US": "Unity" },
          description: {
            "es-AR": sampleDoc("Un solo cuerpo"),
            "en-US": sampleDoc("One body"),
          },
          kind: "Creed",
          bibleVerseId: "67a000000000000000000010",
        },
      ],
    });
    expect(
      CONTENT_SCHEMAS.beliefCollection.publishable.safeParse(beliefs).success,
    ).toBe(true);

    const banner = normalizeEventBannerDraft({
      machineName: "event-sunday-meetings",
      event: {
        name: { "es-AR": "Reuniones" },
        dayOfWeek: { "es-AR": "Domingos" },
        time: "17:00",
        date: "   ",
      },
      image: "67a000000000000000000002",
    });
    expect(banner.event?.date).toBeUndefined();
    expect(
      CONTENT_SCHEMAS.eventBanner.publishable.safeParse(banner).success,
    ).toBe(true);

    const seo = normalizeSeoEntryDraft({
      machineName: "seo-home",
      title: { "es-AR": "Inicio" },
      description: { "es-AR": "Iglesia de Cristo Redentor" },
      keywords: { "es-AR": ["iglesia", ""], "en-US": [""] },
      type: "  ",
    });
    expect(CONTENT_SCHEMAS.seoEntry.publishable.safeParse(seo).success).toBe(
      true,
    );
    expect(seo.type).toBeUndefined();

    const menu = normalizeNavigationMenuDraft({
      kind: "navigationMenu",
      machineName: "main-menu",
      menuItems: [{ groupName: { "es-AR": "Comunidad" }, groupLink: "community" }],
    });
    expect(
      CONTENT_SCHEMAS.navigationMenu.publishable.safeParse(menu).success,
    ).toBe(true);

    const footer = normalizeFooterDraft({
      kind: "footer",
      machineName: "footer",
      logo: "67a000000000000000000003",
      shortDescription: { "es-AR": "Iglesia en Buenos Aires" },
      socialLinks: [
        { platform: "instagram", url: " https://instagram.com/idcredentor " },
      ],
    });
    expect(CONTENT_SCHEMAS.footer.publishable.safeParse(footer).success).toBe(
      true,
    );

    const loc = normalizeLocationDraft({
      kind: "location",
      machineName: "location",
      addressLine1: "Perón 4385",
      neighborhood: "  ",
      city: "Buenos Aires",
      country: "Argentina",
      googleMapsUrl: "  ",
      mapEmbedUrl: "https://maps.google.com/embed?pb=1",
      lat: -34.6058,
      lon: Number.NaN,
    });
    expect(loc.neighborhood).toBeUndefined();
    expect(loc.googleMapsUrl).toBeUndefined();
    expect(loc.lon).toBeUndefined();
    expect(CONTENT_SCHEMAS.location.publishable.safeParse(loc).success).toBe(
      true,
    );

    const sub = normalizeSingleEmailFormDraft({
      kind: "singleEmailForm",
      machineName: "single-email-subscribe",
      title: { "es-AR": "Suscribite" },
      ctaText: { "es-AR": "Enviar" },
    });
    expect(
      CONTENT_SCHEMAS.singleEmailForm.publishable.safeParse(sub).success,
    ).toBe(true);

    const contact = normalizeContactFormDraft({
      kind: "contactForm",
      machineName: "contact-form",
      title: { "es-AR": "Contacto" },
      description: { "es-AR": "Escribinos" },
      ctaText: { "es-AR": "Enviar" },
      bibleVerseId: "67a000000000000000000010",
      agreementNote: { "es-AR": sampleDoc("Acepto") },
      fields: [
        {
          inputId: "name",
          type: "Short text",
          required: true,
          name: { "es-AR": "Nombre" },
        },
      ],
    });
    expect(
      CONTENT_SCHEMAS.contactForm.publishable.safeParse(contact).success,
    ).toBe(true);
  });
});
