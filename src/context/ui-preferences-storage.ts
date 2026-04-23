const UI_PREFS_STORAGE_KEY = 'crewflow.ui-prefs.v1';

export type PersistedUiPreferences = {
  darkMode: boolean;
  sidebarCollapsed: boolean;
};

type PersistedUiPreferencesPayload = {
  version: 1;
  state: PersistedUiPreferences;
};

const isStorageAvailable = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const safelyRemoveUiPreferences = () => {
  try {
    window.localStorage.removeItem(UI_PREFS_STORAGE_KEY);
  } catch {
    // Ignore storage failures; the app should keep running without persistence.
  }
};

export const loadUiPreferences = (): PersistedUiPreferences | null => {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(UI_PREFS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedUiPreferencesPayload>;
    const { darkMode, sidebarCollapsed } = parsed.state ?? {};

    if (
      parsed.version !== 1
      || typeof darkMode !== 'boolean'
      || typeof sidebarCollapsed !== 'boolean'
    ) {
      safelyRemoveUiPreferences();
      return null;
    }

    return { darkMode, sidebarCollapsed };
  } catch {
    safelyRemoveUiPreferences();
    return null;
  }
};

export const saveUiPreferences = (state: PersistedUiPreferences) => {
  if (!isStorageAvailable()) {
    return;
  }

  const payload: PersistedUiPreferencesPayload = {
    version: 1,
    state,
  };

  try {
    window.localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures; the app should keep running without persistence.
  }
};
