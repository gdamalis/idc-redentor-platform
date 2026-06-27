// Contentful slug fields are kebab-case: lowercase alphanumerics joined by single hyphens.
// A `slug` arrives from the user-controlled `[slug]` route segment and is interpolated directly
// into the hand-written GraphQL query strings in this folder, so every getter MUST validate it
// before use. Anything off-shape — including characters like `"` that could break out of the
// query string and inject GraphQL — is rejected and treated by callers as "not found".
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}
