"use server";

import { ContactDetails } from "@src/types/ContactDetails";
import { sendContactForm } from "@src/service/contact.service";
import { sendContactFormEmail } from "@src/service/contact-form-email.service";
import { CONTACT_FORM_KEYS } from "@src/i18n/messageKeys/contactForm";
import { ContactFormState } from "./types";

function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

export async function handleContactFormSubmission(
  _: ContactFormState | null,
  formData: FormData,
  requiredFields: string[],
): Promise<ContactFormState> {
  try {
    const formValues = Object.fromEntries(formData.entries());

    for (const field of requiredFields) {
      if (!formValues[field]) {
        return {
          success: false,
          messageKey: CONTACT_FORM_KEYS.ERROR_REQUIRED_FIELDS,
        };
      }
    }

    const email = formValues.email as string;
    if (email && !isValidEmail(email)) {
      return {
        success: false,
        messageKey: CONTACT_FORM_KEYS.ERROR_INVALID_EMAIL,
      };
    }

    const contactDetails: ContactDetails = {
      name: formValues.name as string,
      email: email,
      subject: formValues.subject as string,
      message: formValues.message as string,
    };

    try {
      // Save to database
      const dbResult = await sendContactForm(contactDetails);

      // Send email notification
      const emailResult = await sendContactFormEmail(contactDetails);

      if (!dbResult.success) {
        console.error("Database operation failed");
      }

      if (!emailResult) {
        console.error("Email sending failed");
      }

      // Return success even if email fails, as long as DB operation succeeded
      if (dbResult.success) {
        return { success: true, messageKey: CONTACT_FORM_KEYS.SUCCESS_MESSAGE };
      } else {
        throw new Error("Database operation failed");
      }
    } catch (dbError) {
      console.error("Database error:", dbError);
      return {
        success: false,
        messageKey: CONTACT_FORM_KEYS.ERROR_SAVE_FAILED,
      };
    }
  } catch (error) {
    console.error("Error submitting contact form:", error);
    return { success: false, messageKey: CONTACT_FORM_KEYS.ERROR_UNEXPECTED };
  }
}
