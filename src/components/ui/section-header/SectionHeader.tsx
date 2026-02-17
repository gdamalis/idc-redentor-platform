import { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  description?: ReactNode;
}

export const SectionHeader = ({ title, description }: SectionHeaderProps) => (
  <div className="text-center max-w-3xl mx-auto mb-16">
    <h2 className="font-serif text-4xl font-bold mb-4 text-foreground">
      {title}
    </h2>
    <div className="h-1 w-20 bg-primary mx-auto rounded-full mb-6" />
    {description}
  </div>
);
