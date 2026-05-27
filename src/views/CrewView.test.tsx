import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../types';

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

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

const renderCrewView = async (role: Role) => {
  vi.doMock('../context/useAppContext', () => ({
    useAppContext: () => ({
      role,
      selectedContractorProfileId: null,
      setSelectedContractorProfileId: vi.fn(),
      searchQuery: '',
      setDeleteConfirm: vi.fn(),
    }),
  }));

  vi.doMock('../features/crew/services/crew.service', () => ({
    getCrew: () => [contractor],
    subscribeToCrewChanges: vi.fn(() => () => undefined),
  }));

  vi.doMock('./CrewDetailView', () => ({
    default: () => null,
  }));

  vi.doMock('../components/modals/ContractorEditModal', () => ({
    default: () => null,
  }));

  const { default: CrewView } = await import('./CrewView');
  render(<CrewView />);
};

describe('CrewView', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('shows rating badges to managers', async () => {
    await renderCrewView('coo');

    expect(screen.getByText('Hodnoceni: 8.5 / 10')).toBeInTheDocument();
  });

  it('hides rating badges from crew users', async () => {
    await renderCrewView('crew');

    expect(screen.queryByText('Hodnoceni: 8.5 / 10')).not.toBeInTheDocument();
  });
});
