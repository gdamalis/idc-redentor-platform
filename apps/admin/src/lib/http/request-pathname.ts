/**
 * Request header the proxy (`src/proxy.ts`) injects on every pass-through
 * request, carrying the current `pathname + search`. The authoritative
 * `(app)` RSC gate (`[locale]/(app)/layout.tsx`) reads it via
 * `(await headers()).get(REQUEST_PATHNAME_HEADER)` to rebuild `callbackUrl`
 * when its own `getCurrentUser()` check (`checkRevoked: true`) rejects a
 * cookie the proxy's own fast local check (`checkRevoked: false`) had
 * already let through — e.g. revoked between the two checks — so that deep
 * link isn't lost on the redirect to `/login` (P2 finding).
 *
 * No `next/server` or `next/headers` import here: this module is shared by
 * both the edge `proxy.ts` and the Node RSC `layout.tsx`, so it stays a pure,
 * runtime-agnostic string constant + validator.
 */
export const REQUEST_PATHNAME_HEADER = "x-pathname";

// Same open-redirect guard as the login form's own `callbackUrl` validation
// (`login-form.tsx#LOCAL_PATH_PATTERN`): only a same-origin path — never a
// protocol-relative `//host` URL — may be trusted as a redirect target.
const LOCAL_PATH_PATTERN = /^\/(?!\/)/;

/** Validates a proxy-injected pathname header value before it's trusted. */
export function sanitizeRequestPathname(value: string | null): string | null {
  return value && LOCAL_PATH_PATTERN.test(value) ? value : null;
}
