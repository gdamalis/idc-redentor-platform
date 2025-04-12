import React from "react";
import { cn } from "@src/utils/cn";

type TypographyProps = {
  component: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
  variant:
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6"
    | "body"
    | "body1"
    | "body2"
    | "caption"
    | "overline";
  id?: string;
  className?: string;
  children: React.ReactNode;
};

export const Typography = ({
  component,
  className = "",
  variant,
  id,
  children,
}: TypographyProps) => {
  const Component = component;

  // Base styles without colors
  const baseStyles = {
    h1: "text-4xl",
    h2: "text-3xl mt-7 mb-4 md:text-3xl md:mt-8 md:mb-5",
    h3: "text-xl md:text-2xl",
    h4: "text-lg",
    h5: "text-md",
    h6: "text-base",
    body: "text-lg leading-7 sm:text-xl sm:leading-8",
    body1: "text-base",
    body2: "text-sm",
    caption: "text-xs",
    overline: "text-xs uppercase",
  };

  const headingStyles = "font-bold text-gray-900 dark:text-gray-100";
  const nonHeadingStyles = "text-gray-900 dark:text-gray-300";

  const isHeading = variant.startsWith("h");
  const styles = isHeading ? headingStyles : nonHeadingStyles;

  return (
    <Component
      id={id}
      className={cn(baseStyles[variant], styles, className)}
    >
      {children}
    </Component>
  );
};
