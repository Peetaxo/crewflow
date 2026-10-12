import { useEffect } from 'react';
import { useAuth } from '../../../app/providers/useAuth';
import { recordMyActivity } from '../services/crew-activity.service';

/** Observe foreground use only, including return from background. Idle tabs do not ping. */
export default function AppActivityTracker() {
  const { isAuthRequired, isAuthenticated, isDevSession, currentUserId } = useAuth();
  useEffect(() => {
    if (!isAuthRequired || !isAuthenticated || isDevSession || !currentUserId) return;
    const controller = new AbortController();
    let lastAttempt = -Infinity;
    let pending = false;
    const record = () => {
      const now = Date.now();
      if (controller.signal.aborted || document.visibilityState !== 'visible' || pending || now - lastAttempt < 60_000) return;
      lastAttempt = now;
      pending = true;
      void recordMyActivity(controller.signal).catch(() => {
        // Optional metadata must never interrupt normal work or offline use.
        lastAttempt = now - 30_000;
      }).finally(() => { pending = false; });
    };
    record();
    document.addEventListener('visibilitychange', record);
    document.addEventListener('pointerdown', record, { passive: true });
    document.addEventListener('keydown', record);
    document.addEventListener('scroll', record, { passive: true, capture: true });
    window.addEventListener('focus', record);
    return () => {
      controller.abort();
      document.removeEventListener('visibilitychange', record);
      document.removeEventListener('pointerdown', record);
      document.removeEventListener('keydown', record);
      document.removeEventListener('scroll', record, true);
      window.removeEventListener('focus', record);
    };
  }, [isAuthRequired, isAuthenticated, isDevSession, currentUserId]);
  return null;
}
