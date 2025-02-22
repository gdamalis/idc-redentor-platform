import { HTMLProps } from "react";

export const Container = ({
  className,
  ...props
}: HTMLProps<HTMLDivElement>) => {
  return <div className={`mx-auto max-w-6xl px-4 ${className}`} {...props} />;
};
