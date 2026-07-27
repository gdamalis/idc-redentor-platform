import { describe, it, expect, vi } from "vitest";
import esAR from "../../messages/es-AR.json";
import enUS from "../../messages/en-US.json";

// See invite.template.test.ts for why `next-intl/server` is stood in with a
// real-JSON-backed translator rather than Next's RSC-only build.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const messages = (locale === "es-AR" ? esAR : enUS) as Record<string, unknown>;
    const namespaceMessages = namespace
      .split(".")
      .reduce<Record<string, unknown>>(
        (acc, key) => acc[key] as Record<string, unknown>,
        messages,
      );
    return (key: string) => namespaceMessages[key] as string;
  },
}));

const { buildPasswordResetEmail } = await import("./password-reset.template");

const RESET_URL = "https://admin.idcredentor.org/es-AR/login?oobCode=xyz789";

describe("buildPasswordResetEmail", () => {
  it("renders the es-AR subject/heading/html/text with the reset URL", async () => {
    const { subject, html, text } = await buildPasswordResetEmail({
      resetUrl: RESET_URL,
      locale: "es-AR",
    });

    expect(subject).toBe(esAR.auth.email.reset.subject);
    expect(html).toContain(esAR.auth.email.reset.heading);
    expect(html).toContain(RESET_URL);
    expect(text).toContain(esAR.auth.email.reset.heading);
    expect(text).toContain(RESET_URL);
  });

  it("renders the en-US subject/heading/html/text with the reset URL", async () => {
    const { subject, html, text } = await buildPasswordResetEmail({
      resetUrl: RESET_URL,
      locale: "en-US",
    });

    expect(subject).toBe(enUS.auth.email.reset.subject);
    expect(html).toContain(enUS.auth.email.reset.heading);
    expect(html).toContain(RESET_URL);
    expect(text).toContain(enUS.auth.email.reset.heading);
    expect(text).toContain(RESET_URL);
  });
});
