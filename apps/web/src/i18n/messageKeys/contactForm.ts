/**
 * Typed const map of every next-intl message key used by the contact form.
 *
 * All keys live under the "ContactForm" namespace in
 * public/locales/{es-AR,en-US}.json.
 *
 * Use these constants instead of bare string literals so that key renames are
 * caught by the compiler and IDEs can find all usages.
 */
export const CONTACT_FORM_KEYS = {
  /** Heading rendered above the form fields (ContactForm.tsx). */
  FORM_HEADING: "ContactForm.form-heading",

  /** Validation error when a required field is empty (contactFormAction.ts). */
  ERROR_REQUIRED_FIELDS: "ContactForm.error-required-fields",

  /** Validation error when the supplied email address is malformed (contactFormAction.ts). */
  ERROR_INVALID_EMAIL: "ContactForm.error-invalid-email",

  /** Success feedback shown after the message is saved (contactFormAction.ts). */
  SUCCESS_MESSAGE: "ContactForm.success-message",

  /** Error feedback when the database write fails (contactFormAction.ts). */
  ERROR_SAVE_FAILED: "ContactForm.error-save-failed",

  /** Fallback error feedback for any unexpected exception (contactFormAction.ts). */
  ERROR_UNEXPECTED: "ContactForm.error-unexpected",
} as const satisfies Record<string, `ContactForm.${string}`>;

export type ContactFormKey =
  (typeof CONTACT_FORM_KEYS)[keyof typeof CONTACT_FORM_KEYS];
