import { describe, it, expect } from "vitest";
import { buildShareUrl } from "./ShareButton";

// buildShareUrl is a pure helper exported from ShareButton — no React, no mocks needed
describe("buildShareUrl", () => {
  it('produces /predicas/<slug> path when basePath is "predicas"', () => {
    const url = buildShareUrl({
      baseUrl: "https://www.idcredentor.org",
      locale: "es-AR",
      basePath: "predicas",
      slug: "gracia-suficiente",
    });
    expect(url).toBe("https://www.idcredentor.org/es-AR/predicas/gracia-suficiente");
  });

  it('produces /blog/<slug> path when basePath is "blog"', () => {
    const url = buildShareUrl({
      baseUrl: "https://www.idcredentor.org",
      locale: "es-AR",
      basePath: "blog",
      slug: "mi-primer-post",
    });
    expect(url).toBe("https://www.idcredentor.org/es-AR/blog/mi-primer-post");
  });

  it("works with the en-US locale", () => {
    const url = buildShareUrl({
      baseUrl: "https://www.idcredentor.org",
      locale: "en-US",
      basePath: "blog",
      slug: "my-first-post",
    });
    expect(url).toBe("https://www.idcredentor.org/en-US/blog/my-first-post");
  });
});
