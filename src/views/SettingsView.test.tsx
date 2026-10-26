import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsView from './SettingsView';
import CrewGettingStartedGate from '../features/onboarding/CrewGettingStartedGate';

const state = vi.hoisted(() => ({
  isMobile: true,
  isAuthRequired: true,
  signOut: vi.fn<() => Promise<void>>(),
  toastError: vi.fn(),
  role: 'crew' as 'crew' | 'crewhead' | 'coo',
  isDevSession: false,
  isLoading: false,
  isRoleSwitching: false,
  currentUserId: '11111111-1111-4111-8111-111111111111',
  setCurrentTab: vi.fn(),
  setSettingsSection: vi.fn(),
  updateContractor: vi.fn(),
  authMutation: vi.fn(),
}));

vi.mock('../hooks/use-mobile', () => ({
  useIsMobile: () => state.isMobile,
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({
    currentProfileId: 'profile-1',
    currentUserId: state.currentUserId,
    isAuthenticated: true,
    isDevSession: state.isDevSession,
    isLoading: state.isLoading,
    isRoleSwitching: state.isRoleSwitching,
    role: state.role,
    user: { id: state.currentUserId, is_anonymous: false },
    session: { user: { id: state.currentUserId, is_anonymous: false }, access_token: 'private-test-session' },
    signIn: state.authMutation,
    switchRole: state.authMutation,
    isAuthRequired: state.isAuthRequired,
    profile: { firstName: 'Petr', lastName: 'Heitzer', email: 'petr@example.com' },
    signOut: state.signOut,
  }),
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    darkMode: false,
    role: state.role,
    setCurrentTab: state.setCurrentTab,
    setDarkMode: vi.fn(),
    settingsSection: 'menu',
    setSettingsSection: state.setSettingsSection,
  }),
}));

vi.mock('../features/crew/services/crew.service', () => ({
  getContractors: () => [],
  subscribeToCrewChanges: () => () => undefined,
  updateContractor: state.updateContractor,
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


describe('SettingsView crew guide', () => {
  beforeEach(() => {
    state.isAuthRequired = true;
    state.role = 'crew';
    state.isDevSession = false;
    state.isLoading = false;
    state.isRoleSwitching = false;
    state.currentUserId = '11111111-1111-4111-8111-111111111111';
    state.setCurrentTab.mockClear();
    state.setSettingsSection.mockClear();
    state.updateContractor.mockClear();
    state.authMutation.mockClear();
    state.signOut.mockClear();
    window.localStorage.clear();
    window.localStorage.setItem(`nodu:crew-getting-started:v1:${state.currentUserId}`, 'dismissed');
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true');
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431');
  });
  afterEach(() => vi.unstubAllEnvs());
  const settings = () => <CrewGettingStartedGate><SettingsView /></CrewGettingStartedGate>;

  it('reopens the same guide and returns to settings without changing the settings section', () => {
    render(settings());
    fireEvent.click(screen.getByRole('button', { name: /Jak používat nodu/ }));
    expect(screen.getByRole('heading', { name: 'Jak používat nodu', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Zpět do nastavení' }));
    expect(screen.getByRole('heading', { name: 'Nastavení' })).toBeInTheDocument();
    expect(state.setCurrentTab).not.toHaveBeenCalled();
    expect(state.setSettingsSection).not.toHaveBeenCalled();
    expect(state.updateContractor).not.toHaveBeenCalled();
    expect(state.authMutation).not.toHaveBeenCalled();
    expect(state.signOut).not.toHaveBeenCalled();
  });

  it('navigates to My Shifts when continuing from the reopened guide', () => {
    render(settings());
    fireEvent.click(screen.getByRole('button', { name: /Jak používat nodu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Zobrazit směny' }));
    expect(state.setCurrentTab).toHaveBeenCalledExactlyOnceWith('my-shifts');
    expect(state.setSettingsSection).not.toHaveBeenCalled();
  });

  it.each(['manager', 'dev session', 'disabled', 'role switching'] as const)('omits the guide control for %s', (mode) => {
    if (mode === 'manager') state.role = 'coo';
    if (mode === 'dev session') state.isDevSession = true;
    if (mode === 'disabled') vi.stubEnv('VITE_ONBOARDING_ENABLED', 'false');
    if (mode === 'role switching') state.isRoleSwitching = true;
    render(settings());
    expect(screen.queryByRole('button', { name: /Jak používat nodu/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fakturace/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upozornění/ })).toBeInTheDocument();
  });

  it('drops the reopened guide when the account changes', () => {
    const view = render(settings());
    fireEvent.click(screen.getByRole('button', { name: /Jak používat nodu/ }));
    state.currentUserId = '22222222-2222-4222-8222-222222222222';
    window.localStorage.setItem(`nodu:crew-getting-started:v1:${state.currentUserId}`, 'dismissed');
    view.rerender(settings());
    expect(screen.getByRole('heading', { name: 'Nastavení' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Jak používat nodu', level: 1 })).not.toBeInTheDocument();
  });
});
