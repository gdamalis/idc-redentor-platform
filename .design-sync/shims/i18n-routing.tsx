// design-sync shim for `@src/i18n/routing`.
//
// The real module calls next-intl's createNavigation(), whose Link/useRouter/
// usePathname read the Next App Router context. That context doesn't exist in
// the DS bundle's plain-browser runtime, so the real module throws on import.
//
// next-intl's Link renders an <a> with a locale-prefixed href; this renders the
// same <a> with the locale prefix applied, so component markup stays truthful.
//
// Wired via .design-sync/tsconfig.ds.json compilerOptions.paths (listed BEFORE
// the "@src/*" wildcard so the exact match wins).
import * as React from "react";

export const routing = {
  locales: ["es-AR", "en-US"] as const,
  defaultLocale: "es-AR" as const,
};

const DS_LOCALE = routing.defaultLocale;

type Href = string | { pathname?: string; query?: Record<string, unknown> };

const toPath = (href: Href): string =>
  typeof href === "string" ? href : (href?.pathname ?? "#");

/** Mirrors next-intl's locale-prefixing: /foo -> /es-AR/foo */
export const getPathname = ({
  href,
  locale = DS_LOCALE,
}: {
  href: Href;
  locale?: string;
}): string => {
  const path = toPath(href);
  return path.startsWith("/") ? `/${locale}${path}` : path;
};

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: Href;
  locale?: string;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, locale, prefetch: _prefetch, replace: _replace, scroll: _scroll, children, ...rest },
  ref
) {
  return (
    <a ref={ref} href={getPathname({ href, locale })} {...rest}>
      {children}
    </a>
  );
});

// Navigation APIs are inert in a static preview — no router exists to drive.
export const usePathname = (): string => "/";

export const useRouter = () => ({
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
});

export const redirect = (): void => {};
