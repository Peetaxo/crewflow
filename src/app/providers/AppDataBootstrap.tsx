import { useEffect, useRef, useState, type ReactNode } from 'react';
import AppLoadingMark from '../../components/shared/AppLoadingMark';
import { appDataSource } from '../../lib/app-config';
import { bootstrapInitialAppData } from './initial-app-data-bootstrap';
import { useAuth } from './useAuth';

type BootstrapStatus = 'loading' | 'ready' | 'error';

const AppDataBootstrap = ({ children }: { children: ReactNode }) => {
  const {
    currentProfileId,
    currentUserId,
    isAuthRequired,
    isAuthenticated,
    role,
  } = useAuth();
  const scopeKey = isAuthRequired
    ? [currentUserId ?? currentProfileId ?? 'authenticated', role ?? 'unknown'].join(':')
    : 'local';
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ scopeKey: string; status: BootstrapStatus }>({
    scopeKey,
    status: appDataSource === 'supabase' && isAuthRequired ? 'loading' : 'ready',
  });
  const generation = useRef(0);

  useEffect(() => {
    if (appDataSource !== 'supabase' || !isAuthRequired) {
      setState({ scopeKey, status: 'ready' });
      return;
    }
    if (!isAuthenticated) return;

    const currentGeneration = ++generation.current;
    setState({ scopeKey, status: 'loading' });
    void bootstrapInitialAppData()
      .then(() => {
        if (generation.current === currentGeneration) {
          setState({ scopeKey, status: 'ready' });
        }
      })
      .catch((error) => {
        if (generation.current !== currentGeneration) return;
        console.error('Initial app data bootstrap failed', error);
        setState({ scopeKey, status: 'error' });
      });

    return () => {
      generation.current += 1;
    };
  }, [attempt, isAuthRequired, isAuthenticated, scopeKey]);

  const status = state.scopeKey === scopeKey ? state.status : 'loading';
  if (status === 'loading') return <AppLoadingMark />;
  if (status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center px-5">
        <div role="alert" className="nodu-dashboard-panel max-w-sm rounded-[28px] p-5 text-center">
          <p>Data aplikace se nepodařilo načíst.</p>
          <button
            type="button"
            className="mt-4 rounded-xl bg-[color:var(--nodu-accent)] px-4 py-2 text-white"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Zkusit znovu
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AppDataBootstrap;
