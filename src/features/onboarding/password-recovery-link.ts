import { createContext, useContext } from 'react';

export const isRecoveryToken = (value: string): boolean => /^[A-Za-z0-9_-]{20,512}$/.test(value);
const fragmentToken = (hash: string): string | null => /^#token_hash=([A-Za-z0-9_-]{20,512})$/.exec(hash)?.[1] ?? null;

/** Recovery's test-only native scheme cannot collide with the ordinary installation. */
export const parsePasswordRecoveryLink = (value: string): string | null => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'nodu-test:' || url.host !== 'reset-password' || url.pathname !== ''
      || url.username || url.password || url.search) return null;
    return fragmentToken(url.hash);
  } catch {
    return null;
  }
};

/** Capture only this browser route and remove capability material before paint. */
export const consumeBrowserRecoveryToken = (): string | null => {
  if (window.location.pathname !== '/reset-password') return null;
  const token = window.location.search ? null : fragmentToken(window.location.hash);
  window.history.replaceState(null, '', '/reset-password');
  return token;
};

export type PasswordRecoveryLinkState = { token: string | null; revision: number; ready: boolean; clearToken: () => void };
export const PasswordRecoveryLinkContext = createContext<PasswordRecoveryLinkState | null>(null);
export const usePasswordRecoveryLink = (): PasswordRecoveryLinkState => {
  const value = useContext(PasswordRecoveryLinkContext);
  if (!value) throw new Error('Password recovery link provider is missing.');
  return value;
};
