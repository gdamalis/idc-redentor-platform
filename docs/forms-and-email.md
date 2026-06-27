# Forms & Email

> **Monorepo note:** the site moved to **`apps/web/`**. App paths in this doc (`src/…`, `lib/…`, `public/…`, `config/…`, `scripts/contentful/…`, `next.config.ts`, `tsconfig.json`, …) now live under `apps/web/`; only `.claude/`, `docs/`, and `tasks/` stay at the repo root. Run commands at the root (Turbo proxies them) or scope to the site with `pnpm --filter @idcr/web <task>` / `pnpm -C apps/web <cmd>`.

> **Purpose:** End-to-end map of the two public form flows — the **contact form** (persist + notify by email) and the **newsletter subscribe** (Mailchimp) — plus the SendGrid/Resend email adapter, the template engine, and the spam/PII discipline that applies because these are the only paths that handle personal data.
> **Last reviewed:** 2026-06-21

## Two flows, one principle

The contact form and the newsletter signup are the **only** places the public can submit data. Everything else is read-only. Because they touch PII (names, email addresses, free-text messages), keep the surface minimal, validate input, and never log or expose submissions beyond what the flow needs.

## Contact form

The contact form is implemented as a **React Server Action**, not an API route.

```
ContactForm (client, useActionState)
   │  FormData
   ▼
src/components/features/contact-form/contactFormAction.ts   "use server"
   │  handleContactFormSubmission(prev, formData, requiredFields)
   ├── validate required fields + email regex
   ├── build ContactDetails { name, email, subject, message }
   ├── sendContactForm(details)        → src/service/contact.service.ts   → Mongo "contact"
   └── sendContactFormEmail(details)   → src/service/contact-form-email.service.ts → email
```

### Validation (`contactFormAction.ts`)

- Caller passes `requiredFields`; the action rejects with the `error-required-fields` messageKey if any are empty (localized client-side).
- Email is checked against a regex; bad addresses get the `error-invalid-email` messageKey.
- The form content shape is `ContactDetails = { name, email, subject, message }` (`src/types/ContactDetails.ts`).
- **Note:** validation here is a hand-rolled regex, not a Zod schema. The project convention is Zod at boundaries — when extending this form, prefer migrating to a Zod schema shared between client and the action. (The form _fields_ themselves are content-driven: `getContactForm` reads a `ContactForm` Contentful entry whose `fieldsCollection` defines `FormField` name/type/required/validation/placeholder.)

### Persistence (`contact.service.ts`)

`sendContactForm` connects via the cached Mongo client, inserts `{ ...contactDetails, createdAt: new Date() }` into the **`contact`** collection of db `website`, and verifies `result.acknowledged`. `getContactMessages` reads them back sorted newest-first (for an eventual internal view — there is no public read path). See [`likes-and-mongodb.md`](./likes-and-mongodb.md).

### Email notification (`contact-form-email.service.ts`)

`sendContactFormEmail` builds a plain-text body **and** an HTML body (via the template engine, below), then calls the mailing service:

```ts
return await sendEmail({
  to: RECIPIENT_EMAIL, // process.env.CONTACT_FORM_RECIPIENT_EMAIL
  subject: `Nuevo mensaje de Contacto: ${subject}`,
  text: plainTextContent,
  html: htmlContent, // renderTemplate("contact-form", { … })
});
```

The recipient is `CONTACT_FORM_RECIPIENT_EMAIL`. The user's free-text `message` has its newlines converted to `<br>` for the HTML body — note this is **not** HTML-escaping. The template engine does naive `{{key}}` substitution, so a hostile submission could inject markup into the notification email. For an internal-only notification this is low-risk, but **sanitize/escape user-supplied fields if these emails are ever forwarded or rendered in a richer client.**

### Failure semantics

The action treats the **database write as the source of truth**: if the Mongo insert succeeds it returns success **even when the email fails** (the email failure is logged, not surfaced). If the DB write fails, the user sees the localized save-failure message. This is intentional — a submission is never silently lost, but a transient email outage doesn't block the user.

The action is **locale-agnostic**: it returns a stable `messageKey` (one of `ContactFormKey` from `src/components/features/contact-form/contactFormMessageKeys.ts` — `success-message`, `error-required-fields`, `error-invalid-email`, `error-save-failed`, `error-unexpected`), and the client (`ContactForm.tsx`) resolves it to localized text via `useTranslations()` against the `ContactForm` namespace in `public/locales/{es-AR,en-US}.json`. Raw `error.message` from caught exceptions is **never** surfaced to the user (it maps to the generic `error-unexpected` key) — see ICR-49.

## Newsletter subscribe (Mailchimp)

