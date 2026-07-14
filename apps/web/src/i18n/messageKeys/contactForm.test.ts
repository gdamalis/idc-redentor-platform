import { describe, it, expect } from "vitest";
import esAR from "@public/locales/es-AR.json";
import enUS from "@public/locales/en-US.json";

/**
 * Verifies that contactForm message keys exports the expected const map
 * and that both locale files contain the required ContactForm namespace keys.
 */

describe("contactForm message keys", () => {
  it("exports all expected message keys as a const map", async () => {
    const { CONTACT_FORM_KEYS } = await import("./contactForm");

    expect(CONTACT_FORM_KEYS).toBeDefined();
    expect(typeof CONTACT_FORM_KEYS).toBe("object");

    // ContactForm.tsx — hardcoded heading
    expect(CONTACT_FORM_KEYS.FORM_HEADING).toBe("ContactForm.form-heading");

    // contactFormAction.ts — server-side messages
    expect(CONTACT_FORM_KEYS.ERROR_REQUIRED_FIELDS).toBe(
      "ContactForm.error-required-fields",
    );
    expect(CONTACT_FORM_KEYS.ERROR_INVALID_EMAIL).toBe(
      "ContactForm.error-invalid-email",
    );
    expect(CONTACT_FORM_KEYS.SUCCESS_MESSAGE).toBe(
      "ContactForm.success-message",
    );
    expect(CONTACT_FORM_KEYS.ERROR_SAVE_FAILED).toBe(
      "ContactForm.error-save-failed",
    );
    expect(CONTACT_FORM_KEYS.ERROR_UNEXPECTED).toBe(
      "ContactForm.error-unexpected",
    );
  });
});

describe("es-AR locale ContactForm namespace", () => {
  const ns = (esAR as Record<string, unknown>)["ContactForm"] as
    | Record<string, string>
    | undefined;

  it("has a ContactForm namespace", () => {
    expect(ns).toBeDefined();
  });

  it("contains form-heading (voseo)", () => {
    expect(ns?.["form-heading"]).toBeTruthy();
  });

  it("contains error-required-fields", () => {
    expect(ns?.["error-required-fields"]).toBeTruthy();
  });

  it("contains error-invalid-email", () => {
    expect(ns?.["error-invalid-email"]).toBeTruthy();
  });

  it("contains success-message", () => {
    expect(ns?.["success-message"]).toBeTruthy();
  });

  it("contains error-save-failed", () => {
    expect(ns?.["error-save-failed"]).toBeTruthy();
  });

  it("contains error-unexpected", () => {
    expect(ns?.["error-unexpected"]).toBeTruthy();
  });
});

describe("en-US locale ContactForm namespace", () => {
  const ns = (enUS as Record<string, unknown>)["ContactForm"] as
    | Record<string, string>
    | undefined;

  it("has a ContactForm namespace", () => {
    expect(ns).toBeDefined();
  });

  it("contains form-heading", () => {
    expect(ns?.["form-heading"]).toBeTruthy();
  });

  it("contains error-required-fields", () => {
    expect(ns?.["error-required-fields"]).toBeTruthy();
  });

  it("contains error-invalid-email", () => {
    expect(ns?.["error-invalid-email"]).toBeTruthy();
  });

  it("contains success-message", () => {
    expect(ns?.["success-message"]).toBeTruthy();
  });

  it("contains error-save-failed", () => {
    expect(ns?.["error-save-failed"]).toBeTruthy();
  });

  it("contains error-unexpected", () => {
    expect(ns?.["error-unexpected"]).toBeTruthy();
  });
});
