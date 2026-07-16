// design-sync stub for the two server-only services behind the contact form.
//
// ContactForm imports ./contactFormAction ("use server"), which value-imports
// contact.service (MongoDB) and contact-form-email.service (SendGrid/Resend).
// Bundling those for the browser pulls in fs/net/crypto/node-fetch and the
// build fails with [UNRESOLVED_IMPORT] on ~27 node builtins.
//
// Stubbing them keeps ContactForm — a real, useful DS component — in the bundle
// with its full markup intact. Only SUBMISSION is inert, which is correct for a
// design tool: previews never submit, and when engineers ship a design built
// with ContactForm, the app's real action runs.
//
// Wired via .design-sync/tsconfig.ds.json (both services are imported through
// the "@src/service/*" alias, so paths can redirect them; contactFormAction
// itself is imported relatively and cannot be redirected).

/** Stands in for contact.service#sendContactForm (MongoDB write). */
export async function sendContactForm(_contactDetails: unknown): Promise<void> {
  // Intentionally inert — see header.
}

/** Stands in for contact.service#getContactMessages (MongoDB read). */
export async function getContactMessages(): Promise<unknown[]> {
  return [];
}

/** Stands in for contact-form-email.service#sendContactFormEmail (SendGrid/Resend). */
export async function sendContactFormEmail(..._args: unknown[]): Promise<void> {
  // Intentionally inert — see header.
}
