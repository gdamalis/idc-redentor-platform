import { Trans } from 'next-i18next';
import React from 'react';

type HeaderProps = {
  title: string;
  description?: string;
};

export const Header = ({ title, description }: HeaderProps) => {
  return (
    <div className="bg-white py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl lg:mx-0">
          <h2 className="inline-block animate-typing overflow-hidden whitespace-nowrap border-r-2 border-white font-mono text-4xl text-2xl font-bold tracking-tight text-gray-900 sm:text-6xl">
            <Trans
              i18nKey={title}
              components={{
                highlight: (
                  <span className="animate-highlight bg-gradient-to-r from-yellow-300 to-yellow-300 bg-[length:0%_100%] bg-left-bottom bg-no-repeat [animation-delay:3s]" />
                ),
              }}
            />
          </h2>
          <p className="mt-6 text-lg leading-8 text-gray-600">{description}</p>
        </div>
      </div>
    </div>
  );
};
