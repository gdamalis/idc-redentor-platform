import * as React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@idcr/ui";

export type NoticeVariant = "info" | "warning" | "error" | "success";

export interface NoticeProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  readonly variant?: NoticeVariant;
  readonly title?: React.ReactNode;
  readonly actions?: React.ReactNode;
}

const VARIANT_CLASSES: Readonly<Record<NoticeVariant, string>> = {
  info: "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100",
  warning:
    "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-100",
  error:
    "border-destructive/50 bg-destructive/10 text-destructive dark:border-destructive/60 dark:bg-destructive/15",
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-100",
};

const VARIANT_ICON = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle2,
} as const;

const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(
  (
    { variant = "info", title, actions, className, children, role, ...props },
    ref,
  ) => {
    const Icon = VARIANT_ICON[variant];
    const resolvedRole =
      role ?? (variant === "error" || variant === "warning" ? "alert" : "status");

    return (
      <div
        ref={ref}
        role={resolvedRole}
        className={cn(
          "flex flex-col gap-2 rounded-md border px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between",
          VARIANT_CLASSES[variant],
          className,
        )}
        {...props}
      >
        <div className="flex items-start gap-2.5">
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-1">
            {title && <p className="font-semibold leading-snug">{title}</p>}
            <div className="leading-snug">{children}</div>
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    );
  },
);
Notice.displayName = "Notice";

export { Notice };
