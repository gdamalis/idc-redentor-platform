import { useTranslations } from "next-intl";
import { FileDown } from "lucide-react";
import { cn } from "@idcr/ui";
import type { Sermon } from "@src/types/Sermon";

interface PdfDownloadButtonProps {
  readonly pdfSummary: NonNullable<Sermon["pdfSummary"]>;
  /**
   * Optional label override. Used when several PDFs are embedded in the body
   * (one per preacher) so each button reads its own asset title instead of the
   * generic "summary-pdf" translation.
   */
  readonly label?: string;
}

export function PdfDownloadButton({ pdfSummary, label }: PdfDownloadButtonProps) {
  const t = useTranslations("Sermons");

  return (
    <a
      href={pdfSummary.url}
      download
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border",
        "px-4 py-2 text-sm font-medium text-foreground transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <FileDown className="h-4 w-4 shrink-0" aria-hidden />
      {label ?? t("summary-pdf")}
    </a>
  );
}
