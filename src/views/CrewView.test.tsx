import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../types';
import CrewView from './CrewView';

const contractor = {
  id: 1,
  profileId: 'profile-uuid-1',
  name: 'Petr Heitzer',
  ii: 'PH',
  bg: '#dbeafe',
  fg: '#1d4ed8',
  tags: [],
  events: 3,
  rate: 250,
  phone: '',
  email: '',
  ico: '',
  dic: '',
  bank: '',
  city: 'Praha',
  reliable: true,
  rating: 8.5,
  note: '',
};

const mocks = vi.hoisted(() => ({
  role: 'coo' as Role,
  setSelectedContractorProfileId: vi.fn(),
  setDeleteConfirm: vi.fn(),
  getCrew: vi.fn(),
  subscribeToCrewChanges: vi.fn(),
}));

vi.mock('../context/useAppContext', () => ({
  useAppContext: () => ({
    role: mocks.role,
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
    mocks.role = 'coo';
    mocks.getCrew.mockReturnValue([contractor]);
    mocks.subscribeToCrewChanges.mockReturnValue(vi.fn());
  });

  it('opens the crew shift calendar from the Crew header and returns to the list', () => {
    render(<CrewView />);

    expect(screen.getByText('Petr Heitzer')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Kalendář směn' }));

    expect(screen.getByTestId('crew-shift-calendar-view')).toBeInTheDocument();
    expect(screen.queryByText('Petr Heitzer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Zpět na seznam crew' }));

    expect(screen.getByText('Petr Heitzer')).toBeInTheDocument();
  });

  it('shows rating badges to managers', () => {
    render(<CrewView />);

    expect(screen.getByText('Hodnoceni: 8.5 / 10')).toBeInTheDocument();
  });

  it('hides rating badges from crew users', () => {
    mocks.role = 'crew';

    render(<CrewView />);

    expect(screen.queryByText('Hodnoceni: 8.5 / 10')).not.toBeInTheDocument();
  });
});
