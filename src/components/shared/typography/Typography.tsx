import React from 'react';

type TypographyProps = {
  component: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';
  variant: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body1' | 'body2' | 'caption' | 'overline';
  className?: string;
  children: React.ReactNode;
};

export const Typography = ({ component, className, variant, children }: TypographyProps) => {
  const Component = component;
  const variantMap = {
    h1: 'text-4xl font-bold text-gray-900',
    h2: 'text-3xl font-bold text-gray-900',
    h3: 'text-2xl font-bold text-gray-900',
    h4: 'text-xl font-bold text-gray-900',
    h5: 'text-lg font-bold text-gray-900',
    h6: 'text-base font-bold text-gray-900',
    body1: 'text-base text-gray-600',
    body2: 'text-sm text-gray-600',
    caption: 'text-xs text-gray-600',
    overline: 'text-xs text-gray-600 uppercase',
  };

  return <Component className={`${className} ${variantMap[variant]}`}>{children}</Component>;
};
