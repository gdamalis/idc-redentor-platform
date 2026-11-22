import {
  isEmptyValue,
  type BeliefCollectionFields,
  type ContactFormFields,
  type EventBannerFields,
  type FooterFields,
  type GlobalFields,
  type Localized,
  type NavigationMenuFields,
  type SectionFields,
  type SeoEntryFields,
  type SingleEmailFormFields,
} from "@idcr/content";
import { getSectionLayoutFieldConfig } from "./section-layout";

function isSiteValueEmpty(value: unknown): boolean {
  if (isEmptyValue(value)) return true;
  if (Array.isArray(value)) {
    return value.every(
      (item) => typeof item === "string" && item.trim().length === 0,
    );
  }
  return false;
}

function isMissingEnglish(field: Localized<unknown> | undefined): boolean {
  if (!field) return false;
  return !isSiteValueEmpty(field["es-AR"]) && isSiteValueEmpty(field["en-US"]);
}

function countFields(fields: readonly (Localized<unknown> | undefined)[]): number {
  let count = 0;
  for (const field of fields) {
    if (isMissingEnglish(field)) count += 1;
  }
  return count;
}

export function countSectionMissingEn(values: SectionFields): number {
  const cfg = getSectionLayoutFieldConfig(values.layout, values);
  const fields: (Localized<unknown> | undefined)[] = [];
  if (cfg.showHeadline) fields.push(values.headline);
  if (cfg.showSubHeadline) fields.push(values.subHeadline);
  if (cfg.showBody) fields.push(values.body);
  if (cfg.showCtaText) fields.push(values.ctaText);
  return countFields(fields);
}

export function countBeliefCollectionMissingEn(
  values: BeliefCollectionFields,
): number {
  let count = countFields([values.title, values.description]);
  for (const item of values.items ?? []) {
    count += countFields([item.title, item.description]);
  }
  return count;
}

export function countEventBannerMissingEn(values: EventBannerFields): number {
  const ev = values.event;
  if (!ev) return 0;
  return countFields([ev.name, ev.dayOfWeek, ev.note]);
}

export function countSeoEntryMissingEn(values: SeoEntryFields): number {
  return countFields([
    values.title,
    values.description,
    values.keywords,
    values.siteName,
  ]);
}

export function countNavigationMenuMissingEn(
  values: NavigationMenuFields,
): number {
  let count = 0;
  for (const item of values.menuItems ?? []) {
    if (isMissingEnglish(item.groupName)) count += 1;
  }
  return count;
}

export function countFooterMissingEn(values: FooterFields): number {
  return countFields([values.shortDescription]);
}

export function countSingleEmailFormMissingEn(
  values: SingleEmailFormFields,
): number {
  return countFields([
    values.title,
    values.shortDescription,
    values.ctaText,
    values.inputPlaceholder,
    values.successMessage,
  ]);
}

export function countContactFormMissingEn(values: ContactFormFields): number {
  let count = countFields([
    values.title,
    values.description,
    values.ctaText,
    values.agreementNote,
  ]);
  for (const field of values.fields ?? []) {
    count += countFields([field.name, field.placeholder]);
    if (field.type === "Dropdown" || field.values !== undefined) {
      if (isMissingEnglish(field.values)) count += 1;
    }
  }
  return count;
}

export function countGlobalMissingEn(values: GlobalFields): number {
  switch (values.kind) {
    case "navigationMenu":
      return countNavigationMenuMissingEn(values);
    case "footer":
      return countFooterMissingEn(values);
    case "location":
      return 0;
    case "singleEmailForm":
      return countSingleEmailFormMissingEn(values);
    case "contactForm":
      return countContactFormMissingEn(values);
  }
}
