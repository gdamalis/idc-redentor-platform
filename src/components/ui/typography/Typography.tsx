import React from "react";

type TypographyProps = {
  component: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
  variant:
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6"
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
  const variantMap = {
    h1: "text-4xl font-bold text-gray-900 dark:text-gray-100",
    h2: "text-3xl font-bold text-gray-900 dark:text-gray-100",
    h3: "text-2xl font-bold text-gray-900 dark:text-gray-100",
    h4: "text-xl font-bold text-gray-900 dark:text-gray-100",
    h5: "text-lg font-bold text-gray-900 dark:text-gray-100",
    h6: "text-base font-bold text-gray-900 dark:text-gray-100",
    body1: "text-base text-gray-600 dark:text-gray-300",
    body2: "text-sm text-gray-600 dark:text-gray-300",
    caption: "text-xs text-gray-600 dark:text-gray-300",
    overline: "text-xs text-gray-600 dark:text-gray-300 uppercase",
  };

  return (
    <Component id={id} className={`${variantMap[variant]} ${className} `}>
      {children}
    </Component>
  );
};
