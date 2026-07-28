import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setSettingsSection = vi.fn();
const setDarkMode = vi.fn();
const signOut = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

const contractor = {
  id: 1,
  profileId: 'profile-1',
  name: 'Petr Heitzer',
  ii: 'PH',
  bg: '#dbeafe',
  fg: '#1d4ed8',
  tags: [],
  events: 0,
  rate: 300,
  phone: '721 000 000',
  email: 'petr@example.com',
  ico: '',
  dic: '',
  bank: '',
  city: 'Praha',
  reliable: true,
  note: '',
};

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({
    currentProfileId: 'profile-1',
    profile: { firstName: 'Petr', lastName: 'Heitzer', email: 'petr@example.com' },
    signOut,
  }),
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    darkMode: false,
    setDarkMode,
    settingsSection: 'menu',
    setSettingsSection,
  }),
}));

vi.mock('../features/crew/services/crew.service', () => ({
  getContractors: () => [contractor],
  subscribeToCrewChanges: () => () => undefined,
  updateContractor: vi.fn(),
}));

describe('SettingsView account actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signOut.mockResolvedValue(undefined);
  });

  it('signs the current user out from settings', async () => {
    const { default: SettingsView } = await import('./SettingsView');

    render(<SettingsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Odhlásit se' }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
    expect(toastSuccess).toHaveBeenCalledWith('Byli jste odhlášeni.');
  });
});
