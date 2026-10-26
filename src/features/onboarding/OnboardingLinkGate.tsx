import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useActivationLink } from './activation-link';
import { usePasswordRecoveryLink } from './password-recovery-link';

/** Both native dispatchers stay mounted while only route content waits for capture. */
const OnboardingLinkGate = ({ children }: { children: ReactNode }) => {
  const activation = useActivationLink();
  const recovery = usePasswordRecoveryLink();
  const { pathname } = useLocation();
  const ready = activation.ready && recovery.ready
    && (!activation.token || pathname === '/activate')
    && (!recovery.token || pathname === '/reset-password');
  return ready ? children : <div role="status" className="flex min-h-screen items-center justify-center bg-[color:var(--nodu-paper)] text-[color:var(--nodu-text)]">Otevírám aplikaci…</div>;
};
export default OnboardingLinkGate;
