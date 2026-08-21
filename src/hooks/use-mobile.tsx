import * as React from 'react';

const MOBILE_BREAKPOINT = 768;

const getIsMobile = () => (
  typeof window === 'undefined' ? false : window.innerWidth < MOBILE_BREAKPOINT
);

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(getIsMobile);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(getIsMobile());

    mql.addEventListener('change', onChange);
    setIsMobile(getIsMobile());
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
