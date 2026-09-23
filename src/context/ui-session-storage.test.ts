import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Timelog } from '../types';
import {
  clearPersistedUiSession,
  loadPersistedUiSession,
  savePersistedUiSession,
} from './ui-session-storage';

const STORAGE_KEY = 'crewflow.ui-session.v2';

const snapshot = {
  currentTab: 'events',
  searchQuery: 'akce',
  timelogFilter: 'all',
  projectFilter: 'all',
  selectedContractorProfileId: 'abc-uuid-1',
  selectedEventId: 11,
  selectedProjectIdForStats: 'AK001',
  selectedClientIdForStats: 4,
  eventTab: 'overview',
  eventsViewMode: 'calendar' as const,
  eventsCalendarMode: 'month' as const,
  eventsFilter: 'upcoming' as const,
  eventsCalendarDate: '2026-04-23',
  editingTimelog: null,
  editingReceipt: null,
  editingProject: null,
  editingClient: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('ui session storage', () => {
  const privateTimelog: Timelog = {
    id: 7, eid: 11, contractorProfileId: 'private-contractor',
    days: [{ d: '2026-09-23', f: '08:00', t: '17:00', type: 'instal' }],
    km: 12, note: 'private hours note', status: 'draft',
  };

  it('never serializes the open evidence or its contents', () => {
    savePersistedUiSession({ ...snapshot, editingTimelog: privateTimelog });
    const raw = window.sessionStorage.getItem(STORAGE_KEY)!;

    expect(JSON.parse(raw).state).not.toHaveProperty('editingTimelog');
    expect(raw).not.toContain('private-contractor');
    expect(raw).not.toContain('private hours note');
    expect(loadPersistedUiSession()?.editingTimelog).toBeNull();
  });

  it('discards and removes legacy evidence while retaining navigation', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2, state: { ...snapshot, editingTimelog: privateTimelog },
    }));

    expect(loadPersistedUiSession()).toEqual(snapshot);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).not.toContain('private hours note');
  });

  it('removes legacy private content even if persisting the sanitized navigation fails', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2, state: { ...snapshot, editingTimelog: privateTimelog },
    }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });

    expect(loadPersistedUiSession()).toEqual(snapshot);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('round-trips a valid UI snapshot', () => {
    savePersistedUiSession(snapshot);

    expect(loadPersistedUiSession()).toEqual(snapshot);

    savePersistedUiSession({ ...snapshot, selectedEventId: 'event-uuid-1' });
    expect(loadPersistedUiSession()?.selectedEventId).toBe('event-uuid-1');

    clearPersistedUiSession();
    expect(loadPersistedUiSession()).toBeNull();
  });

  it('clears and returns null for malformed JSON', () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{broken-json');

    expect(loadPersistedUiSession()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears and returns null for wrong version', () => {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 3, state: snapshot }),
    );

    expect(loadPersistedUiSession()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears and returns null for missing or invalid state', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2 }));

    expect(loadPersistedUiSession()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        state: {
          ...snapshot,
          selectedEventId: {},
        },
      }),
    );

    expect(loadPersistedUiSession()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not throw when save and clear hit storage errors', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(() => savePersistedUiSession(snapshot)).not.toThrow();
    expect(() => clearPersistedUiSession()).not.toThrow();

    expect(setItemSpy).toHaveBeenCalled();
    expect(removeItemSpy).toHaveBeenCalled();
  });
});
