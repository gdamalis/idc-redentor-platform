import * as React from "react";

import { cn } from "@idcr/ui";

// Minimal shared text input — mirrors button.tsx's conventions (named export,
// forwardRef, cn() merge). Extracted to DRY the input className that was
// duplicated across the login + reset-password forms (ICR-127 fixup).
//
// The focus ring uses Tailwind v4's `inset-ring-*` utilities so the 1px
// highlight is drawn INSIDE the field's own box, never outside it (a plain
// `ring-*` is a box-shadow drawn just outside the border box, which visually
// encroaches on neighbouring elements). Border width stays 1px, so nothing
// about the field's footprint changes on focus.
//
// A full design-system Input (variants, sizes, error state, etc.) is ICR-18's
// job — keep this intentionally minimal until then.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:border-ring focus-visible:inset-ring-1 focus-visible:inset-ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
