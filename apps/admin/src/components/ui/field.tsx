import * as React from "react";
import { cn } from "@idcr/ui";

export interface FieldProps {
  readonly label: React.ReactNode;
  readonly htmlFor?: string;
  /** Field path used by `<ErrorSummary>` links to scroll/focus this field. */
  readonly fieldPath?: string;
  /** Shows the `"necesario para publicar"` / `"needed to publish"` marker. */
  readonly requiredToPublish?: boolean;
  readonly requiredMarkLabel?: string;
  readonly hint?: React.ReactNode;
  readonly error?: string;
  readonly className?: string;
  readonly children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  fieldPath,
  requiredToPublish = false,
  requiredMarkLabel,
  hint,
  error,
  className,
  children,
}: FieldProps) {
  return (
    <div
      className={cn("flex flex-col gap-1.5", className)}
      data-field-path={fieldPath}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-sm font-medium leading-none text-foreground"
        >
          {label}
          {requiredToPublish && (
            <span
              className="ml-1 text-destructive"
              aria-hidden="true"
              title={requiredMarkLabel}
            >
              *
            </span>
          )}
        </label>
        {requiredToPublish && requiredMarkLabel && (
          <span className="text-xs text-muted-foreground">
            {requiredMarkLabel}
          </span>
        )}
      </div>

      {children}

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
