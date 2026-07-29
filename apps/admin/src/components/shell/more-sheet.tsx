"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@src/components/ui/dialog";
import { cn } from "@idcr/ui";
import { usePathname } from "@src/i18n/routing";
import { isNavItemActive } from "@src/components/shell/nav-items";

interface MoreSheetProps {
  readonly triggerLabel: string;
  readonly title: string;
  readonly closeLabel: string;
  /** Hrefs of the links rendered inside the sheet — used ONLY to derive the
   * trigger's own active state (`isNavItemActive`, shared with NavLink). All
   * strings, so nothing crosses the RSC boundary illegally. */
  readonly overflowHrefs: readonly string[];
  readonly className?: string;
  readonly activeClassName?: string;
  readonly inactiveClassName?: string;
  readonly children: ReactNode;
}

/**
 * Overflow nav for the bottom tab bar. Owns disclosure state AND derives its
 * own active state from `overflowHrefs` — the links themselves are
 * server-rendered by MobileNav and passed in as `children`, so no nav data or
 * icon component ever crosses the RSC boundary.
 *
 * The Dialog is CONTROLLED and closes itself on every pathname change.
 * `AppShell` is rendered by the `(app)` layout, which Next.js does NOT remount
 * on in-app navigation — only its `children` re-render — so this component
 * instance (and an uncontrolled Dialog's open state) survives a tap on an
 * overflow link. Without the pathname-driven close, the sheet — and its
 * focus trap — would keep covering the page the user just navigated to.
 * The reset happens DURING render (comparing against the previous pathname
 * held in state), not in a `useEffect` — the repo's `react-hooks/set-state-
 * in-effect` lint rule forbids a bare `setState` inside an effect body, and
 * this is exactly React's documented "adjusting state when a prop changes"
 * pattern: calling `setState` while rendering lets React bail out and
 * re-render with the reset state before committing, so there's no extra
 * painted frame where the sheet is still visibly open over the new page.
 *
 * Built on the shared Radix Dialog for a real focus trap + Escape handling;
 * the className override displaces the primitive's centered geometry into a
 * bottom sheet (cn() is tailwind-merge, so the later values win).
 */
export function MoreSheet({
  triggerLabel,
  title,
  closeLabel,
  overflowHrefs,
  className,
  activeClassName,
  inactiveClassName,
  children,
}: MoreSheetProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [priorPathname, setPriorPathname] = useState(pathname);
  const isActive = overflowHrefs.some((href) => isNavItemActive(pathname, href));

  if (pathname !== priorPathname) {
    setPriorPathname(pathname);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-current={isActive ? "page" : undefined}
        className={cn(className, isActive ? activeClassName : inactiveClassName)}
      >
        <MoreHorizontal className="h-5 w-5 shrink-0" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent
        closeLabel={closeLabel}
        className="bottom-0 left-0 top-auto max-w-none translate-x-0 translate-y-0 gap-2 rounded-b-none rounded-t-xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <DialogTitle>{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