```
Subscribe box (client)
   │  subscribe(email)  → src/service/subscribe.ts (fetch POST /api/subscribe)
   ▼
src/app/api/subscribe/route.ts
   ├── require email
   ├── mailchimp.setConfig({ apiKey: MAILCHIMP_API_KEY, server: MAILCHIMP_API_SERVER })
   ├── lists.addListMember(MAILCHIMP_AUDIENCE_ID, { email_address, status: "subscribed" })
   └── handle "Member Exists" → "Email is already subscribed"
```

- The route talks directly to the Mailchimp Marketing API; there is no database row for subscribers — Mailchimp is the store.
- It narrows the Mailchimp error object to detect the **"Member Exists"** case and returns a friendly `"Email is already subscribed"` message instead of a 500.
- Env: `MAILCHIMP_API_KEY`, `MAILCHIMP_API_SERVER` (the datacenter suffix, e.g. `us21`), `MAILCHIMP_AUDIENCE_ID`.
- As with the contact form, only an `email` is required — keep it that way. The newsletter should not become a covert PII collector.

## Email adapter (transactional)

Transactional email (currently just the contact-form notification) goes through a small adapter so the provider can be swapped by config.

```
src/service/mailing.service.ts          sendEmail(content) + FROM_EMAIL default
   │  reads process.env.MAIL_PROVIDER
   ├── "sendgrid" → src/service/mailing/sendgrid.adapter.ts  (@sendgrid/mail)
   └── "resend"   → src/service/mailing/resend.adapter.ts    (resend)
```

- **`mailing.service.ts`** lazily constructs and caches the adapter on first `sendEmail`. If `MAIL_PROVIDER` is unset, or set to anything other than `sendgrid` / `resend`, it throws — fail loud rather than silently dropping mail.
- The `from` address defaults to `process.env.FROM_EMAIL` (falling back to the hard-coded `no-reply@notifications.idcredentor.org` constant). Set `FROM_EMAIL` to a domain you've authenticated with the chosen provider (SPF/DKIM) or delivery will suffer.
- Each adapter (`createSendGridAdapter` / `createResendAdapter`) throws on construction if its API key (`SENDGRID_API_KEY` / `RESEND_API_KEY`) is missing, and returns `false` from `sendEmail` on send failure (logged, never thrown back to the action).
- The shared contract is `EmailContent { to, from?, subject, text, html }` and `EmailAdapter { sendEmail(content): Promise<boolean> }` (`src/service/mailing/types.ts`). To add a provider, write one more adapter implementing `EmailAdapter` and add a `case` in `getEmailAdapter`.

## Template engine

`src/templates/` holds simple HTML templates and a tiny renderer:

- `template-engine.ts#renderTemplate(name, variables)` looks the template up in the `TEMPLATES` map (`src/templates/index.ts`), injects `currentYear` and `baseUrl` defaults, and replaces `{{key}}` placeholders by global string replace.
- `contact-form.template.ts` is the contact-notification HTML.
- This is deliberately dependency-free string substitution. It does **not** escape values — see the escaping caution above.

## Required environment variables

> All of these are **required at runtime but several are missing from `.env.example`** — flag and set them. Never put real values in docs or commits; reference names only.

| Variable                                                               | Used by                                      | In `.env.example`? |
| ---------------------------------------------------------------------- | -------------------------------------------- | :----------------: |
| `MAIL_PROVIDER` (`sendgrid`\|`resend`)                                 | `mailing.service.ts`                         |     ❌ missing     |
| `CONTACT_FORM_RECIPIENT_EMAIL`                                         | `contact-form-email.service.ts`              |     ❌ missing     |
| `FROM_EMAIL`                                                           | `mailing.service.ts`                         |     ❌ missing     |
| `SENDGRID_API_KEY`                                                     | `sendgrid.adapter.ts` (if provider=sendgrid) |     ❌ missing     |
| `RESEND_API_KEY`                                                       | `resend.adapter.ts` (if provider=resend)     |     ❌ missing     |
| `MONGODB_URI`                                                          | `contact.service.ts`                         |     ❌ missing     |
| `MAILCHIMP_API_KEY` / `MAILCHIMP_API_SERVER` / `MAILCHIMP_AUDIENCE_ID` | `/api/subscribe`                             |     ✅ present     |

## Spam & PII discipline

- **Collect the minimum.** Contact: name/email/subject/message. Newsletter: email. Don't add fields casually.
- **Don't expand storage.** Contact messages live in Mongo `contact`; subscriber emails live only in Mailchimp. There is no public read endpoint for either — keep it that way.
- **Escape user input** before rendering it anywhere richer than an internal plaintext/notification context.
- **Consider abuse hardening** if spam appears: the subscribe and contact endpoints have no rate limiting or CAPTCHA today. A honeypot field, a simple rate limit (per-IP, edge), or a CAPTCHA are the natural next steps — these endpoints (`src/app/api/**`, `src/service/**`, `src/templates/**`) are flagged sensitive in the harness for exactly this reason.
- **Never log full submissions** at info level in production; the current services log only error messages, not payloads — preserve that.
