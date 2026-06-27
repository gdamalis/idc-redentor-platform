import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirror sermonMetadata.test.ts mock setup
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

vi.mock("@src/i18n/config", () => ({
  buildLocaleAlternates: vi
    .fn()
    .mockReturnValue({ "es-AR": "/es-AR/blog/slug", "en-US": "/en-US/blog/slug" }),
}));

vi.mock("./contentful/draftMode", () => ({
  shouldUseDraftMode: vi.fn().mockResolvedValue(false),
}));

import {
  buildArticleJsonLd,
  buildOrganizationJsonLd,
  buildEventJsonLd,
} from "./metadata";

const BASE_URL = "https://idcredentor.org";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", BASE_URL);
});

// ---------------------------------------------------------------------------
// Minimal BlogPost fixture (only fields used by buildArticleJsonLd)
// ---------------------------------------------------------------------------
const FAKE_POST = {
  seoTitle: "Test Post",
  seoDescription: "A test post description.",
  featuredImage: { url: "https://images.ctfassets.net/hero.jpg", title: "Hero" },
  publishedDate: "2025-01-01",
  sys: { id: "post-1", publishedAt: "2025-01-02T00:00:00Z" },
  author: { name: "Ana López" },
  slug: "test-post",
  keywords: ["faith", "community"],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// ---------------------------------------------------------------------------
// EventBanner fixture (with location.location geo)
// ---------------------------------------------------------------------------
const FAKE_EVENT_BANNER = {
  eventInfo: {
    name: "Culto Dominical",
    dayOfWeek: "Domingo",
    date: null,
    time: "17:00",
    note: "Todos bienvenidos",
  },
  location: {
    addressLine1: "Tte. Gral. Juan Domingo Perón 4385",
    neighborhood: "Villa del Parque",
    city: "Buenos Aires",
    country: "AR",
    mapEmbedUrl: "https://maps.google.com/embed",
    googleMapsUrl: "https://maps.google.com/?q=...",
    location: { lat: -34.6058, lon: -58.4287 },
  },
  image: { url: "https://images.ctfassets.net/event.jpg", title: "Event" },
  sys: { id: "event-1" },
  __typename: "EventBanner",
};

// Fixture with no geo (location.location absent)
const FAKE_EVENT_BANNER_NO_GEO = {
  ...FAKE_EVENT_BANNER,
  location: {
    ...FAKE_EVENT_BANNER.location,
    location: undefined,
  },
};

// ---------------------------------------------------------------------------
// buildArticleJsonLd — @type must now be "BlogPosting"
// ---------------------------------------------------------------------------
describe("buildArticleJsonLd", () => {
  it('returns @type "BlogPosting" (not "Article")', () => {
    const ld = buildArticleJsonLd(FAKE_POST, "es-AR");
    expect(ld["@type"]).toBe("BlogPosting");
  });

  it("sets headline from seoTitle", () => {
    const ld = buildArticleJsonLd(FAKE_POST, "es-AR");
    expect(ld.headline).toBe("Test Post");
  });
});

// ---------------------------------------------------------------------------
// buildOrganizationJsonLd
// ---------------------------------------------------------------------------
describe("buildOrganizationJsonLd", () => {
  it('returns @type "Church"', () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld["@type"]).toBe("Church");
  });

  it('returns Spanish name for locale "es-AR"', () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.name).toBe("Iglesia de Cristo Redentor");
  });

  it('returns English name for locale "en-US"', () => {
    const ld = buildOrganizationJsonLd("en-US");
    expect(ld.name).toBe("Redentor Church of Christ");
  });

  it("sets @id using baseUrl + /#church", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld["@id"]).toBe(`${BASE_URL}/#church`);
  });

  it("sets url to baseUrl/locale", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.url).toBe(`${BASE_URL}/es-AR`);
  });

  it("sets logo to redentor_logo.png (underscore)", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.logo).toBe(`${BASE_URL}/assets/img/redentor_logo.png`);
  });

  it("sets image to og_default.jpeg (underscore)", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.image).toBe(`${BASE_URL}/assets/img/og_default.jpeg`);
  });

  it("sets email to info@idcredentor.org", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.email).toBe("info@idcredentor.org");
  });

  it('sets address @type to "PostalAddress"', () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.address["@type"]).toBe("PostalAddress");
  });

  it("sets address streetAddress", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.address.streetAddress).toBe(
      "Tte. Gral. Juan Domingo Perón 4385",
    );
  });

  it("sets address addressLocality to Buenos Aires", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.address.addressLocality).toBe("Buenos Aires");
  });

  it("sets address addressCountry to AR", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.address.addressCountry).toBe("AR");
  });

  it('sets geo @type to "GeoCoordinates"', () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.geo["@type"]).toBe("GeoCoordinates");
  });

  it("sets geo latitude to -34.6058", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.geo.latitude).toBe(-34.6058);
  });

  it("sets geo longitude to -58.4287", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.geo.longitude).toBe(-58.4287);
  });

  it("includes Facebook in sameAs", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.sameAs).toContain(
      "https://www.facebook.com/iglesiadecristoredentor",
    );
  });

  it("includes Instagram in sameAs", () => {
    const ld = buildOrganizationJsonLd("es-AR");
    expect(ld.sameAs).toContain("https://www.instagram.com/idcredentor/");
  });
});

