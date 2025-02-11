import Link from 'next/link';
import React from 'react';

import { classNames } from '@src/utils/classNames';

type ButtonProps = {
  href: string;
  label: string;
  className?: string;
  target?: string;
  isExternal?: boolean;
};

export const Button: React.FC<ButtonProps> = ({
  href,
  label,
  className = '',
  target = '_self',
  isExternal = false,
}) => {
  const baseClasses =
    'rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

  const combinedClasses = classNames(baseClasses, className);

  return isExternal ? (
    <a
      href={href}
      target={target}
      rel={target === '_blank' ? 'noopener noreferrer' : undefined}
      className={combinedClasses}
    >
      {label}
    </a>
  ) : (
    <Link href={href}>
      <a className={combinedClasses}>{label}</a>
    </Link>
  );
};
