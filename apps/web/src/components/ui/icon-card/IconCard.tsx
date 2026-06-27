"use client";

import { ComponentType, ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@src/utils/cn";

interface IconCardProps {
  /** Icon component (Lucide, Heroicons, or any SVG component) */
  icon: ComponentType<{ className?: string }>;
  /** Card title */
  title: string;
  /** Main content area — supports plain text or rich-text React nodes */
  children: ReactNode;
  /** Optional bottom slot rendered below children (e.g., bible verse, CTA) */
  footer?: ReactNode;
  /** Index for staggered scroll-triggered animation delay */
  index?: number;
  /** Additional class names for the root element */
  className?: string;
}

export const IconCard = ({
  icon: Icon,
  title,
  children,
  footer,
  index = 0,
  className,
}: IconCardProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.15 }}
      className={cn(
        "bg-card p-8 rounded-2xl border border-border shadow-sm hover:shadow-md transition-all hover:-translate-y-1 group",
        className,
      )}
    >
      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-6 text-primary group-hover:scale-110 transition-transform">
        <Icon className="w-6 h-6" />
      </div>

      <h3 className="font-serif text-2xl font-bold mb-3">{title}</h3>

      {children}

      {footer}
    </motion.div>
  );
};
