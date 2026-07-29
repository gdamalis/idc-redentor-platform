"use client";

import { Link, usePathname } from "@src/i18n/routing";
import { cn } from "@idcr/ui";
import type { ReactNode } from "react";
import { isNavItemActive } from "@src/components/shell/nav-items";

interface NavLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly activeClassName?: string;
  readonly inactiveClassName?: string;
  readonly children: ReactNode;
}

/**
 * The ONLY route-aware component in the shell. It deliberately takes
 * pre-rendered `children` rather than a `NavItem`: `NavItem.icon` is a
 * component *function*, and functions cannot be passed from a server
 * component to a client component. Both the sidebar and the mobile tab bar
 * stay server components by rendering their icons and labels themselves and
 * handing the result here as ReactNodes.
 *
 * `usePathname` comes from `@src/i18n/routing` (next-intl), which strips the
 * locale prefix — so it compares directly against NAV_ITEMS hrefs. The raw
 * `next/navigation` version returns `/es-AR/people` and would match nothing.
 */
export function NavLink({
  href,
  className,
  activeClassName,
  inactiveClassName,
  children,
}: NavLinkProps) {
  const pathname = usePathname();
  const isActive = isNavItemActive(pathname, href);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(className, isActive ? activeClassName : inactiveClassName)}
    >
      {children}
    </Link>
  );
}
