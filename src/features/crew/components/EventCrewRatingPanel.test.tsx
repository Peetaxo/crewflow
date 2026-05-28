import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EventCrewRatingPanel from './EventCrewRatingPanel';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../services/crew-ratings.service', () => ({
  upsertCrewRating: vi.fn(),
}));

const event = {
  id: 1,
  supabaseId: 'event-uuid-1',
  name: 'TEST',
  job: 'JTI001',
  startDate: '2026-04-16',
  endDate: '2026-04-17',
  city: '',
  needed: 1,
  filled: 1,
  status: 'past' as const,
  client: 'NextLevel s.r.o.',
  showDayTypes: false,
};

const crewMember = {
  id: 1,
  profileId: 'profile-1',
  name: 'Petr Heitzer',
  ii: 'PH',
  bg: '#dbeafe',
  fg: '#1d4ed8',
  tags: [],
  events: 1,
  rate: 99,
  phone: '',
  email: '',
  ico: '',
  dic: '',
  bank: '',
  city: '',
  reliable: true,
  note: '',
};

describe('EventCrewRatingPanel', () => {
  it('keeps rating forms collapsed until the manager opens the panel', () => {
    render(
      <EventCrewRatingPanel
        event={event}
        crew={[crewMember]}
        ratings={[]}
        ratedByProfileId="profile-1"
      />,
    );

    expect(screen.getByRole('button', { name: /Hodnoceni crew/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Hodnoceni Petr Heitzer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Hodnoceni crew/ }));

    expect(screen.getByRole('button', { name: /Hodnoceni crew/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Hodnoceni Petr Heitzer')).toBeInTheDocument();
  });
});
