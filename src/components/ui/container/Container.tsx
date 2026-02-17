import { HTMLProps } from "react";

const sizeMap = {
  sm: "max-w-3xl", // 768px - centered text
  md: "max-w-5xl", // 1024px - callout text
  default: "max-w-6xl", // 1152px - standard sections
} as const;

type ContainerProps = Omit<HTMLProps<HTMLDivElement>, "size"> & {
  size?: keyof typeof sizeMap;
};

export const Container = ({
  className,
  size = "default",
  ...props
}: ContainerProps) => {
  return (
    <div
      className={`mx-auto ${sizeMap[size]} px-4 ${className ?? ""}`}
      {...props}
    />
  );
};
