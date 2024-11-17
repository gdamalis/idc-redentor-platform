import { GetStaticProps, NextPage } from 'next';
import { useTranslation } from 'next-i18next';
import Head from 'next/head';

import { ContactCta } from '@src/components/features/contact-cta';
import { CredoSection } from '@src/components/features/credo-section';
import { OurMissionSection } from '@src/components/features/our-mission-section';
import { Container } from '@src/components/shared/container';
import { Typography } from '@src/components/shared/typography';
import { Header } from '@src/components/templates/header/Header';
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
        <Header title={t('comunidadPage.headerTitle')} className="bg-community" />

        <div className="bg-indigo-600/20 ">
          <Container className="max-w-5xl py-16 text-center sm:py-24">
            <Typography component="p" variant="body1" className="text-xl md:text-2xl">
              La Iglesia de Cristo Redentor es una comunidad cristiana que busca proclamar las
              buenas nuevas del reino de Dios en Buenos Aires a través de la enseñanza de la
              Palabra, la vida comunitaria y la misión.
            </Typography>
            <Typography component="p" variant="body1" className="mt-6 text-xl md:text-2xl">
              Somos una comunidad integrada por personas de diferentes países con profesiones
              diferentes.
            </Typography>
            <Typography component="p" variant="body1" className="mt-6 text-xl md:text-2xl">
              Más allá de lo que hacemos, somos cristianos, seguidores de Jesús. No somos perfectos
              pero hemos sido redimidos. Dios nos ha llamado, por su misericordia a formar parte de
              su pueblo para anunciar al mundo lo que El ha hecho por nosotros.
            </Typography>
          </Container>
        </div>

        <CredoSection />
        <OurMissionSection />
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
