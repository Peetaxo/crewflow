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
  phone: '+420 777 123 456',
  email: 'petr@example.cz',
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

vi.mock('../features/crew/useCrewActivity', () => ({ useCrewActivity: () => ({ data: {}, status: 'ready' }) }));

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

    expect(screen.getByText('8,5 / 10')).toBeInTheDocument();
  });

  it('shows a zero rating as a valid manager rating', () => {
    mocks.getCrew.mockReturnValue([{ ...contractor, rating: 0 }]);

    render(<CrewView />);

    expect(screen.getByText('0 / 10')).toBeInTheDocument();
  });

  it('keeps unknown ratings available to desktop screen readers and gives mobile activity a semantic label', () => {
    mocks.getCrew.mockReturnValue([{ ...contractor, rating: null }]);

    render(<CrewView />);

    expect(screen.getByText('Bez hodnocení')).toHaveClass('lg:not-sr-only');
    expect(screen.getByText('—')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('—')).toHaveClass('lg:hidden');
    expect(screen.getByText('Poslední aktivita:')).toHaveClass('sr-only');
    expect(screen.getByText('Zatím bez aktivity')).toBeInTheDocument();
  });

  it('hides rating badges from crew users', () => {
    mocks.role = 'crew';

    render(<CrewView />);

    expect(screen.queryByText('8,5 / 10')).not.toBeInTheDocument();
  });

  it('exposes named contact actions with their real destinations and a keyboard-accessible profile', () => {
    render(<CrewView />);
    expect(screen.queryByText(/250.*Kč\/h/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zavolat: Petr Heitzer' })).toHaveAttribute('href', 'tel:+420777123456');
    expect(screen.getByRole('link', { name: 'Napsat e-mail: Petr Heitzer' })).toHaveAttribute('href', 'mailto:petr@example.cz');
    expect(screen.getByText('Zavolat')).toHaveClass('text-sm');
    expect(screen.getByText('E-mail')).toHaveClass('text-sm');
    expect(screen.getByText('Praha')).toHaveClass('min-w-0');
    fireEvent.click(screen.getByRole('button', { name: 'Otevřít profil Petr Heitzer' }));
    expect(mocks.setSelectedContractorProfileId).toHaveBeenCalledWith('profile-uuid-1');
  });

  it('shows a call action when only a phone number is available', () => {
    mocks.getCrew.mockReturnValue([{ ...contractor, email: '' }]);

    render(<CrewView />);

    expect(screen.getByRole('link', { name: 'Zavolat: Petr Heitzer' })).toHaveAttribute('href', 'tel:+420777123456');
    expect(screen.queryByRole('link', { name: 'Napsat e-mail: Petr Heitzer' })).not.toBeInTheDocument();
  });

  it('shows an email action when only an email address is available', () => {
    mocks.getCrew.mockReturnValue([{ ...contractor, phone: '' }]);

    render(<CrewView />);

    expect(screen.getByRole('link', { name: 'Napsat e-mail: Petr Heitzer' })).toHaveAttribute('href', 'mailto:petr@example.cz');
    expect(screen.queryByRole('link', { name: 'Zavolat: Petr Heitzer' })).not.toBeInTheDocument();
  });

  it('shows missing contact copy without fake action links', () => {
    mocks.getCrew.mockReturnValue([{ ...contractor, phone: '', email: '' }]);

    render(<CrewView />);

    expect(screen.getByText('Kontakt neuveden')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Zavolat: Petr Heitzer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Napsat e-mail: Petr Heitzer' })).not.toBeInTheDocument();
  });

  it('searches on the page and shows a resettable no-results state', () => {
    render(<CrewView />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Hledat v crew' }), { target: { value: '777123' } });
    expect(screen.getByText('Petr Heitzer')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Hledat v crew' }), { target: { value: 'Brno' } });
    expect(screen.queryByText('Petr Heitzer')).not.toBeInTheDocument();
    expect(screen.getByText('Nikdo neodpovídá hledání')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vymazat hledání' }));
    expect(screen.getByText('Petr Heitzer')).toBeInTheDocument();
  });

  it('continues to search by a hidden email contact', () => {
    render(<CrewView />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Hledat v crew' }), { target: { value: 'petr@example.cz' } });

    expect(screen.getByText('Petr Heitzer')).toBeInTheDocument();
  });
});
