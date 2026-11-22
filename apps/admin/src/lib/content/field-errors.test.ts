import { describe, expect, it } from "vitest";
import { loadMessages } from "@src/i18n/load-messages";
import {
  inferLocaleTabFromFieldPath,
  translateFieldErrors,
} from "./field-errors";

describe("translateFieldErrors", () => {
  const esFields = loadMessages("es-AR").content.errors.fields as Record<
    string,
    string
  >;

  it("never leaks raw Zod English strings and maps localized paths accurately", () => {
    const result = translateFieldErrors(
      {
        featuredImageId: ["Invalid input: expected string, received undefined"],
        "title.es-AR": ["Required"],
        "items.0.description.en-US": ["English (en-US) description is required"],
        slug: ["duplicate-key"],
        unknownField: ["Some raw Zod string"],
      },
      {
        lookupFieldMessage: (key) => esFields[key],
        slugTakenMessage: "Esa dirección ya la usa otra entrada. Elegí otra.",
        duplicateKeyMessage: "Ya existe otra entrada con este mismo identificador.",
        fallbackMessage: "Revisá este campo.",
      },
    );

    expect(result.byPath.featuredImageId).toBe("Falta la imagen destacada.");
    expect(result.byPath["title.es-AR"]).toBe("Falta el título (Español).");
    expect(result.byPath["items.0.description.en-US"]).toBe(
      "Falta la descripción.",
    );
    expect(result.byPath.slug).toBe(
      "Esa dirección ya la usa otra entrada. Elegí otra.",
    );
    expect(result.byPath.unknownField).toBe("Revisá este campo.");
    expect(result.countByLocale).toEqual({ "es-AR": 1, "en-US": 1 });

    // Confirm zero raw Zod text leaked anywhere
    for (const item of result.list) {
      expect(item.message).not.toContain("Invalid input");
      expect(item.message).not.toContain("raw Zod");
    }
  });

  it("infers locale tab from nested paths", () => {
    expect(inferLocaleTabFromFieldPath("title.es-AR")).toBe("es-AR");
    expect(inferLocaleTabFromFieldPath("items.2.title.en-US")).toBe("en-US");
    expect(inferLocaleTabFromFieldPath("featuredImageId")).toBe("general");
  });
});
