import type { Client, Project, ReceiptItem, Timelog } from '../types';
import type { SelectedEventId } from './app-context';

const UI_SESSION_STORAGE_KEY = 'crewflow.ui-session.v2';

export type PersistedUiSessionState = {
  currentTab: string;
  searchQuery: string;
  timelogFilter: string;
  projectFilter: string;
  selectedContractorProfileId: string | null;
  selectedEventId: SelectedEventId | null;
  selectedProjectIdForStats: string | null;
  selectedClientIdForStats: number | null;
  eventTab: string;
  eventsViewMode: 'list' | 'calendar';
  eventsCalendarMode: 'month' | 'week';
  eventsFilter: 'upcoming' | 'past' | 'all';
  eventsCalendarDate: string;
  editingTimelog: Timelog | null;
  editingReceipt: ReceiptItem | null;
  editingProject: Project | null;
  editingClient: Client | null;
};

type PrivateEditorKey = 'editingTimelog' | 'editingReceipt' | 'editingProject' | 'editingClient';
const privateEditorKeys: PrivateEditorKey[] = ['editingTimelog', 'editingReceipt', 'editingProject', 'editingClient'];

type PersistedUiSessionPayload = {
  version: 2;
  state: Omit<PersistedUiSessionState, PrivateEditorKey>;
};

const isStorageAvailable = () =>
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNullableNumber = (value: unknown): value is number | null =>
  value === null || isNumber(value);

const isNullableEventId = (value: unknown): value is SelectedEventId | null =>
  value === null || isNumber(value) || isString(value);

const isPersistedUiSessionState = (value: unknown): value is PersistedUiSessionPayload['state'] =>
  isRecord(value) &&
  isString(value.currentTab) &&
  isString(value.searchQuery) &&
  isString(value.timelogFilter) &&
  isString(value.projectFilter) &&
  (value.selectedContractorProfileId === null || isString(value.selectedContractorProfileId)) &&
  isNullableEventId(value.selectedEventId) &&
  (value.selectedProjectIdForStats === null || isString(value.selectedProjectIdForStats)) &&
  isNullableNumber(value.selectedClientIdForStats) &&
  isString(value.eventTab) &&
  (value.eventsViewMode === 'list' || value.eventsViewMode === 'calendar') &&
  (value.eventsCalendarMode === 'month' || value.eventsCalendarMode === 'week') &&
  (value.eventsFilter === 'upcoming' || value.eventsFilter === 'past' || value.eventsFilter === 'all') &&
  isString(value.eventsCalendarDate);

// Allow only navigation fields; legacy payloads can contain other private keys.
const getNavigationState = (state: PersistedUiSessionPayload['state']): PersistedUiSessionPayload['state'] => ({
  currentTab: state.currentTab,
  searchQuery: state.searchQuery,
  timelogFilter: state.timelogFilter,
  projectFilter: state.projectFilter,
  selectedContractorProfileId: state.selectedContractorProfileId,
  selectedEventId: state.selectedEventId,
  selectedProjectIdForStats: state.selectedProjectIdForStats,
  selectedClientIdForStats: state.selectedClientIdForStats,
  eventTab: state.eventTab,
  eventsViewMode: state.eventsViewMode,
  eventsCalendarMode: state.eventsCalendarMode,
  eventsFilter: state.eventsFilter,
  eventsCalendarDate: state.eventsCalendarDate,
});

const safelyRemovePersistedUiSession = () => {
  try {
    window.sessionStorage.removeItem(UI_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures; the app should not crash on cleanup.
  }
};

const readUiSession = (sanitizeStorage: boolean): PersistedUiSessionState | null => {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(UI_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedUiSessionPayload>;
    if (parsed.version !== 2 || !isPersistedUiSessionState(parsed.state)) {
      if (sanitizeStorage) safelyRemovePersistedUiSession();
      return null;
    }

    // Legacy sessions contain ownerless private objects. Preserve navigation
    // while scrubbing every editor before it can be restored.
    const state: PersistedUiSessionState = { ...getNavigationState(parsed.state), editingTimelog: null, editingReceipt: null, editingProject: null, editingClient: null };
    if (sanitizeStorage && [...privateEditorKeys, 'deleteConfirm'].some((key) => key in parsed.state)) {
      safelyRemovePersistedUiSession();
      savePersistedUiSession(state);
    }
    return state;
  } catch {
    if (sanitizeStorage) safelyRemovePersistedUiSession();
    return null;
  }
};

/** Pure initialization read: React can repeat or abandon render initializers. */
export const readPersistedUiSession = () => readUiSession(false);

/** Read and scrub legacy private contents after React commits, or outside render. */
export const loadPersistedUiSession = () => readUiSession(true);

export const savePersistedUiSession = (state: PersistedUiSessionState) => {
  if (!isStorageAvailable()) {
    return;
  }

  const payload: PersistedUiSessionPayload = {
    version: 2,
    state: getNavigationState(state),
  };

  try {
    window.sessionStorage.setItem(UI_SESSION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures; the app should keep running without persistence.
  }
};

export const clearPersistedUiSession = () => {
  if (!isStorageAvailable()) {
    return;
  }

  safelyRemovePersistedUiSession();
};
