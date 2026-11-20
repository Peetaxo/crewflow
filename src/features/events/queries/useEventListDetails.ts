import { useMemo, useSyncExternalStore } from 'react';
import type { SelectedEventId } from '../../../context/app-context';
import { getLocalAppState, getLocalAppStateRevision, subscribeToLocalAppState } from '../../../lib/app-data';
import { getEventDetailData } from '../services/events.service';

/** Occurrences and crew filters share one detached snapshot until the app publishes new data. */
export function useEventListDetails() {
  const revision = useSyncExternalStore(subscribeToLocalAppState, getLocalAppStateRevision);
  return useMemo(() => {
    let snapshot: ReturnType<typeof getLocalAppState> | undefined;
    const details = new Map<SelectedEventId, ReturnType<typeof getEventDetailData>>();
    return (id: SelectedEventId) => {
      const cached = details.get(id);
      if (cached) return cached;
      snapshot ??= getLocalAppState();
      const detail = getEventDetailData(id, snapshot);
      details.set(id, detail);
      return detail;
    };
    // The revision retires the complete lookup, including assignment-only changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);
}
