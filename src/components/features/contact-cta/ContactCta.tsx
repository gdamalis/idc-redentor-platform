import { useTranslation } from 'next-i18next';
import Link from 'next/link';

export const ContactCta = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-indigo-700">
      <div className="px-6 py-24 sm:px-6 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {t('contactCta.title')}
          </h2>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              href="/conectemos"
              className="rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-indigo-600 shadow-sm hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t('contactCta.ctaButton')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
