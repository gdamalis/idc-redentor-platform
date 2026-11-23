import { describe, expect, it } from "vitest";
import esSite from "../../../../messages/content/site.es-AR.json";
import enSite from "../../../../messages/content/site.en-US.json";
import {
  createSiteFieldErrorMapper,
  findRichTextFieldError,
  type SiteTranslator,
} from "./field-errors";

function makeTranslator(catalog: typeof esSite): SiteTranslator {
  return (key, values) => {
    const [, leaf] = key.split(".");
    const raw = (catalog.errors as Record<string, string>)[leaf ?? ""] ?? key;
    if (!values) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, k: string) =>
      values[k] !== undefined ? String(values[k]) : `{${k}}`,
    );
  };
}

describe("createSiteFieldErrorMapper", () => {
  const tEs = makeTranslator(esSite);
  const tEn = makeTranslator(enSite);

  it("maps belief collection indexed paths in ES & EN without raw Zod leakage", () => {
    const mapEs = createSiteFieldErrorMapper(tEs, "beliefCollection");
    const mapEn = createSiteFieldErrorMapper(tEn, "beliefCollection");

    expect(mapEs("items.1.title.en-US", ["Required"])).toBe(
      "Elemento 2: falta el título en inglés.",
    );
    expect(mapEn("items.0.description.es-AR", ["Required"])).toBe(
      "Item 1: Spanish description is missing.",
    );
    expect(mapEs("items.0.description.es-AR", ["Disallowed node heading"])).toBe(
      "Este texto solo permite párrafos, negrita y cursiva.",
    );
    expect(mapEs("items", ["Too small"])).toBe(
      "Agregá al menos un elemento antes de publicar.",
    );
  });

  it("maps section, event banner, seo, and globals paths cleanly", () => {
    const mapSec = createSiteFieldErrorMapper(tEs, "section");
    expect(mapSec("headline.es-AR", ["Hero requires"])).toBe(
      "Falta el título principal en español.",
    );
    expect(mapSec("body.es-AR", ["Disallowed node"])).toBe(
      "Este texto solo permite párrafos, negrita y cursiva.",
    );
    expect(mapSec("machineName", ["immutable"])).toBe(
      "Este campo lo usa el código del sitio y no se puede modificar.",
    );

    const mapBanner = createSiteFieldErrorMapper(tEs, "eventBanner");
    expect(mapBanner("event.time", ["Required"])).toContain("17:00");
    expect(mapBanner("event.date", ["Invalid"])).toContain("AAAA-MM-DD");

    const mapMenu = createSiteFieldErrorMapper(tEn, "navigationMenu");
    expect(mapMenu("menuItems.2.groupLink", ["Invalid enum"])).toBe(
      "Link 3: choose a target page from the list.",
    );

    const mapFooter = createSiteFieldErrorMapper(tEs, "footer");
    expect(mapFooter("socialLinks.0.platform", ["Invalid"])).toContain(
      "Facebook, Instagram o YouTube",
    );
    expect(mapFooter("socialLinks.0.url", ["Invalid"])).toContain("https://");

    const mapContact = createSiteFieldErrorMapper(tEs, "contactForm");
    expect(mapContact("bibleVerseId", ["Required"])).toBe(
      "Falta elegir la cita bíblica.",
    );
    expect(mapContact("agreementNote.es-AR", ["Disallowed node heading"])).toBe(
      "Este texto solo permite párrafos, negrita, cursiva y enlaces.",
    );
    // Invalid link href & nested `.content.` subpath map to richTextInlineLink (C3.4)
    expect(
      mapContact("agreementNote.es-AR", [
        "Link address must start with https://, http://, mailto: or /",
      ]),
    ).toBe("Este texto solo permite párrafos, negrita, cursiva y enlaces.");
    expect(
      mapContact("agreementNote.es-AR.content.0.content.0.marks.0.attrs.href", [
        "Invalid",
      ]),
    ).toBe("Este texto solo permite párrafos, negrita, cursiva y enlaces.");
    expect(
      findRichTextFieldError(
        (p) =>
          p === "agreementNote.es-AR.content.0.marks.0"
            ? "Este texto solo permite párrafos, negrita, cursiva y enlaces."
            : undefined,
        { "agreementNote.es-AR.content.0.marks.0": ["Invalid"] },
        "agreementNote.es-AR",
        "agreementNote",
      ),
    ).toBe("Este texto solo permite párrafos, negrita, cursiva y enlaces.");
    expect(mapContact("fields.1.name.es-AR", ["Required"])).toBe(
      "Campo 2: falta la etiqueta en español.",
    );

    const mapLocation = createSiteFieldErrorMapper(tEn, "location");
    expect(mapLocation("lat", ["Too big"])).toContain("-90");
    expect(mapLocation("lon", ["Too big"])).toContain("-180");
  });
});
