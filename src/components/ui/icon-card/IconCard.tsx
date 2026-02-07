"use client";

import { ComponentType } from "react";
import { motion } from "framer-motion";
import { Button } from "@src/components/ui/button";
import { Link } from "@src/i18n/routing";
import { cn } from "@src/utils/cn";

interface IconCardProps {
  /** Icon component (Lucide, Heroicons, or any SVG component) */
  icon: ComponentType<{ className?: string }>;
  /** Card title */
  title: string;
  /** Card description text */
  description: string;
  /** Optional CTA button label — omit to hide the button */
  ctaText?: string;
  /** Internal route for the CTA (uses i18n Link) */
  href?: string;
  /** External URL for the CTA (opens in new tab) */
  externalHref?: string;
  /** Index for staggered scroll-triggered animation delay */
  index?: number;
  /** Additional class names for the root element */
  className?: string;
}

export const IconCard = ({
  icon: Icon,
  title,
  description,
  ctaText,
  href,
  externalHref,
  index = 0,
  className,
}: IconCardProps) => {
  const renderCta = () => {
    if (!ctaText) return null;

    const button = (
      <Button
        variant="outline"
        className="w-full rounded-full group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all"
      >
        {ctaText}
      </Button>
    );

    if (href) return <Link href={href}>{button}</Link>;

    if (externalHref) {
      return (
        <a href={externalHref} target="_blank" rel="noopener noreferrer">
          {button}
        </a>
      );
    }

    return button;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        "bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all group",
        className,
      )}
    >
      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform">
        <Icon className="w-6 h-6" />
      </div>

      <h3 className="font-serif text-2xl font-bold mb-3">{title}</h3>

      <p className="text-muted-foreground mb-6">{description}</p>

      {renderCta()}
    </motion.div>
  );
};
