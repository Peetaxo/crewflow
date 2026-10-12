import { useEffect, useState } from 'react';
import { useAuth } from '../../app/providers/useAuth';
import { readCrewActivity } from './services/crew-activity.service';

export function useCrewActivity(enabled: boolean) {
  const { currentUserId, currentProfileId, role, isAuthRequired } = useAuth();
  const scope = JSON.stringify([currentUserId, currentProfileId, role, isAuthRequired, enabled]);
  const [state, setState] = useState<{ scope: string; data: Record<string, string>; status: 'ready' | 'error' } | null>(null);
  useEffect(() => {
    if (!enabled || !isAuthRequired) return;
    const controller = new AbortController();
    let pending = false;
    const load = async () => {
      if (pending || controller.signal.aborted || document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const data = await readCrewActivity(controller.signal);
        if (!controller.signal.aborted) setState({ scope, data, status: 'ready' });
      } catch {
        if (!controller.signal.aborted) setState({ scope, data: {}, status: 'error' });
      } finally { pending = false; }
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, 60_000);
    document.addEventListener('visibilitychange', load);
    window.addEventListener('focus', load);
    return () => {
      controller.abort(); window.clearInterval(interval);
      document.removeEventListener('visibilitychange', load); window.removeEventListener('focus', load);
    };
  }, [enabled, isAuthRequired, scope]);
  if (!enabled || !isAuthRequired) return { data: {}, status: 'ready' as const };
  return state?.scope === scope ? state : { data: {}, status: 'loading' as const };
}
