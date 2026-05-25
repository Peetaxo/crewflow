import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CrewView from './CrewView';

const mocks = vi.hoisted(() => ({
  setSelectedContractorProfileId: vi.fn(),
  setDeleteConfirm: vi.fn(),
  getCrew: vi.fn(),
  subscribeToCrewChanges: vi.fn(),
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    selectedContractorProfileId: null,
    setSelectedContractorProfileId: mocks.setSelectedContractorProfileId,
    searchQuery: '',
    setDeleteConfirm: mocks.setDeleteConfirm,
  }),
}));

vi.mock('../features/crew/services/crew.service', () => ({
  getCrew: mocks.getCrew,
  subscribeToCrewChanges: mocks.subscribeToCrewChanges,
}));

vi.mock('./CrewShiftCalendarView', () => ({
  default: ({ onBack }: { onBack: () => void }) => (
    <div data-testid="crew-shift-calendar-view">
      <button type="button" onClick={onBack}>Zpět na seznam crew</button>
    </div>
  ),
}));

vi.mock('./CrewDetailView', () => ({
  default: () => <div>Detail crew</div>,
}));

vi.mock('../components/modals/ContractorEditModal', () => ({
  default: () => null,
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

describe('CrewView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCrew.mockReturnValue([
      {
        id: 1,
        profileId: 'profile-1',
        name: 'Petr Jouda',
        ii: 'PJ',
        bg: '#E1F5EE',
        fg: '#0F6E56',
        tags: [],
        events: 1,
        rate: 200,
        phone: '777 000 111',
        email: 'petr@example.com',
        ico: '',
        dic: '',
        bank: '',
        city: 'Plzen',
        reliable: true,
        rating: 4,
        note: '',
      },
    ]);
    mocks.subscribeToCrewChanges.mockReturnValue(vi.fn());
  });

  it('opens the crew shift calendar from the Crew header and returns to the list', () => {
    render(<CrewView />);

    expect(screen.getByText('Petr Jouda')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kalendář směn' }));

    expect(screen.getByTestId('crew-shift-calendar-view')).toBeInTheDocument();
    expect(screen.queryByText('Petr Jouda')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zpět na seznam crew' }));

    expect(screen.getByText('Petr Jouda')).toBeInTheDocument();
  });
});
