import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Contractor,
  Event,
  EventCrewAssignment,
  InvoiceApprovalDocument,
  Timelog,
} from '../../../types';
import {
  applyApprovalTimelogPreview,
  buildApprovalTimelogPreview,
} from './approval-timelog-sync.service';
import { createTimelog, saveTimelog } from '../../timelogs/services/timelogs.service';
import { assignCrewToEvent } from '../../events/services/events.service';

vi.mock('../../timelogs/services/timelogs.service', () => ({
  createTimelog: vi.fn(),
  saveTimelog: vi.fn(),
}));

vi.mock('../../events/services/events.service', () => ({
  assignCrewToEvent: vi.fn(),
}));

const contractors: Contractor[] = [
  {
    id: 1,
    profileId: 'profile-ondrej',
    name: 'Ondřej Šafařík',
    ii: 'OŠ',
    bg: '#dbeafe',
    fg: '#1d4ed8',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    reliable: true,
    note: '',
  },
  {
    id: 2,
    profileId: 'profile-daniel',
    name: 'Daniel Vladař',
    ii: 'DV',
    bg: '#ede9fe',
    fg: '#6d28d9',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    reliable: true,
    note: '',
  },
  {
    id: 3,
    profileId: 'profile-jaroslav',
    name: 'Jaroslav Macháč',
    ii: 'JM',
    bg: '#dcfce7',
    fg: '#166534',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    reliable: true,
    note: '',
  },
  {
    id: 4,
    profileId: 'profile-marek',
    name: 'Marek Rebros',
    ii: 'MR',
    bg: '#fee2e2',
    fg: '#991b1b',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    reliable: true,
    note: '',
  },
  {
    id: 5,
    profileId: 'profile-albert',
    name: 'Albert Cibulka',
    ii: 'AC',
    bg: '#fef3c7',
    fg: '#92400e',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    reliable: true,
    note: '',
  },
  {
    id: 6,
    profileId: 'profile-vilem',
    name: 'Vilém Cibulka',
    ii: 'VC',
    bg: '#dcfce7',
    fg: '#14532d',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    reliable: true,
    note: '',
  },
  {
    id: 7,
    profileId: 'profile-tomas',
    name: 'Tomáš Macášek',
    ii: 'TM',
    bg: '#f3e8ff',
    fg: '#7e22ce',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    reliable: true,
    note: '',
  },
  {
    id: 8,
    profileId: 'profile-jan-dubsky',
    name: 'Jan Dubský',
    ii: 'JD',
    bg: '#e0f2fe',
    fg: '#0369a1',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    reliable: true,
    note: '',
  },
  {
    id: 9,
    profileId: 'profile-jan-ledvina',
    name: 'Jan Ledvina',
    ii: 'JL',
    bg: '#fef9c3',
    fg: '#854d0e',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    reliable: true,
    note: '',
  },
  {
    id: 10,
    profileId: 'profile-ondrej-novotny',
    name: 'Ondřej Novotný',
    ii: 'ON',
    bg: '#f1f5f9',
    fg: '#334155',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    reliable: true,
    note: '',
  },
  {
    id: 11,
    profileId: 'profile-ladislav',
    name: 'Ladislav Tuček',
    ii: 'LT',
    bg: '#ecfccb',
    fg: '#3f6212',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: '',
    reliable: true,
    note: '',
  },
];

const createEvent = (overrides: Partial<Event> = {}): Event => ({
  id: 1,
  supabaseId: 'event-uuid-1',
  name: 'RunCzech 1/2 Maraton KV - Mattoni',
  job: 'BTL003',
  startDate: '2026-05-16',
  endDate: '2026-05-16',
  startTime: '05:00',
  endTime: '13:00',
  city: 'Karlovy Vary',
  needed: 1,
  filled: 1,
  status: 'past',
  client: 'NEXT LEVEL',
  ...overrides,
});

const createApprovalDocument = (overrides: Partial<InvoiceApprovalDocument> = {}): InvoiceApprovalDocument => ({
  id: 'approval-doc-1',
  source: 'powerapps_document_approval',
  externalId: 'sharepoint-1',
  documentName: 'Safarik - 20260015.pdf',
  company: 'JCHP',
  jobNumber: 'BTL003',
  invoiceNumber: '20260015',
  supplierName: 'Někdo jiný',
  approvalStatus: 'approved',
  approvalStatusLabel: 'schváleno',
  comment: [
    'RunCzech 1/2 Maraton KV - Mattoni',
    'Ondřej Šafařík',
    '16.5 5:00-13:00 (8h)',
    'Celkem 8h',
  ].join('\n'),
  approvers: ['Andrea Mandova'],
  requester: 'Petr Heitzer',
  rawPayload: null,
  matchedInvoiceId: null,
  lastSyncedAt: '2026-05-26T09:00:00Z',
  ...overrides,
});

