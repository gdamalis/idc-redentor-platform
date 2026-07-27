import { describe, it, expect, vi } from "vitest";
import esAR from "../../messages/es-AR.json";
import enUS from "../../messages/en-US.json";

// `next-intl/server`'s real `getTranslations` resolves through the
// `next-intl/config` webpack alias that `next-intl/plugin` wires up in
// `next.config.ts` — that alias only exists inside the Next.js build, so
// under Vitest we stand in a translator backed by the *real* message JSON
// (the single source of truth), keeping this test honest about the actual
// localized copy while not depending on Next's RSC bundler.
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

const { buildInviteEmail } = await import("./invite.template");

const INVITE_URL = "https://admin.idcredentor.org/es-AR/login?inviteToken=abc123";

describe("buildInviteEmail", () => {
  it("renders the es-AR subject/heading/html/text with the invite URL", async () => {
    const { subject, html, text } = await buildInviteEmail({
      inviteUrl: INVITE_URL,
      locale: "es-AR",
    });

    expect(subject).toBe(esAR.auth.email.invite.subject);
    expect(html).toContain(esAR.auth.email.invite.heading);
    expect(html).toContain(INVITE_URL);
    expect(text).toContain(esAR.auth.email.invite.heading);
    expect(text).toContain(INVITE_URL);
  });

  it("renders the en-US subject/heading/html/text with the invite URL", async () => {
    const { subject, html, text } = await buildInviteEmail({
      inviteUrl: INVITE_URL,
      locale: "en-US",
    });

    expect(subject).toBe(enUS.auth.email.invite.subject);
    expect(html).toContain(enUS.auth.email.invite.heading);
    expect(html).toContain(INVITE_URL);
    expect(text).toContain(enUS.auth.email.invite.heading);
    expect(text).toContain(INVITE_URL);
  });
});
