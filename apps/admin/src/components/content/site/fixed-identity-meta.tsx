"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SectionLayout } from "@idcr/content";
import { Field } from "@src/components/ui/field";

export interface FixedIdentityMetaProps {
  readonly machineName: string;
  readonly layout?: SectionLayout;
  readonly appearsOn?: readonly string[];
}

/**
 * Read-only identity metadata block rendered inside `"Datos generales"` for
 * every fixed/singleton entry (`F-editor-ux-decisions.md` §2.8, `ICR-198` AC2).
 */
export function FixedIdentityMeta({
  machineName,
  layout,
  appearsOn,
}: FixedIdentityMetaProps) {
  const tContent = useTranslations("content");
  const tSite = useTranslations("contentSite");

  return (
    <div className="space-y-3 border-b border-border pb-4">
      <Field
        label={tSite("common.identifier")}
        hint={tContent("fixed.identifier")}
      >
        <div
          data-testid="fixed-machine-name"
          className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground"
        >
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{machineName}</span>
        </div>
      </Field>

      {layout && (
        <Field
          label={tSite("common.layout")}
          hint={tContent("fixed.identifier")}
        >
          <div
            data-testid="fixed-section-layout"
            className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
          >
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              {tSite(`sections.layouts.${layout}`)}
            </span>
            <span className="font-mono text-[11px]">{layout}</span>
          </div>
        </Field>
      )}

      {appearsOn && appearsOn.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {tSite("common.appearsOn")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {appearsOn.map((page) => (
              <span
                key={page}
                className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-foreground"
              >
                {page}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