const eventCrewAssignments: EventCrewAssignment[] = [
  {
    eventId: 1,
    eventSupabaseId: 'event-uuid-1',
    contractorProfileId: 'profile-ondrej',
    name: 'Ondřej Šafařík',
  },
];

const timelogs: Timelog[] = [
  {
    id: 1,
    eid: 1,
    contractorProfileId: 'profile-ondrej',
    days: [{ d: '2026-05-16', f: '05:00', t: '13:00', type: 'instal' }],
    km: 0,
    note: '',
    status: 'draft',
  },
];

describe('approval timelog sync service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the person from comment before supplier and proposes an approved timelog row', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [createApprovalDocument()],
      events: [createEvent()],
      contractors,
      timelogs,
      eventCrewAssignments,
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      documentName: 'Safarik - 20260015.pdf',
      personName: 'Ondřej Šafařík',
      matchedContractor: { profileId: 'profile-ondrej' },
      matchedEvent: { id: 1, job: 'BTL003' },
      proposedDays: [{ d: '2026-05-16', f: '05:00', t: '13:00', type: 'instal' }],
    });
  });

  it('treats pausal as five paid hours from the matched event start time', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-pausal',
          documentName: 'Machac - 20260099.pdf',
          jobNumber: 'JTI001',
          supplierName: 'Jaroslav Macháč',
          comment: 'Grand Hotel Bohemia\nJaroslav Macháč\n22.5 2026 - paušál (5h)\nCelkem 5h',
        }),
      ],
      events: [
        createEvent({
          id: 8,
          supabaseId: 'event-grand-hotel',
          name: 'Grand Hotel Bohemia',
          job: 'JTI001',
          startDate: '2026-05-22',
          endDate: '2026-05-22',
          startTime: '07:30',
          endTime: '02:00',
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 8,
          eventSupabaseId: 'event-grand-hotel',
          contractorProfileId: 'profile-jaroslav',
          name: 'Jaroslav Macháč',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview[0]).toMatchObject({
      status: 'ready',
      personName: 'Jaroslav Macháč',
      matchedEvent: { id: 8 },
      proposedDays: [{ d: '2026-05-22', f: '07:30', t: '12:30', type: 'instal' }],
    });
  });

  it('splits a flattened multi-person PowerApps comment into ready rows per person and event', () => {
    const missAgroEvents = [
      createEvent({
        id: 20,
        supabaseId: 'event-miss-agro-11',
        name: 'Miss Agro',
        job: 'JTI001',
        startDate: '2026-05-11',
        endDate: '2026-05-11',
        startTime: '08:00',
        endTime: '17:30',
      }),
      createEvent({
        id: 21,
        supabaseId: 'event-miss-agro-12-day',
        name: 'Miss Agro',
        job: 'JTI001',
        startDate: '2026-05-12',
        endDate: '2026-05-12',
        startTime: '08:00',
        endTime: '14:00',
      }),
      createEvent({
        id: 22,
        supabaseId: 'event-miss-agro-12-night',
        name: 'Miss Agro',
        job: 'JTI001',
        startDate: '2026-05-12',
        endDate: '2026-05-12',
        startTime: '22:30',
        endTime: '03:30',
      }),
    ];
    const assignmentRows = missAgroEvents.flatMap((event) => [
      {
        eventId: event.id,
        eventSupabaseId: event.supabaseId,
        contractorProfileId: 'profile-marek',
        name: 'Marek Rebros',
      },
      {
        eventId: event.id,
        eventSupabaseId: event.supabaseId,
        contractorProfileId: 'profile-jaroslav',
        name: 'Jaroslav Macháč',
      },
    ]);

    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-rebros-015',
          documentName: 'Rebros-2026-015.pdf',
          jobNumber: 'JTI001',
          invoiceNumber: '2026-015',
          supplierName: 'Marek Rebroš',
          comment: 'Miss Agro Marek Rebroš 11.05. 08:00 - 17:30 (9,5h) 12.05. 08:00 - 14:00 (6h) 12.05. 22:30 - 02:30 paušál (5h) Jaroslav Macháč 11.05. 08:00 - 17:30 (9,5h) 12.05. 08:00 - 14:00 (6h) 12.05. 22:30 - 02:30 paušál (5h)',
        }),
      ],
      events: missAgroEvents,
      contractors,
      timelogs: [],
      eventCrewAssignments: assignmentRows,
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(6);
    expect(preview.map((row) => row.status)).toEqual([
      'ready',
      'ready',
      'ready',
      'ready',
      'ready',
      'ready',
    ]);
    expect(preview.map((row) => [row.personName, row.matchedEvent?.id, row.proposedDays[0]])).toEqual([
      ['Marek Rebroš', 20, { d: '2026-05-11', f: '08:00', t: '17:30', type: 'instal' }],
      ['Marek Rebroš', 21, { d: '2026-05-12', f: '08:00', t: '14:00', type: 'instal' }],
      ['Marek Rebroš', 22, { d: '2026-05-12', f: '22:30', t: '03:30', type: 'instal' }],
      ['Jaroslav Macháč', 20, { d: '2026-05-11', f: '08:00', t: '17:30', type: 'instal' }],
      ['Jaroslav Macháč', 21, { d: '2026-05-12', f: '08:00', t: '14:00', type: 'instal' }],
      ['Jaroslav Macháč', 22, { d: '2026-05-12', f: '22:30', t: '03:30', type: 'instal' }],
    ]);
  });

  it('prefers the specific timed event over a same-day summary event', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-superbike',
          documentName: 'albertcibulka - 2026-05-002.pdf',
          jobNumber: 'ORL057',
          invoiceNumber: '2026-05-002',
          supplierName: 'Albert Cibulka',
          comment: 'Superbike Most - instalace Albert Cibulka 14.5. 6:15 - 16:15 + 1h (oběd) = 11h',
        }),
      ],
      events: [
        createEvent({
          id: 30,
          supabaseId: 'event-superbike-specific',
          name: 'Superbike Most - instalace',
          job: 'ORL057',
          startDate: '2026-05-14',
          endDate: '2026-05-14',
          startTime: '06:00',
          endTime: '17:00',
        }),
        createEvent({
          id: 31,
          supabaseId: 'event-superbike-summary',
          name: 'Superbike Most',
          job: 'ORL057',
          startDate: '2026-05-14',
          endDate: '2026-05-14',
          startTime: undefined,
          endTime: undefined,
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 30,
          eventSupabaseId: 'event-superbike-specific',
          contractorProfileId: 'profile-albert',
          name: 'Albert Cibulka',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      personName: 'Albert Cibulka',
      matchedEvent: { id: 30, name: 'Superbike Most - instalace' },
      proposedDays: [{ d: '2026-05-14', f: '06:15', t: '16:15', type: 'instal' }],
    });
  });

  it('parses start-only pausal time after a date separator', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-start-pausal',
          documentName: 'Machac - start-pausal.pdf',
          jobNumber: 'ORL052',
          invoiceNumber: 'start-pausal',
          supplierName: 'Jaroslav Macháč',
          comment: 'Elimon Fresh Festival Pardubice Jaroslav Macháč 20.5 - 9:00 - paušál (5h)',
        }),
      ],
      events: [
        createEvent({
          id: 40,
          supabaseId: 'event-pardubice-start-pausal',
          name: 'Elimon Fresh Festival Pardubice',
          job: 'ORL052',
          startDate: '2026-05-20',
          endDate: '2026-05-20',
          startTime: undefined,
          endTime: undefined,
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 40,
          eventSupabaseId: 'event-pardubice-start-pausal',
          contractorProfileId: 'profile-jaroslav',
          name: 'Jaroslav Macháč',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      proposedDays: [{ d: '2026-05-20', f: '09:00', t: '14:00', type: 'instal' }],
    });
  });

  it('matches event names by shared meaningful tokens when NODU has extra notes', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-spartafest',
          documentName: 'vilemcibulka-202608.pdf',
          jobNumber: 'JTI001',
          invoiceNumber: '202608',
          supplierName: 'Vilém Cibulka',
          comment: 'SpartaFest - deinstal Vilém Cibulka 24.5. 7:30 - 12:30 (5h)',
        }),
      ],
      events: [
        createEvent({
          id: 50,
          supabaseId: 'event-spartafest-note',
          name: 'SpartaFest (čas - bude upřesněno)',
          job: 'JTI001',
          startDate: '2026-05-24',
          endDate: '2026-05-24',
          startTime: undefined,
          endTime: undefined,
        }),
        createEvent({
          id: 51,
          supabaseId: 'event-elimon-pardubice',
          name: 'Elimon Fresh Festival Pardubice',
          job: 'JTI001',
          startDate: '2026-05-24',
          endDate: '2026-05-24',
          startTime: undefined,
          endTime: undefined,
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 50,
          eventSupabaseId: 'event-spartafest-note',
          contractorProfileId: 'profile-vilem',
          name: 'Vilém Cibulka',
        },
      ],
      grasonConfirmations: [
        {
          eventId: 'event-spartafest-note',
          eventName: 'SpartaFest',
          jobNumber: 'JTI001',
          shiftDate: '2026-05-24',
          confirmedName: 'Vilém Cibulka',
          profileId: 'profile-vilem',
        },
      ],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      matchedEvent: { id: 50, name: 'SpartaFest (čas - bude upřesněno)' },
      proposedDays: [{ d: '2026-05-24', f: '07:30', t: '12:30', type: 'instal' }],
    });
  });

  it('uses a strong name and date match instead of an unrelated same-job event', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-grand-hotel',
          documentName: 'Rebros - 2026-018.pdf',
          jobNumber: 'JTI001',
          invoiceNumber: '2026-018',
          supplierName: 'Marek Rebroš',
          comment: 'Grand Hotel Bohemia Jaroslav Macháč 22. 5. 07:30 - paušál (5h)',
        }),
      ],
      events: [
        createEvent({
          id: 60,
          supabaseId: 'event-elimon-wrong-job',
          name: 'Elimon Fresh Festival Pardubice',
          job: 'JTI001',
          startDate: '2026-05-22',
          endDate: '2026-05-22',
          startTime: undefined,
          endTime: undefined,
        }),
        createEvent({
          id: 61,
          supabaseId: 'event-grand-hotel',
          name: 'Grand Hotel Bohemia - 2x PAUŠÁL',
          job: '',
          startDate: '2026-05-22',
          endDate: '2026-05-22',
          startTime: undefined,
          endTime: undefined,
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 61,
          eventSupabaseId: 'event-grand-hotel',
          contractorProfileId: 'profile-jaroslav',
          name: 'Jaroslav Macháč',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      matchedEvent: { id: 61, name: 'Grand Hotel Bohemia - 2x PAUŠÁL' },
      proposedDays: [{ d: '2026-05-22', f: '07:30', t: '12:30', type: 'instal' }],
    });
  });

  it('uses a unique trusted job/date match for EIT018 when the comment name is not the event title', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-eit-unique-job-date',
          documentName: 'Vladar - EIT018.pdf',
          jobNumber: 'EIT018',
          invoiceNumber: '2026-eit',
          supplierName: 'Daniel Vladař',
          comment: 'Sokolov přípravy Daniel Vladař 17.5. 09:00 - 18:00 (9h)',
        }),
      ],
      events: [
        createEvent({
          id: 62,
          supabaseId: 'event-eit-unique-date',
          name: 'EIT Raw Material Summit 2026',
          job: 'EIT018',
          startDate: '2026-05-17',
          endDate: '2026-05-17',
          startTime: undefined,
          endTime: undefined,
        }),
        createEvent({
          id: 63,
          supabaseId: 'event-same-date-other-job',
          name: 'Elimon Fresh Festival Plzeň',
          job: 'ORL052',
          startDate: '2026-05-17',
          endDate: '2026-05-17',
          startTime: undefined,
          endTime: undefined,
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 62,
          eventSupabaseId: 'event-eit-unique-date',
          contractorProfileId: 'profile-daniel',
          name: 'Daniel Vladař',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      matchedEvent: { id: 62, job: 'EIT018' },
      proposedDays: [{ d: '2026-05-17', f: '09:00', t: '18:00', type: 'instal' }],
    });
  });

  it('uses a unique trusted BMW129 job/date match and parses pausal start-only entries', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-bmw129-tucek',
          documentName: 'Tucek - 20260041.pdf',
          jobNumber: 'BMW129',
          invoiceNumber: '20260041',
          supplierName: 'Ladislav Tuček',
          comment: [
            'Převoz a zapojení loga Ladislav Tuček',
            '25.5 9:00 - 15:00 - 5h paušál',
            '25.5. Vecer - 23:00 - 5h paušál',
            '26.5 9:00 - 5h paušál',
            'Celkem 15h',
          ].join(' '),
        }),
      ],
      events: [
        createEvent({
          id: 64,
          supabaseId: 'event-bmw129-logo',
          name: 'BMW předání',
          job: 'BMW129',
          startDate: '2026-05-25',
          endDate: '2026-05-26',
          startTime: undefined,
          endTime: undefined,
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 64,
          eventSupabaseId: 'event-bmw129-logo',
          contractorProfileId: 'profile-ladislav',
          name: 'Ladislav Tuček',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      matchedEvent: { id: 64, job: 'BMW129' },
      proposedDays: [
        { d: '2026-05-25', f: '09:00', t: '14:00', type: 'instal' },
        { d: '2026-05-25', f: '23:00', t: '04:00', type: 'instal' },
        { d: '2026-05-26', f: '09:00', t: '14:00', type: 'instal' },
      ],
    });
  });

  it('uses the named event schedule for multi-person comments without explicit dates', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-rebros-014',
          documentName: 'Rebros-2026-014.pdf',
          jobNumber: 'JTI001',
          invoiceNumber: '2026-014',
          supplierName: 'Marek Re',
          comment: 'Mladí ladí Jazz / JTI001 Marek Rebroš - instal/deinstal (10h) Jaroslav Macháč - instal/deinstal (10h)',
        }),
      ],
      events: [
        createEvent({
          id: 65,
          supabaseId: 'event-mladi-ladi-jazz',
          name: 'Mladí ladí jazz Open Air',
          job: 'JTI001',
          startDate: '2026-04-30',
          endDate: '2026-04-30',
          startTime: '09:00',
          endTime: '03:00',
          dayTypes: { '2026-04-30': 'provoz' },
          phaseTimes: { provoz: { from: '09:00', to: '03:00' } },
          phaseSchedules: {
            provoz: [
              { id: 'mlj-morning', dates: ['2026-04-30'], from: '09:00', to: '14:00' },
              { id: 'mlj-night', dates: ['2026-04-30'], from: '22:00', to: '03:00' },
            ],
          },
        }),
        createEvent({
          id: 66,
          supabaseId: 'event-carodejnice',
          name: 'RS - Čarodějnice',
          job: 'JTI001',
          startDate: '2026-04-30',
          endDate: '2026-04-30',
          startTime: '13:00',
          endTime: '18:00',
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 65,
          eventSupabaseId: 'event-mladi-ladi-jazz',
          contractorProfileId: 'profile-marek',
          name: 'Marek Rebros',
        },
        {
          eventId: 65,
          eventSupabaseId: 'event-mladi-ladi-jazz',
          contractorProfileId: 'profile-jaroslav',
          name: 'Jaroslav Macháč',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(2);
    expect(preview.map((row) => [row.personName, row.status, row.matchedEvent?.id, row.proposedDays])).toEqual([
      [
        'Marek Rebroš',
        'ready',
        65,
        [
          { d: '2026-04-30', f: '09:00', t: '14:00', type: 'provoz' },
          { d: '2026-04-30', f: '22:00', t: '03:00', type: 'provoz' },
        ],
      ],
      [
        'Jaroslav Macháč',
        'ready',
        65,
        [
          { d: '2026-04-30', f: '09:00', t: '14:00', type: 'provoz' },
          { d: '2026-04-30', f: '22:00', t: '03:00', type: 'provoz' },
        ],
      ],
    ]);
  });

  it('uses a unique surname from the document name when PowerApps has no supplier person', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-macasek-popup',
          documentName: 'Macasek-260100007.pdf',
          jobNumber: 'JTI001',
          invoiceNumber: '260100007',
          supplierName: '',
          comment: [
            'Ploom PopUp - Westfield Černý Most / JTI001',
            '16.4. pausal 1250 Kč instal',
            '20.4. paušál 1250kč deinstal',
          ].join('\n'),
        }),
      ],
      events: [
        createEvent({
          id: 70,
          supabaseId: 'event-ploom-cerny-most',
          name: 'Ploom PopUp - Westfield Černý Most',
          job: 'JTI001',
          startDate: '2026-04-16',
          endDate: '2026-04-20',
          startTime: '09:00',
          endTime: '14:00',
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 70,
          eventSupabaseId: 'event-ploom-cerny-most',
          contractorProfileId: 'profile-tomas',
          name: 'Tomáš Macášek',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      personName: 'Macasek-260100007',
      matchedContractor: { profileId: 'profile-tomas' },
      matchedEvent: { id: 70 },
      proposedDays: [
        { d: '2026-04-16', f: '09:00', t: '14:00', type: 'instal' },
        { d: '2026-04-20', f: '09:00', t: '14:00', type: 'instal' },
      ],
    });
  });

  it('keeps event headers with following date-only rows in one comment', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-dubsky-mixed-events',
          documentName: 'Dubsky - 20260002.pdf',
          jobNumber: 'JTI001',
          invoiceNumber: '20260002',
          supplierName: 'Jan Dubský',
          comment: [
            'Ploom PopUp - Westfield Chodov / JTI001',
            '16.4. - 5h',
            '20.4. - 5h',
            '',
            'Otevření Riegrovy sady / JTI001',
            '25.4. - 9h',
          ].join('\n'),
        }),
      ],
      events: [
        createEvent({
          id: 80,
          supabaseId: 'event-ploom-chodov',
          name: 'Ploom PopUp - Westfield Chodov',
          job: 'JTI001',
          startDate: '2026-04-16',
          endDate: '2026-04-20',
          startTime: '10:00',
          endTime: '15:00',
        }),
        createEvent({
          id: 81,
          supabaseId: 'event-riegrovy-sady',
          name: 'Otevření Riegrovy sady',
          job: 'JTI001',
          startDate: '2026-04-25',
          endDate: '2026-04-25',
          startTime: '14:00',
          endTime: '23:00',
        }),
        createEvent({
          id: 82,
          supabaseId: 'event-other-jti',
          name: 'Elimon Fresh Festival Pardubice',
          job: 'JTI001',
          startDate: '2026-04-25',
          endDate: '2026-04-25',
          startTime: '08:00',
          endTime: '17:00',
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 80,
          eventSupabaseId: 'event-ploom-chodov',
          contractorProfileId: 'profile-jan-dubsky',
          name: 'Jan Dubský',
        },
        {
          eventId: 81,
          eventSupabaseId: 'event-riegrovy-sady',
          contractorProfileId: 'profile-jan-dubsky',
          name: 'Jan Dubský',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(2);
    expect(preview.map((row) => row.matchedEvent?.id)).toEqual([80, 81]);
    expect(preview.map((row) => row.status)).toEqual(['ready', 'ready']);
    expect(preview[0].proposedDays).toEqual([
      { d: '2026-04-16', f: '10:00', t: '15:00', type: 'instal' },
      { d: '2026-04-20', f: '10:00', t: '15:00', type: 'instal' },
    ]);
    expect(preview[1].proposedDays).toEqual([
      { d: '2026-04-25', f: '14:00', t: '23:00', type: 'instal' },
    ]);
  });

  it('uses assignment evidence to choose between duplicate same-day events', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-ledvina-duplicate',
          documentName: 'Ledvina - 20260016.pdf',
          jobNumber: 'ORL052',
          invoiceNumber: '20260016',
          supplierName: 'Jan Ledvina',
          comment: 'Elimon Fresh Festival Plzeň - deinstalace\n\nJan Ledvina\n17.5. 15:30 - 3:00 (11,5h)',
        }),
      ],
      events: [
        createEvent({
          id: 90,
          supabaseId: 'event-plzen-duplicate-a',
          name: 'Elimon Fresh Festival Plzeň',
          job: 'ORL052',
          startDate: '2026-05-17',
          endDate: '2026-05-17',
          startTime: '09:00',
          endTime: '17:00',
        }),
        createEvent({
          id: 91,
          supabaseId: 'event-plzen-duplicate-b',
          name: 'Elimon Fresh Festival Plzeň',
          job: 'ORL052',
          startDate: '2026-05-17',
          endDate: '2026-05-17',
          startTime: '09:00',
          endTime: '17:00',
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 91,
          eventSupabaseId: 'event-plzen-duplicate-b',
          contractorProfileId: 'profile-jan-ledvina',
          name: 'Jan Ledvina',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      matchedEvent: { id: 91 },
      proposedDays: [{ d: '2026-05-17', f: '15:30', t: '03:00', type: 'instal' }],
    });
  });

  it('uses Grason event title evidence when NODU event is stored as a generic role', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-vladar-pivni',
          documentName: 'Vladar - 2026-16.pdf',
          jobNumber: 'JTI001',
          invoiceNumber: '2026-16',
          supplierName: 'Daniel Vladař',
          comment: 'Deinstal Pivní slavnosti Třebíč\n\nDaniel Vladař\n24.5. 23:00-05:00 (6h)',
        }),
      ],
      events: [
        createEvent({
          id: 95,
          supabaseId: 'event-pivni-ridic-b',
          name: 'Řidič B',
          job: '',
          startDate: '2026-05-24',
          endDate: '2026-05-24',
          startTime: undefined,
          endTime: undefined,
        }),
        createEvent({
          id: 96,
          supabaseId: 'event-elimon-jti',
          name: 'Elimon Fresh Festival Pardubice',
          job: 'JTI001',
          startDate: '2026-05-24',
          endDate: '2026-05-24',
          startTime: undefined,
          endTime: undefined,
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 95,
          eventSupabaseId: 'event-pivni-ridic-b',
          contractorProfileId: 'profile-daniel',
          name: 'Daniel Vladař',
        },
      ],
      grasonConfirmations: [
        {
          eventId: 'event-pivni-ridic-b',
          eventName: 'Deinstal Pivní slavnosti Třebíč',
          jobNumber: 'JTI001',
          shiftDate: '2026-05-24',
          confirmedName: 'Daniel Vladař',
          profileId: 'profile-daniel',
        },
      ],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      matchedEvent: { id: 95, name: 'Řidič B' },
      proposedDays: [{ d: '2026-05-24', f: '23:00', t: '05:00', type: 'instal' }],
    });
  });

  it('uses event words from the dated line when the comment starts with a person name', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-vilem-entry-event',
          documentName: 'vilemcibulka-202606.pdf',
          jobNumber: 'ORL052',
          invoiceNumber: '202606',
          supplierName: 'Vilém Cibulka',
          comment: [
            'Vilém Cibulka',
            '15.5. Trailer Plzeň instal 10:00 - 17:00 7 h',
          ].join('\n'),
        }),
      ],
      events: [
        createEvent({
          id: 100,
          supabaseId: 'event-elimon-plzen',
          name: 'Elimon Fresh Festival Plzeň - instalace',
          job: 'ORL052',
          startDate: '2026-05-15',
          endDate: '2026-05-15',
          startTime: '09:00',
          endTime: '21:00',
        }),
        createEvent({
          id: 101,
          supabaseId: 'event-elimon-pardubice-same-job',
          name: 'Elimon Fresh Festival Pardubice',
          job: 'ORL052',
          startDate: '2026-05-15',
          endDate: '2026-05-15',
          startTime: '12:00',
          endTime: '17:00',
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 100,
          eventSupabaseId: 'event-elimon-plzen',
          contractorProfileId: 'profile-vilem',
          name: 'Vilém Cibulka',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      matchedEvent: { id: 100 },
      proposedDays: [{ d: '2026-05-15', f: '10:00', t: '17:00', type: 'instal' }],
    });
  });

  it('disambiguates a truncated first name with the surname in the document name', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-safarik-truncated',
          documentName: 'Šafařík - 20260011.pdf',
          jobNumber: 'KCG024',
          invoiceNumber: '20260011',
          supplierName: 'Ondř',
          comment: [
            '22.4.\t9:00-16:00\tPřevoz tisků',
            '23.4.\t9:00-16:00\tPřípravy',
          ].join('\n'),
        }),
      ],
      events: [
        createEvent({
          id: 110,
          supabaseId: 'event-kcg-prevoz',
          name: 'Převoz tisků',
          job: 'KCG024',
          startDate: '2026-04-22',
          endDate: '2026-04-23',
          startTime: '09:00',
          endTime: '16:00',
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [
        {
          eventId: 110,
          eventSupabaseId: 'event-kcg-prevoz',
          contractorProfileId: 'profile-ondrej',
          name: 'Ondřej Šafařík',
        },
      ],
      grasonConfirmations: [],
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      status: 'ready',
      personName: 'Ondř',
      matchedContractor: { profileId: 'profile-ondrej' },
      matchedEvent: { id: 110 },
      proposedDays: [
        { d: '2026-04-22', f: '09:00', t: '16:00', type: 'instal' },
        { d: '2026-04-23', f: '09:00', t: '16:00', type: 'instal' },
      ],
    });
  });

  it('blocks non-approved PowerApps documents from automatic approval', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [createApprovalDocument({ approvalStatus: 'pending', approvalStatusLabel: 've schvalování' })],
      events: [createEvent()],
      contractors,
      timelogs,
      eventCrewAssignments,
      grasonConfirmations: [],
    });

    expect(preview[0]).toMatchObject({
      status: 'blocked',
      reason: 'Dokument jeste neni schvaleny v PowerApps.',
    });
  });

  it('keeps shared job number matches in review when date and name are still ambiguous', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [
        createApprovalDocument({
          jobNumber: 'JTI001',
          supplierName: 'Daniel Vladař',
          comment: 'Elimon Fresh Festival\nDaniel Vladař\n22.5 10:30-16:30 (6h)',
        }),
      ],
      events: [
        createEvent({
          id: 10,
          name: 'Elimon Fresh Festival Pardubice',
          job: 'JTI001',
          startDate: '2026-05-22',
          endDate: '2026-05-22',
        }),
        createEvent({
          id: 11,
          name: 'Elimon Fresh Festival Slavkov',
          job: 'JTI001',
          startDate: '2026-05-22',
          endDate: '2026-05-22',
        }),
      ],
      contractors,
      timelogs: [],
      eventCrewAssignments: [],
      grasonConfirmations: [],
    });

    expect(preview[0]).toMatchObject({
      status: 'needs_review',
      reason: 'Komentar odpovida vice akcim.',
    });
  });

  it('keeps a matched row in review when the proposed time overlaps another timelog', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [createApprovalDocument()],
      events: [
        createEvent(),
        createEvent({
          id: 2,
          supabaseId: 'event-conflict',
          name: 'Jina akce',
          job: 'OTHER',
        }),
      ],
      contractors,
      timelogs: [
        {
          id: 99,
          eid: 2,
          contractorProfileId: 'profile-ondrej',
          days: [{ d: '2026-05-16', f: '09:00', t: '11:00', type: 'instal' }],
          km: 0,
          note: '',
          status: 'approved',
        },
      ],
      eventCrewAssignments,
      grasonConfirmations: [],
    });

    expect(preview[0]).toMatchObject({
      status: 'needs_review',
      reason: 'Clen crew ma ve stejnem case jinou akci.',
    });
  });

  it('allows a clear same-day match when another timelog does not overlap in time', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [createApprovalDocument()],
      events: [
        createEvent(),
        createEvent({
          id: 2,
          supabaseId: 'event-same-day',
          name: 'Jina akce',
          job: 'OTHER',
        }),
      ],
      contractors,
      timelogs: [
        {
          id: 99,
          eid: 2,
          contractorProfileId: 'profile-ondrej',
          days: [{ d: '2026-05-16', f: '14:00', t: '18:00', type: 'instal' }],
          km: 0,
          note: '',
          status: 'approved',
        },
      ],
      eventCrewAssignments,
      grasonConfirmations: [],
    });

    expect(preview[0]).toMatchObject({
      status: 'ready',
      reason: 'Pripraveno k aplikovani.',
    });
  });

  it('marks an already approved matching timelog as applied instead of ready', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [createApprovalDocument()],
      events: [createEvent()],
      contractors,
      timelogs: [
        {
          ...timelogs[0],
          status: 'approved',
          note: 'PowerApps: Safarik - 20260015.pdf',
        },
      ],
      eventCrewAssignments,
      grasonConfirmations: [],
    });

    expect(preview[0]).toMatchObject({
      status: 'applied',
      reason: 'Uz aplikovano v NODU.',
      existingTimelogId: 1,
    });
  });

  it('marks a merged approved timelog as applied when it already references the PowerApps document', () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [createApprovalDocument()],
      events: [createEvent()],
      contractors,
      timelogs: [
        {
          ...timelogs[0],
          status: 'approved',
          days: [
            ...timelogs[0].days,
            { d: '2026-05-17', f: '05:00', t: '10:00', type: 'instal' },
          ],
          note: 'PowerApps: Jiny dokument.pdf\nPowerApps: Safarik - 20260015.pdf',
        },
      ],
      eventCrewAssignments,
      grasonConfirmations: [],
    });

    expect(preview[0]).toMatchObject({
      status: 'applied',
      reason: 'Uz aplikovano v NODU.',
      existingTimelogId: 1,
    });
  });

  it('applies a ready row by updating an existing timelog to approved', async () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [createApprovalDocument()],
      events: [createEvent()],
      contractors,
      timelogs,
      eventCrewAssignments,
      grasonConfirmations: [],
    });
    vi.mocked(saveTimelog).mockResolvedValue({ ...timelogs[0], status: 'approved' });

    await applyApprovalTimelogPreview(preview[0], { timelogs });

    expect(assignCrewToEvent).not.toHaveBeenCalled();
    expect(saveTimelog).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      status: 'approved',
      days: [{ d: '2026-05-16', f: '05:00', t: '13:00', type: 'instal' }],
      note: expect.stringContaining('PowerApps: Safarik - 20260015.pdf'),
    }));
  });

  it('applies a ready row by creating an approved timelog without reassigning crew', async () => {
    const preview = buildApprovalTimelogPreview({
      approvalDocuments: [createApprovalDocument()],
      events: [createEvent()],
      contractors,
      timelogs: [],
      eventCrewAssignments,
      grasonConfirmations: [],
    });
    vi.mocked(createTimelog).mockResolvedValue({
      id: 12,
      eid: 1,
      contractorProfileId: 'profile-ondrej',
      days: preview[0].proposedDays,
      km: 0,
      note: 'PowerApps: Safarik - 20260015.pdf',
      status: 'approved',
    });

    await applyApprovalTimelogPreview(preview[0], { timelogs: [] });

    expect(assignCrewToEvent).not.toHaveBeenCalled();
    expect(createTimelog).toHaveBeenCalledWith(expect.objectContaining({
      eid: 1,
      contractorProfileId: 'profile-ondrej',
      status: 'approved',
      days: [{ d: '2026-05-16', f: '05:00', t: '13:00', type: 'instal' }],
      note: 'PowerApps: Safarik - 20260015.pdf',
    }));
  });
});
