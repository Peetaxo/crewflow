import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsView from './SettingsView';

const state = vi.hoisted(() => ({
  isMobile: true,
  isAuthRequired: true,
  signOut: vi.fn<() => Promise<void>>(),
  toastError: vi.fn(),
}));

vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: () => state.isMobile,
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({
    currentProfileId: 'profile-1',
    isAuthRequired: state.isAuthRequired,
    profile: { firstName: 'Petr', lastName: 'Heitzer', email: 'petr@example.com' },
    signOut: state.signOut,
  }),
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    darkMode: false,
    setDarkMode: vi.fn(),
    settingsSection: 'menu',
    setSettingsSection: vi.fn(),
  }),
}));

vi.mock('../features/crew/services/crew.service', () => ({
  getContractors: () => [],
  subscribeToCrewChanges: () => () => undefined,
  updateContractor: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: state.toastError },
}));

describe.each([
  ['mobile', true],
  ['desktop', false],
] as const)('SettingsView %s sign out', (_viewport, isMobile) => {
  beforeEach(() => {
    state.isMobile = isMobile;
    state.isAuthRequired = true;
    state.signOut.mockReset().mockResolvedValue(undefined);
    state.toastError.mockReset();
  });

  it('signs out immediately from settings', async () => {
    render(<SettingsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Odhlásit se' }));

    await waitFor(() => expect(state.signOut).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('hides sign out when authentication is not required', () => {
    state.isAuthRequired = false;
    render(<SettingsView />);
    expect(screen.queryByRole('button', { name: 'Odhlásit se' })).not.toBeInTheDocument();
  });

  it('disables sign out while the request is pending', async () => {
    let finishSignOut: (() => void) | undefined;
    state.signOut.mockImplementationOnce(() => new Promise<void>((resolve) => { finishSignOut = resolve; }));
    render(<SettingsView />);

    const button = screen.getByRole('button', { name: 'Odhlásit se' });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAccessibleName('Odhlašuji…');
    fireEvent.click(button);
    expect(state.signOut).toHaveBeenCalledTimes(1);

    finishSignOut?.();
    await waitFor(() => expect(button).toBeEnabled());
  });

  it('reports a sign out error and enables retry', async () => {
    state.signOut.mockRejectedValueOnce(new Error('Síť není dostupná.'));
    render(<SettingsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Odhlásit se' }));

    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith('Síť není dostupná.'));
    expect(screen.getByRole('button', { name: 'Odhlásit se' })).toBeEnabled();
  });
});
