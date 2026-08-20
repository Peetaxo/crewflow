import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setCurrentTab = vi.fn();
const setSettingsSection = vi.fn();

vi.mock('../../app/providers/useAuth', () => ({
  useAuth: () => ({
    currentProfileId: 'profile-1',
    profile: { firstName: 'Petr', lastName: 'Heitzer', email: 'petr@example.com' },
  }),
}));

vi.mock('../../context/useAppContext', () => ({
  useAppContext: () => ({ setCurrentTab, setSettingsSection }),
}));

vi.mock('../../features/crew/services/crew.service', () => ({
  getContractors: () => [{
    id: 1,
    profileId: 'profile-1',
    name: 'Petr Heitzer',
    ii: 'PH',
    bg: '#dbeafe',
    fg: '#1d4ed8',
  }],
  subscribeToCrewChanges: () => () => undefined,
}));

describe('MobileSettingsButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens settings from the authenticated profile avatar', async () => {
    const { default: MobileSettingsButton } = await import('./MobileSettingsButton');

    render(<MobileSettingsButton />);
    const button = screen.getByRole('button', { name: 'Otevřít nastavení' });
    expect(button).toHaveTextContent('PH');

    fireEvent.click(button);
    expect(setSettingsSection).toHaveBeenCalledWith('menu');
    expect(setCurrentTab).toHaveBeenCalledWith('settings');
  });
});
