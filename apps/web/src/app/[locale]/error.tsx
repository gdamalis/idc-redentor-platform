"use client";

import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

interface ErrorPageProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const locale = useLocale();
  const t = useTranslations("error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 ">
      <div className="max-w-lg p-8  shadow-lg rounded-lg">
        <div className="flex justify-center mb-8">
          {/* Light Mode Logo */}
          <Image
            src="/assets/img/redentor_logo_100.png"
            className="block h-24 w-24 dark:hidden"
            width={96}
            height={96}
            alt="Redentor church logo"
            priority
          />
          {/* Dark Mode Logo */}
          <Image
            src="/assets/img/redentor_logo_light_100.png"
            className="hidden h-24 w-24 dark:block"
            width={96}
            height={96}
            alt="Redentor church logo"
            priority
          />
        </div>
        <h1 className="text-4xl font-bold mb-4 text-gray-900">{t("title")}</h1>
        <p className="mb-8 text-lg text-gray-600">{t("description")}</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {t("tryAgain")}
          </button>
          <Link
            href={`/${locale}`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            {t("backToHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}