// ---------------------------------------------------------------------------
// buildEventJsonLd
// ---------------------------------------------------------------------------
describe("buildEventJsonLd", () => {
  it('returns @type "Event"', () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld["@type"]).toBe("Event");
  });

  it("sets name from eventInfo.name", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.name).toBe("Culto Dominical");
  });

  it("sets description from eventInfo.note when present", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.description).toBe("Todos bienvenidos");
  });

  it('sets eventAttendanceMode to OfflineEventAttendanceMode', () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.eventAttendanceMode).toBe(
      "https://schema.org/OfflineEventAttendanceMode",
    );
  });

  it('sets eventStatus to EventScheduled', () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.eventStatus).toBe("https://schema.org/EventScheduled");
  });

  it("sets eventSchedule with @type Schedule", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.eventSchedule["@type"]).toBe("Schedule");
  });

  it("sets eventSchedule byDay to Sunday", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.eventSchedule.byDay).toBe("https://schema.org/Sunday");
  });

  it("sets eventSchedule startTime from eventInfo.time", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.eventSchedule.startTime).toBe("17:00");
  });

  it("sets eventSchedule repeatFrequency to P1W (weekly)", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.eventSchedule.repeatFrequency).toBe("P1W");
  });

  it('sets location @type to "Place"', () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.location["@type"]).toBe("Place");
  });

  it("sets location address @type to PostalAddress", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.location.address["@type"]).toBe("PostalAddress");
  });

  it("sets location address streetAddress", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.location.address.streetAddress).toBe(
      "Tte. Gral. Juan Domingo Perón 4385",
    );
  });

  it("sets location address addressLocality from city", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.location.address.addressLocality).toBe("Buenos Aires");
  });

  it("sets location address addressCountry from country", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.location.address.addressCountry).toBe("AR");
  });

  it("sets location geo when location.location is present", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.location.geo).toMatchObject({
      "@type": "GeoCoordinates",
      latitude: -34.6058,
      longitude: -58.4287,
    });
  });

  it("omits location geo when location.location is absent — no throw", () => {
    expect(() =>
      buildEventJsonLd(FAKE_EVENT_BANNER_NO_GEO, "es-AR"),
    ).not.toThrow();
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER_NO_GEO, "es-AR");
    expect(ld.location.geo).toBeUndefined();
  });

  it("sets location hasMap from googleMapsUrl", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.location.hasMap).toBe("https://maps.google.com/?q=...");
  });

  it('sets organizer @type to "Church"', () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.organizer["@type"]).toBe("Church");
  });

  it("sets organizer url to baseUrl/locale", () => {
    const ld = buildEventJsonLd(FAKE_EVENT_BANNER, "es-AR");
    expect(ld.organizer.url).toBe(`${BASE_URL}/es-AR`);
  });
});
