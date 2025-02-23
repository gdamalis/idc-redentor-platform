import { useTranslations } from 'next-intl';

export const SubscribeForm = () => {
  const t = useTranslations();

  return (
    <div className="mt-10 xl:mt-0">
      <h3 className="text-sm font-semibold leading-6 text-gray-900">{t('subscribe.title')}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-900">{t('subscribe.description')} </p>
      <form className="mt-6 flex sm:max-w-md">
        <label htmlFor="email-address" className="sr-only">
          {t('subscribe.srLabel')}
        </label>
        <input
          id="email-address"
          name="email-address"
          type="email"
          required
          placeholder={t('subscribe.placeholder')}
          autoComplete="email"
          className="w-full min-w-0 appearance-none rounded-l-2xl border-0 bg-white px-3 py-1.5 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-1 focus:ring-inset focus:ring-blue-600 sm:w-56 sm:text-sm sm:leading-6"
        />
        <div className="sm:flex-shrink-0">
          <button
            type="submit"
            className="flex w-full items-center justify-center rounded-r-2xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            {t('subscribe.ctaButton')}
          </button>
        </div>
      </form>
    </div>
  );
};
