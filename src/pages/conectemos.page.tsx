import { GetStaticProps, NextPage } from 'next';
import { useTranslation } from 'next-i18next';
import Head from 'next/head';

import { ContactForm } from '@src/components/features/contact-form/ContactForm';
import { ContactInformationSection } from '@src/components/features/contact-information-section';
import { Container } from '@src/components/shared/container';
import { Typography } from '@src/components/shared/typography';
import { Header } from '@src/components/templates/header';
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
      <div>
        <Header title={t('conectemosPage.headerTitle')} className="bg-community" />

        <div className="bg-indigo-600/20 ">
          <Container className="max-w-5xl py-16 text-center sm:py-24">
            <Typography component="p" variant="body1" className="text-xl md:text-2xl">
              Ser parte de nuestra comunidad es una gran responsabilidad igual que a formar parte de
              una familia. Cada miembro de la comunidad es un miembro imprescindible. Dios va
              juntando hijos suyos para formar parte de esta comunidad que sirve y da testimonio
              acerca de la persona y obra de Cristo en nuestro mundo.
            </Typography>
          </Container>
        </div>

        <ContactInformationSection />
        <ContactForm />
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

export default ConectemosPage;
