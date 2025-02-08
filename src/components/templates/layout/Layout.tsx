import { ReactNode } from 'react';

import { Footer } from '../footer';
import { Navbar } from '../navbar';

interface LayoutPropsInterface {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutPropsInterface) => {
  return (
    <>
      <Navbar />
      {children}
      <Footer />
    </>
  );
};
