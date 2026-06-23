import { describe, expect, it } from "vitest";
import { handleContactFormSubmission } from "./contactFormAction";
import { CONTACT_FORM_KEYS } from "./contactFormMessageKeys";

const makeFormData = (entries: Record<string, string>): FormData => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
};

describe("handleContactFormSubmission — validation branches", () => {
  it("returns the required-fields key when a required field is missing", async () => {
    const result = await handleContactFormSubmission(
      null,
      makeFormData({ email: "a@b.com" }),
      ["name", "email"],
    );
    expect(result).toEqual({
      success: false,
      messageKey: CONTACT_FORM_KEYS.ERROR_REQUIRED_FIELDS,
    });
  });

  it("returns the invalid-email key when the email format is bad", async () => {
    const result = await handleContactFormSubmission(
      null,
      makeFormData({ name: "Ana", email: "not-an-email" }),
      ["name", "email"],
    );
    expect(result).toEqual({
      success: false,
      messageKey: CONTACT_FORM_KEYS.ERROR_INVALID_EMAIL,
    });
  });
});
