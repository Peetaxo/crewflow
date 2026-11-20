import AppLoadingMark from '../../components/shared/AppLoadingMark';
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
  return ready ? children : <AppLoadingMark />;
};
export default OnboardingLinkGate;
