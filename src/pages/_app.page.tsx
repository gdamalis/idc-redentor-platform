import { appWithTranslation } from 'next-i18next';
import type { AppProps } from 'next/app';
import { Nunito_Sans } from 'next/font/google';
import './utils/globals.css';

import { Layout } from '@src/components/templates/layout';

const nunitoSans = Nunito_Sans({ subsets: ['latin'], variable: '--font-nunito-sans' });

const App = ({ Component, pageProps }: AppProps) => {
  return (
    <>
      <main className={`${nunitoSans.variable} font-sans`}>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </main>
      <div id="portal" className={`${nunitoSans.variable} font-sans`} />
    </>
  );
};

export default appWithTranslation(App);
