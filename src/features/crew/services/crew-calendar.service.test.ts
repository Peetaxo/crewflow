import { describe, expect, it } from 'vitest';
import { buildCrewCalendarAssignments } from './crew-calendar.service';
import type { Contractor, Event, EventCrewAssignment, Timelog } from '../../../types';

const contractor = (overrides: Partial<Contractor> = {}): Contractor => ({
  id: 1,
  profileId: 'profile-1',
  name: 'Petr Jouda',
  ii: 'PJ',
  bg: '#E1F5EE',
  fg: '#0F6E56',
  tags: [],
  events: 1,
  rate: 200,
  phone: '',
  email: '',
  ico: '',
  dic: '',
  bank: '',
  city: '',
  reliable: true,
  note: '',
  ...overrides,
});

const event = (overrides: Partial<Event> = {}): Event => ({
  id: 10,
  supabaseId: 'event-uuid-10',
  name: 'Prima Festival',
  job: 'PF001',
  startDate: '2026-05-16',
  endDate: '2026-05-18',
  city: 'Plzen',
  needed: 2,
  filled: 1,
  status: 'upcoming',
  client: 'Next Level',
  ...overrides,
});

const timelog = (overrides: Partial<Timelog> = {}): Timelog => ({
  id: 100,
  eid: 10,
  contractorProfileId: 'profile-1',
  days: [
    { d: '2026-05-16', f: '09:00', t: '18:00', type: 'provoz' },
    { d: '2026-05-17', f: '09:00', t: '18:00', type: 'provoz' },
    { d: '2026-05-18', f: '09:00', t: '18:00', type: 'provoz' },
  ],
  km: 0,
  note: '',
  status: 'draft',
  ...overrides,
});

describe('crew-calendar.service', () => {
  it('groups contiguous timelog days for one contractor and event into one assignment range', () => {
    expect(buildCrewCalendarAssignments({
      contractors: [contractor()],
      events: [event()],
      timelogs: [timelog()],
      eventCrewAssignments: [],
    })).toEqual([
      expect.objectContaining({
        id: 'timelog-100-0',
        contractorProfileId: 'profile-1',
        contractorName: 'Petr Jouda',
        contractorInitials: 'PJ',
        eventId: 10,
        eventSelectionId: 'event-uuid-10',
        eventName: 'Prima Festival',
        eventJob: 'PF001',
        eventCity: 'Plzen',
        dateFrom: '2026-05-16',
        dateTo: '2026-05-18',
        timeFrom: '09:00',
        timeTo: '18:00',
        dayCount: 3,
      }),
    ]);
  });

  it('splits non-contiguous timelog days into separate visible assignment ranges', () => {
    const assignments = buildCrewCalendarAssignments({
      contractors: [contractor()],
      events: [event()],
      timelogs: [timelog({
        days: [
          { d: '2026-05-16', f: '09:00', t: '18:00', type: 'provoz' },
          { d: '2026-05-18', f: '09:00', t: '18:00', type: 'provoz' },
        ],
      })],
      eventCrewAssignments: [],
    });

    expect(assignments.map((assignment) => [assignment.dateFrom, assignment.dateTo])).toEqual([
      ['2026-05-16', '2026-05-16'],
      ['2026-05-18', '2026-05-18'],
    ]);
  });

  it('filters assignments by contractor name, event name, and job number', () => {
    const assignments = buildCrewCalendarAssignments({
      contractors: [contractor({ name: 'Karel Vomacka' })],
      events: [event({ name: 'Zavod miru', job: 'ZM001' })],
      timelogs: [timelog()],
      eventCrewAssignments: [],
      search: 'vomacka',
    });

    expect(assignments).toHaveLength(1);
    expect(buildCrewCalendarAssignments({
      contractors: [contractor({ name: 'Karel Vomacka' })],
      events: [event({ name: 'Zavod miru', job: 'ZM001' })],
      timelogs: [timelog()],
      eventCrewAssignments: [],
      search: 'ZM001',
    })).toHaveLength(1);
    expect(buildCrewCalendarAssignments({
      contractors: [contractor({ name: 'Karel Vomacka' })],
      events: [event({ name: 'Zavod miru', job: 'ZM001' })],
      timelogs: [timelog()],
      eventCrewAssignments: [],
      search: 'neexistuje',
    })).toHaveLength(0);
  });

  it('resolves local demo contractor profile ids to crew names', () => {
    const assignments = buildCrewCalendarAssignments({
      contractors: [contractor({ id: 1, profileId: undefined, name: 'Petr Heitzer', ii: 'PH' })],
      events: [event()],
      timelogs: [timelog({ contractorProfileId: 'profile-local-1' })],
      eventCrewAssignments: [],
    });

    expect(assignments[0]).toEqual(expect.objectContaining({
      contractorProfileId: 'profile-local-1',
      contractorName: 'Petr Heitzer',
      contractorInitials: 'PH',
    }));
  });

  it('uses eventCrewAssignments as fallback when a contractor is assigned but has no timelog days yet', () => {
    const fallback: EventCrewAssignment = {
      eventId: 10,
      eventSupabaseId: 'event-uuid-10',
      contractorProfileId: 'profile-1',
      name: 'Petr Jouda',
    };

    expect(buildCrewCalendarAssignments({
      contractors: [contractor()],
      events: [event()],
      timelogs: [],
      eventCrewAssignments: [fallback],
    })).toEqual([
      expect.objectContaining({
        id: 'assignment-10-profile-1',
        contractorName: 'Petr Jouda',
        eventName: 'Prima Festival',
        dateFrom: '2026-05-16',
        dateTo: '2026-05-18',
        timeFrom: null,
        timeTo: null,
      }),
    ]);
  });
});
