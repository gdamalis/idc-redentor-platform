import * as React from "react";
import { cn } from "@idcr/ui";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  readonly label?: React.ReactNode;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className={cn(
          "size-4 shrink-0 rounded border border-input accent-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );

    if (!label) return input;

    return (
      <label
        htmlFor={id}
        className="inline-flex cursor-pointer items-center gap-2 text-sm leading-snug select-none has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
      >
        {input}
        <span>{label}</span>
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
