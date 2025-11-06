import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PortalProps {
  children: ReactNode;
  id?: string;
}

export const Portal = ({ children, id = 'portal' }: PortalProps) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // This is intentional for SSR hydration - we need to wait for client-side mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);

    return () => setMounted(false);
  }, []);

  return mounted ? createPortal(children, document.querySelector(`#${id}`) || document.body) : null;
};
