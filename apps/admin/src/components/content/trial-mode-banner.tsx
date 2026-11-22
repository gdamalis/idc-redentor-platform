import { Notice } from "@src/components/ui/notice";

export interface TrialModeBannerProps {
  readonly message: string;
  readonly className?: string;
}

/**
 * Permanent pre-cutover warning shown on every `/content/**` page and inside
 * the Publish confirmation dialog (`ICR-197` AC9, `F-editor-ux-decisions.md` §13.7).
 */
export function TrialModeBanner({ message, className }: TrialModeBannerProps) {
  return (
    <Notice
      variant="warning"
      role="status"
      data-testid="trial-mode-banner"
      className={className}
    >
      {message}
    </Notice>
  );
}
