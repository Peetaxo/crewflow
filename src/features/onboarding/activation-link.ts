import { createContext, useContext } from 'react';

export const isActivationToken = (token: string): boolean => /^[a-f0-9]{64}$/.test(token);

const fragmentToken = (hash: string): string | null => {
  const match = /^#token=([a-f0-9]{64})$/.exec(hash);
  return match?.[1] ?? null;
};

/** Native handoff accepts only explicitly trusted destinations, with no redirects. */
export const parseActivationLink = (value: string, trustedHttpsOrigins: readonly string[] = []): string | null => {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search) return null;

    const isPilot = url.protocol === 'nodu:' && url.host === 'activate' && url.pathname === '';
    const isTrustedWeb = url.protocol === 'https:' && url.pathname === '/activate'
      && trustedHttpsOrigins.includes(url.origin);
    if (!isPilot && !isTrustedWeb) return null;

    return fragmentToken(url.hash);
  } catch {
    return null;
  }
};

/** Take a same-origin browser capability and scrub it before the form is painted. */
export const consumeBrowserActivationToken = (): string | null => {
  if (window.location.pathname !== '/activate') return null;
  const token = window.location.search ? null : fragmentToken(window.location.hash);
  window.history.replaceState(null, '', '/activate');
  return token;
};
export type ActivationLinkState = {
  token: string | null;
  revision: number;
  ready: boolean;
  clearToken: () => void;
};

export const ActivationLinkContext = createContext<ActivationLinkState | null>(null);

export const useActivationLink = (): ActivationLinkState => {
  const value = useContext(ActivationLinkContext);
  if (!value) throw new Error('Activation link provider is missing.');
  return value;
};
