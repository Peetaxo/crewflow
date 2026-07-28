import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setCurrentTab = vi.fn();
const setSettingsSection = vi.fn();

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
  phone: '',
  email: 'petr@example.com',
  ico: '',
  dic: '',
  bank: '',
  city: 'Praha',
  reliable: true,
  note: '',
};

vi.mock('../../app/providers/useAuth', () => ({
  useAuth: () => ({
    currentProfileId: 'profile-1',
    profile: { firstName: 'Petr', lastName: 'Heitzer', email: 'petr@example.com' },
  }),
}));

vi.mock('../../context/useAppContext', () => ({
  useAppContext: () => ({
    setCurrentTab,
    setSettingsSection,
  }),
}));

vi.mock('../../features/crew/services/crew.service', () => ({
  getContractors: () => [contractor],
  subscribeToCrewChanges: () => () => undefined,
}));

describe('MobileSettingsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens settings from a profile avatar button', async () => {
    const { default: MobileSettingsButton } = await import('./MobileSettingsButton');

    render(<MobileSettingsButton />);

    const settingsButton = screen.getByRole('button', { name: 'Otevřít nastavení' });

    expect(settingsButton).toHaveTextContent('PH');

    fireEvent.click(settingsButton);

    expect(setSettingsSection).toHaveBeenCalledWith('menu');
    expect(setCurrentTab).toHaveBeenCalledWith('settings');
  });
});
