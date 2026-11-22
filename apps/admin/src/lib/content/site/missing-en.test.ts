import { describe, expect, it } from "vitest";
import type { RichTextDoc } from "@idcr/content";
import {
  countBeliefCollectionMissingEn,
  countContactFormMissingEn,
  countEventBannerMissingEn,
  countFooterMissingEn,
  countGlobalMissingEn,
  countNavigationMenuMissingEn,
  countSectionMissingEn,
  countSeoEntryMissingEn,
  countSingleEmailFormMissingEn,
} from "./missing-en";

const doc = (text: string): RichTextDoc => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

describe("missing-English counters for site content editors", () => {
  it("counts layout-filtered missing English fields on sections", () => {
    expect(
      countSectionMissingEn({
        machineName: "connect-with-us",
        layout: "cta",
        headline: { "es-AR": "Conectate" },
        subHeadline: { "es-AR": "Ignored on CTA" },
        ctaText: { "es-AR": "Escribinos", "en-US": "Write us" },
      }),
    ).toBe(1);

    expect(
      countSectionMissingEn({
        machineName: "our-mission",
        layout: "hero",
        headline: { "es-AR": "A" },
        subHeadline: { "es-AR": "B" },
        body: { "es-AR": doc("C") },
        ctaText: { "es-AR": "D", "en-US": "D-en" },
      }),
    ).toBe(3);
  });

  it("counts nested belief collection and item missing English fields", () => {
    expect(
      countBeliefCollectionMissingEn({
        machineName: "our-creed",
        title: { "es-AR": "Credo", "en-US": "Creed" },
        description: { "es-AR": doc("Desc") },
        items: [
          {
            title: { "es-AR": "Unidad" },
            description: { "es-AR": doc("Uno"), "en-US": doc("One") },
            kind: "Creed",
          },
          {
            title: { "es-AR": "Servicio", "en-US": "Service" },
            description: { "es-AR": doc("Servir") },
            kind: "Creed",
          },
        ],
      }),
    ).toBe(3);
  });

  it("counts event banner, seo, menu, footer, location, subscribe, and contact form", () => {
    expect(
      countEventBannerMissingEn({
        machineName: "event-sunday-meetings",
        event: {
          name: { "es-AR": "Reuniones" },
          dayOfWeek: { "es-AR": "Domingos", "en-US": "Sundays" },
          note: { "es-AR": "Puntual" },
          time: "17:00",
        },
      }),
    ).toBe(2);

    expect(
      countSeoEntryMissingEn({
        machineName: "seo-home",
        title: { "es-AR": "Inicio" },
        description: { "es-AR": "Desc", "en-US": "Desc EN" },
        keywords: { "es-AR": ["iglesia"] },
        siteName: { "es-AR": "IDCR" },
      }),
    ).toBe(3);

    expect(
      countNavigationMenuMissingEn({
        kind: "navigationMenu",
        machineName: "main-menu",
        menuItems: [
          { groupName: { "es-AR": "Inicio" }, groupLink: "home" },
          {
            groupName: { "es-AR": "Blog", "en-US": "Blog" },
            groupLink: "blog",
          },
        ],
      }),
    ).toBe(1);

    expect(
      countFooterMissingEn({
        kind: "footer",
        machineName: "footer",
        shortDescription: { "es-AR": "Iglesia" },
      }),
    ).toBe(1);

    expect(
      countGlobalMissingEn({
        kind: "location",
        machineName: "location",
        addressLine1: "Perón 4385",
      }),
    ).toBe(0);

    expect(
      countSingleEmailFormMissingEn({
        kind: "singleEmailForm",
        machineName: "single-email-subscribe",
        title: { "es-AR": "Suscribite" },
        ctaText: { "es-AR": "Enviar", "en-US": "Send" },
        successMessage: { "es-AR": "Listo" },
      }),
    ).toBe(2);

    expect(
      countContactFormMissingEn({
        kind: "contactForm",
        machineName: "contact-form",
        title: { "es-AR": "Contacto" },
        description: { "es-AR": "Desc", "en-US": "Desc EN" },
        ctaText: { "es-AR": "Enviar" },
        agreementNote: { "es-AR": doc("Nota") },
        fields: [
          {
            inputId: "name",
            type: "Short text",
            required: true,
            name: { "es-AR": "Nombre" },
            placeholder: { "es-AR": "Tu nombre", "en-US": "Your name" },
          },
          {
            inputId: "subject",
            type: "Dropdown",
            required: true,
            name: { "es-AR": "Asunto", "en-US": "Subject" },
            values: { "es-AR": ["Información", "Oración"] },
          },
        ],
      }),
    ).toBe(5);
  });
});
