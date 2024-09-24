import { GetStaticProps, NextPage } from 'next';
import { useTranslation } from 'next-i18next';
import Head from 'next/head';

import { ContactCta } from '@src/components/features/contact-cta';
import { revalidateDuration } from '@src/pages/utils/constants';
import { getServerSideTranslations } from '@src/pages/utils/get-serverside-translations';

const ComunidadPage: NextPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t('comunidadPage.title')}</title>
        <meta name="description" content={t('comunidadPage.description')} />
        <meta name="keywords" content={t('comunidadPage.keywords')} />
        <meta property="og:title" content={t('comunidadPage.title')} />
        <meta property="og:description" content={t('comunidadPage.ogDescription')} />
        <meta property="og:image" content="/assets/img/redentor_logo.png" />
        <meta property="og:url" content="https://idcredentor.com/comunidad" />
        <link rel="canonical" href="https://idcredentor.com/comunidad" />
      </Head>
      <div>
        <div className="container mx-auto max-w-7xl px-6 pb-8 pt-16 lg:px-8">
          <p>ComunidadPage</p>
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

export default ComunidadPage;
