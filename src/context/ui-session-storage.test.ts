import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPersistedUiSession,
  loadPersistedUiSession,
  savePersistedUiSession,
} from './ui-session-storage';

const STORAGE_KEY = 'crewflow.ui-session.v1';

const snapshot = {
  currentTab: 'events',
  searchQuery: 'akce',
  timelogFilter: 'all',
  projectFilter: 'all',
  selectedContractorId: 3,
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
  it('round-trips a valid UI snapshot', () => {
    savePersistedUiSession(snapshot);

    expect(loadPersistedUiSession()).toEqual(snapshot);

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
      JSON.stringify({ version: 2, state: snapshot }),
    );

    expect(loadPersistedUiSession()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears and returns null for missing or invalid state', () => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1 }));

    expect(loadPersistedUiSession()).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          ...snapshot,
          selectedEventId: '11',
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
