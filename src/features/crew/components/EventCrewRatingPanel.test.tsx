import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EventCrewRatingPanel from './EventCrewRatingPanel';
import { upsertCrewRating } from '../services/crew-ratings.service';

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('shows completed ratings as a compact reviewed row until the manager edits it', () => {
    render(
      <EventCrewRatingPanel
        event={event}
        crew={[crewMember]}
        ratings={[{
          id: 'rating-1',
          profileId: 'profile-1',
          eventId: 1,
          eventSupabaseId: 'event-uuid-1',
          source: 'event',
          rating: 9,
          note: 'Skvela prace',
          ratedByProfileId: 'profile-manager',
          createdAt: '2026-05-01T08:00:00Z',
          updatedAt: '2026-05-01T08:00:00Z',
        }]}
        ratedByProfileId="profile-manager"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Hodnoceni crew/ }));

    expect(screen.getByText('Ohodnoceno 9/10')).toBeInTheDocument();
    expect(screen.getByText('Skvela prace')).toBeInTheDocument();
    expect(screen.queryByLabelText('Hodnoceni Petr Heitzer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Upravit hodnoceni pro Petr Heitzer' }));

    expect(screen.getByLabelText('Hodnoceni Petr Heitzer')).toHaveValue(9);
  });

  it('turns a newly saved rating into a completed row without waiting for a parent reload', async () => {
    vi.mocked(upsertCrewRating).mockResolvedValue({
      id: 'rating-1',
      profileId: 'profile-1',
      eventId: 1,
      eventSupabaseId: 'event-uuid-1',
      source: 'event',
      rating: 8,
      note: '',
      ratedByProfileId: 'profile-manager',
      createdAt: '2026-05-01T08:00:00Z',
      updatedAt: '2026-05-01T08:00:00Z',
    });

    render(
      <EventCrewRatingPanel
        event={event}
        crew={[crewMember]}
        ratings={[]}
        ratedByProfileId="profile-manager"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Hodnoceni crew/ }));
    fireEvent.change(screen.getByLabelText('Hodnoceni Petr Heitzer'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ulozit hodnoceni pro Petr Heitzer' }));

    await waitFor(() => {
      expect(screen.getByText('Ohodnoceno 8/10')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Hodnoceni Petr Heitzer')).not.toBeInTheDocument();
  });
});
