import { useEffect, useRef, useState, type ReactNode } from 'react';
import AppLoadingMark from '../../components/shared/AppLoadingMark';
import { appDataSource } from '../../lib/app-config';
import { bootstrapInitialAppData } from './initial-app-data-bootstrap';
import { useAuth } from './useAuth';

type BootstrapStatus = 'loading' | 'ready' | 'error';

export const AUTHENTICATED_LOADING_INTRO_MS = 1_800;

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

const AppDataBootstrap = ({ children }: { children: ReactNode }) => {
  const {
    currentProfileId,
    currentUserId,
    isAuthRequired,
    isAuthenticated,
    isLoading: isAuthLoading,
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
  const introStartedAt = useRef<number | null>(isAuthenticated ? Date.now() : null);
  const hasCompletedInitialIntro = useRef(false);
  const readyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (readyTimer.current !== null) {
      clearTimeout(readyTimer.current);
      readyTimer.current = null;
    }

    if (appDataSource !== 'supabase' || !isAuthRequired) {
      hasCompletedInitialIntro.current = true;
      setState({ scopeKey, status: 'ready' });
      return;
    }
    if (!isAuthenticated) return;

    if (introStartedAt.current === null) {
      introStartedAt.current = Date.now();
    }

    if (isAuthLoading) {
      setState({ scopeKey, status: 'loading' });
      return;
    }

    const currentGeneration = ++generation.current;
    setState({ scopeKey, status: 'loading' });

    const revealChildren = () => {
      readyTimer.current = null;
      if (generation.current !== currentGeneration) return;
      hasCompletedInitialIntro.current = true;
      setState({ scopeKey, status: 'ready' });
    };

    void bootstrapInitialAppData()
      .then(() => {
        if (generation.current !== currentGeneration) return;

        const elapsed = Date.now() - (introStartedAt.current ?? Date.now());
        const remainingIntro = hasCompletedInitialIntro.current || prefersReducedMotion()
          ? 0
          : Math.max(0, AUTHENTICATED_LOADING_INTRO_MS - elapsed);

        if (remainingIntro === 0) {
          revealChildren();
          return;
        }

        readyTimer.current = setTimeout(revealChildren, remainingIntro);
      })
      .catch((error) => {
        if (generation.current !== currentGeneration) return;
        console.error('Initial app data bootstrap failed', error);
        setState({ scopeKey, status: 'error' });
      });

    return () => {
      generation.current += 1;
      if (readyTimer.current !== null) {
        clearTimeout(readyTimer.current);
        readyTimer.current = null;
      }
    };
  }, [attempt, isAuthLoading, isAuthRequired, isAuthenticated, scopeKey]);

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
