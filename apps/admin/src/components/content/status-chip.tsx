import { Lock } from "lucide-react";
import type { ContentStatus } from "@idcr/content";
import { cn } from "@idcr/ui";

const STATUS_STYLES: Readonly<
  Record<ContentStatus, { readonly pill: string; readonly dot: string }>
> = {
  draft: {
    pill: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  changed: {
    pill: "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
    dot: "bg-blue-500",
  },
  published: {
    pill: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
};

export interface StatusChipProps {
  readonly status: ContentStatus;
  readonly label: string;
  readonly className?: string;
}

/** Coloured dot + text chip (never colour alone — `F-editor-ux-decisions.md` §2.1). */
export function StatusChip({ status, label, className }: StatusChipProps) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        style.pill,
        className,
      )}
    >
      <span
        className={cn("size-2 shrink-0 rounded-full", style.dot)}
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  );
}

export function NeedsReviewChip({
  label,
  className,
}: {
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border border-purple-300 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-900 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-200",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function ProtectedChip({
  label,
  className,
}: {
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-foreground",
        className,
      )}
    >
      <Lock className="size-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function MissingEnChip({
  label,
  className,
}: {
  readonly label: string;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
        className,
      )}
    >
      {label}
    </span>
  );
}
