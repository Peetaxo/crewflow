import type { Client, Project, ReceiptItem, Timelog } from '../types';

const UI_SESSION_STORAGE_KEY = 'crewflow.ui-session.v2';

export type PersistedUiSessionState = {
  currentTab: string;
  searchQuery: string;
  timelogFilter: string;
  projectFilter: string;
  selectedContractorProfileId: string | null;
  selectedEventId: number | null;
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

type PersistedUiSessionPayload = {
  version: 2;
  state: PersistedUiSessionState;
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

const isTimelogDay = (value: unknown): value is Timelog['days'][number] =>
  isRecord(value) &&
  isString(value.d) &&
  isString(value.f) &&
  isString(value.t) &&
  isString(value.type);

const isTimelog = (value: unknown): value is Timelog =>
  isRecord(value) &&
  isNumber(value.id) &&
  isNumber(value.eid) &&
  isNumber(value.cid) &&
  Array.isArray(value.days) &&
  value.days.every(isTimelogDay) &&
  isNumber(value.km) &&
  isString(value.note) &&
  isString(value.status);

const isReceiptItem = (value: unknown): value is ReceiptItem =>
  isRecord(value) &&
  isNumber(value.id) &&
  isNumber(value.cid) &&
  isNumber(value.eid) &&
  isString(value.job) &&
  isString(value.title) &&
  isString(value.vendor) &&
  isNumber(value.amount) &&
  isString(value.paidAt) &&
  isString(value.note) &&
  isString(value.status);

const isProject = (value: unknown): value is Project =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isString(value.client) &&
  (value.note === undefined || isString(value.note)) &&
  isString(value.createdAt);

const isClient = (value: unknown): value is Client =>
  isRecord(value) &&
  isNumber(value.id) &&
  isString(value.name) &&
  (value.ico === undefined || isString(value.ico)) &&
  (value.dic === undefined || isString(value.dic)) &&
  (value.street === undefined || isString(value.street)) &&
  (value.zip === undefined || isString(value.zip)) &&
  (value.city === undefined || isString(value.city)) &&
  (value.country === undefined || isString(value.country)) &&
  (value.note === undefined || isString(value.note));

const isPersistedUiSessionState = (value: unknown): value is PersistedUiSessionState =>
  isRecord(value) &&
  isString(value.currentTab) &&
  isString(value.searchQuery) &&
  isString(value.timelogFilter) &&
  isString(value.projectFilter) &&
  (value.selectedContractorProfileId === null || isString(value.selectedContractorProfileId)) &&
  isNullableNumber(value.selectedEventId) &&
  (value.selectedProjectIdForStats === null || isString(value.selectedProjectIdForStats)) &&
  isNullableNumber(value.selectedClientIdForStats) &&
  isString(value.eventTab) &&
  (value.eventsViewMode === 'list' || value.eventsViewMode === 'calendar') &&
  (value.eventsCalendarMode === 'month' || value.eventsCalendarMode === 'week') &&
  (value.eventsFilter === 'upcoming' || value.eventsFilter === 'past' || value.eventsFilter === 'all') &&
  isString(value.eventsCalendarDate) &&
  (value.editingTimelog === null || isTimelog(value.editingTimelog)) &&
  (value.editingReceipt === null || isReceiptItem(value.editingReceipt)) &&
  (value.editingProject === null || isProject(value.editingProject)) &&
  (value.editingClient === null || isClient(value.editingClient));

const safelyRemovePersistedUiSession = () => {
  try {
    window.sessionStorage.removeItem(UI_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures; the app should not crash on cleanup.
  }
};

export const loadPersistedUiSession = (): PersistedUiSessionState | null => {
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
      safelyRemovePersistedUiSession();
      return null;
    }

    return parsed.state;
  } catch {
    safelyRemovePersistedUiSession();
    return null;
  }
};

export const savePersistedUiSession = (state: PersistedUiSessionState) => {
  if (!isStorageAvailable()) {
    return;
  }

  const payload: PersistedUiSessionPayload = {
    version: 2,
    state,
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
