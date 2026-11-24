import type { ContactFormView } from "@lib/content/types";
import type { ContactFormKey } from "@src/i18n/messageKeys/contactForm";

export interface ContactFormProps {
  readonly content: ContactFormView;
}

export interface ContactFormState {
  readonly success: boolean;
  readonly messageKey: ContactFormKey;
}
