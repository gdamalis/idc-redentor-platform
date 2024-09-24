import { GetStaticProps, NextPage } from 'next';
import { useTranslation } from 'next-i18next';
import Head from 'next/head';

import { ContactCta } from '@src/components/features/contact-cta';
import { revalidateDuration } from '@src/pages/utils/constants';
import { getServerSideTranslations } from '@src/pages/utils/get-serverside-translations';

const QuienEsJesusPage: NextPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t('quienEsJesusPage.title')}</title>
        <meta name="description" content={t('quienEsJesusPage.description')} />
        <meta name="keywords" content={t('quienEsJesusPage.keywords')} />
        <meta property="og:title" content={t('quienEsJesusPage.title')} />
        <meta property="og:description" content={t('quienEsJesusPage.ogDescription')} />
        <meta property="og:image" content="/assets/img/redentor_logo.png" />
        <meta property="og:url" content="https://idcredentor.com/quien-es-jesus" />
        <link rel="canonical" href="https://idcredentor.com/quien-es-jesus" />
      </Head>
      <div>
        <div className="container mx-auto max-w-7xl px-6 pb-8 pt-16 lg:px-8">
          <p>QuienEsJesusPage</p>
        </div>
        <ContactCta />
      </div>
    </>
  );
};

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  try {
    return {
      revalidate: revalidateDuration,
      props: {
        ...(await getServerSideTranslations(locale)),
      },
    };
  } catch {
    return {
      revalidate: revalidateDuration,
      notFound: true,
    };
  }
};

export default QuienEsJesusPage;
