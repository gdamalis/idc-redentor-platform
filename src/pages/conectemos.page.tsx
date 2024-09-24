import { GetStaticProps, NextPage } from 'next';
import { useTranslation } from 'next-i18next';
import Head from 'next/head';
import React from 'react';

import { revalidateDuration } from '@src/pages/utils/constants';
import { getServerSideTranslations } from '@src/pages/utils/get-serverside-translations';

const ConectemosPage: NextPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t('conectemosPage.title')}</title>
        <meta name="description" content={t('conectemosPage.description')} />
        <meta name="keywords" content={t('conectemosPage.keywords')} />
        <meta property="og:title" content={t('conectemosPage.title')} />
        <meta property="og:description" content={t('conectemosPage.ogDescription')} />
        <meta property="og:image" content="/assets/img/redentor_logo.png" />
        <meta property="og:url" content="https://idcredentor.com/conectemos" />
        <link rel="canonical" href="https://idcredentor.com/conectemos" />
      </Head>
      <main>
        <p>ConectemosPage</p>
      </main>
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

export default ConectemosPage;
