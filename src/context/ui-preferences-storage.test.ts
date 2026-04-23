import { describe, expect, it } from 'vitest';
import { loadUiPreferences, saveUiPreferences } from './ui-preferences-storage';

describe('ui preferences storage', () => {
  it('round-trips stored preferences', () => {
    const prefs = {
      darkMode: true,
      sidebarCollapsed: false,
    };

    saveUiPreferences(prefs);

    expect(loadUiPreferences()).toEqual(prefs);
  });

  it('returns null and removes invalid JSON payload', () => {
    window.localStorage.setItem('crewflow.ui-prefs.v1', '{broken-json');

    expect(loadUiPreferences()).toBeNull();
    expect(window.localStorage.getItem('crewflow.ui-prefs.v1')).toBeNull();
  });

  it('returns null and removes wrong payload version', () => {
    window.localStorage.setItem(
      'crewflow.ui-prefs.v1',
      JSON.stringify({
        version: 2,
        state: {
          darkMode: true,
          sidebarCollapsed: false,
        },
      }),
    );

    expect(loadUiPreferences()).toBeNull();
    expect(window.localStorage.getItem('crewflow.ui-prefs.v1')).toBeNull();
  });
});
