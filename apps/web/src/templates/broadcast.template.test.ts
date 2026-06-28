import { describe, expect, it } from "vitest";
import { renderTemplate } from "./template-engine";
import { BROADCAST_CHROME } from "./broadcast.template";

describe("broadcast template", () => {
  it("wraps the body and sets es-AR lang + chrome", () => {
    const html = renderTemplate("broadcast", {
      lang: "es-AR",
      body: "<p>Hola comunidad</p>",
      logoAlt: BROADCAST_CHROME["es-AR"].logoAlt,
      footer: BROADCAST_CHROME["es-AR"].footer,
    });
    expect(html).toContain('lang="es-AR"');
    expect(html).toContain("<p>Hola comunidad</p>");
    expect(html).toContain("Iglesia de Cristo Redentor");
    expect(html).not.toContain("{{body}}");
    expect(html).not.toContain("{{currentYear}}");
  });

  it("renders en-US chrome", () => {
    const html = renderTemplate("broadcast", {
      lang: "en-US",
      body: "<p>Hello church</p>",
      logoAlt: BROADCAST_CHROME["en-US"].logoAlt,
      footer: BROADCAST_CHROME["en-US"].footer,
    });
    expect(html).toContain('lang="en-US"');
    expect(html).toContain("<p>Hello church</p>");
    expect(html).toContain("Church of Christ the Redeemer");
  });
});
