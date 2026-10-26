import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../../app/providers/useAuth';
import { useAppContext } from '../../context/useAppContext';
import { appDataSource } from '../../lib/app-config';
import CrewGettingStarted from './CrewGettingStarted';
import { CrewGettingStartedContext } from './CrewGettingStartedContext';
import { hasSeenCrewGettingStarted, isGettingStartedUserId, markCrewGettingStartedSeen } from './services/getting-started-preference';

export default function CrewGettingStartedGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { role, darkMode, setCurrentTab } = useAppContext();
  const authId = auth.currentUserId;
  const enabled = import.meta.env.VITE_ONBOARDING_ENABLED === 'true' && appDataSource === 'supabase'
    && /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):55431\/?$/.test(import.meta.env.VITE_SUPABASE_URL ?? '');
  const eligible = enabled && auth.isAuthRequired === true && auth.isAuthenticated === true
    && auth.isDevSession === false && auth.isLoading === false && auth.isRoleSwitching === false
    && auth.role === 'crew' && role === 'crew' && isGettingStartedUserId(authId)
    && auth.user?.id === authId && !auth.user.is_anonymous
    && auth.session?.user.id === authId && !auth.session.user.is_anonymous && Boolean(auth.session.access_token);
  const userId = eligible ? authId : null;
  // A scope belongs to one uninterrupted eligible Auth identity. Old callbacks are
  // invalidated in layout cleanup without remounting the operational application.
  const scope = useMemo(() => ({
    userId,
    active: false,
    initialSource: userId && !hasSeenCrewGettingStarted(userId) ? 'automatic' as const : null,
  }), [userId]);
  const [selection, setSelection] = useState<{ scope: typeof scope; source: 'automatic' | 'settings' | null } | null>(null);
  const source = selection?.scope === scope ? selection.source : scope.initialSource;
  useLayoutEffect(() => {
    scope.active = true;
    return () => { scope.active = false; };
  }, [scope]);
  const controls = useMemo(() => scope.userId ? {
    openGuide: () => { if (scope.active) setSelection({ scope, source: 'settings' }); },
  } : null, [scope]);

  const dismiss = (showShifts: boolean) => {
    if (!scope.active || !scope.userId) return;
    markCrewGettingStartedSeen(scope.userId);
    setSelection({ scope, source: null });
    if (showShifts) setCurrentTab('my-shifts');
  };

  return <CrewGettingStartedContext.Provider value={controls}>
    <div hidden={Boolean(source)}>{children}</div>
    {source ? <div key={scope.userId} className={`nodu-app-shell ${darkMode ? 'dark' : ''}`} style={{ height: '100dvh' }}>
      <CrewGettingStarted fromSettings={source === 'settings'} onContinue={() => dismiss(true)} onClose={() => dismiss(false)} />
    </div> : null}
  </CrewGettingStartedContext.Provider>;
}
