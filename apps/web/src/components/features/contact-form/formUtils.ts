import { Field } from "./formFields";

/**
 * Helper to generate required field list from form configuration
 */
export function getRequiredFields(formFields: Field[]): string[] {
  return formFields
    .filter(field => field.required)
    .map(field => field.inputId);
} 