import { describe, expect, it } from 'vitest';
import type { Contractor, Event, Invoice, InvoiceApprovalDocument, Timelog } from '../../../types';
import {
  buildInvoiceApprovalIndicators,
  getEventApprovalDocuments,
  getEventPersonApprovalState,
  mapPowerAppsApprovalStatus,
  parsePowerAppsApprovalComment,
} from './invoice-approval-sync.service';

const contractors: Contractor[] = [
  {
    id: 1,
    profileId: 'profile-uuid-1',
    userId: 'user-uuid-1',
    name: 'Daniel Vladař',
    ii: 'DV',
    bg: '#000',
    fg: '#fff',
    tags: [],
    events: 0,
    rate: 250,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    city: 'Praha',
    reliable: true,
    note: '',
  },
];

const events: Event[] = [
  {
    id: 1,
    name: 'Women Summit - deinstal',
    job: 'ORL054',
    startDate: '2026-05-21',
    endDate: '2026-05-21',
    city: 'Praha',
    needed: 1,
    filled: 1,
    status: 'past',
    client: 'NL',
  },
  {
    id: 2,
    name: 'Women Summit - instal',
    job: 'ORL054',
    startDate: '2026-05-20',
    endDate: '2026-05-20',
    city: 'Praha',
    needed: 1,
    filled: 1,
    status: 'past',
    client: 'NL',
  },
];

const timelogs: Timelog[] = [
  {
    id: 1,
    eid: 1,
    contractorProfileId: 'profile-uuid-1',
    days: [{ d: '2026-05-21', f: '18:30', t: '23:30', type: 'deinstal' }],
    km: 0,
    note: '',
    status: 'invoiced',
  },
  {
    id: 2,
    eid: 2,
    contractorProfileId: 'profile-uuid-1',
    days: [{ d: '2026-05-20', f: '10:00', t: '15:00', type: 'instal' }],
    km: 0,
    note: '',
    status: 'invoiced',
  },
];

const createInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'invoice-uuid-1',
  contractorProfileId: 'profile-uuid-1',
  eid: 1,
  eventIds: [1],
  timelogIds: [1],
  hours: 5,
  hAmt: 1250,
  km: 0,
  kAmt: 0,
  receiptAmt: 0,
  total: 1250,
  job: 'ORL054',
  jobNumbers: ['ORL054'],
  invoiceNumber: '2026-14',
  status: 'sent',
  sentAt: '2026-05-22T08:00:00Z',
  ...overrides,
});

const createApprovalDocument = (overrides: Partial<InvoiceApprovalDocument> = {}): InvoiceApprovalDocument => ({
  id: 'approval-doc-1',
  source: 'powerapps_document_approval',
  externalId: 'powerapps-doc-1',
  documentName: 'Vladar - 2026-14.pdf',
  company: 'NL',
  jobNumber: 'ORL054',
  invoiceNumber: '2026-14',
  supplierName: 'Daniel Vladař',
  approvalStatus: 'pending',
  approvalStatusLabel: 've schvalování',
  comment: [
    'Women Summit - deinstal',
    '',
    'Daniel Vladař',
    '21.5 18:30 - 23:30',
    'Celkem 5h',
  ].join('\n'),
  approvers: ['Ales Burger', 'Michal Valta'],
  requester: 'Petr Heitzer',
  rawPayload: null,
  matchedInvoiceId: null,
  lastSyncedAt: '2026-05-22T09:00:00Z',
  ...overrides,
});

describe('invoice approval sync service', () => {
  it('maps Czech PowerApps approval statuses without changing invoice payment state', () => {
    expect(mapPowerAppsApprovalStatus('ve schvalování')).toBe('pending');
    expect(mapPowerAppsApprovalStatus('schváleno')).toBe('approved');
    expect(mapPowerAppsApprovalStatus('zamítnuto')).toBe('rejected');
    expect(mapPowerAppsApprovalStatus('něco jiného')).toBe('unknown');
  });

  it('parses event, person, date and total hours from the PowerApps comment', () => {
    expect(parsePowerAppsApprovalComment(createApprovalDocument().comment)).toEqual({
      eventName: 'Women Summit - deinstal',
      personName: 'Daniel Vladař',
      eventDate: { day: 21, month: 5 },
      totalHours: 5,
    });
  });

  it('matches by job number and PowerApps comment even when supplier and invoice number are unreliable', () => {
    const indicators = buildInvoiceApprovalIndicators({
      invoices: [createInvoice()],
      approvalDocuments: [
        createApprovalDocument({
          invoiceNumber: 'JINE-CISLO',
          supplierName: 'Vladař Daniel',
        }),
      ],
      contractors,
      events,
      timelogs,
    });

    expect(indicators.get('invoice-uuid-1')).toMatchObject({
      status: 'pending',
      label: 'Ve schvalování',
      document: {
        documentName: 'Vladar - 2026-14.pdf',
      },
    });
  });

  it('does not auto-match when only supplier, invoice number and job number match', () => {
    const indicators = buildInvoiceApprovalIndicators({
      invoices: [createInvoice()],
      approvalDocuments: [
        createApprovalDocument({
          comment: 'Komentář bez názvu akce, data a hodin',
        }),
      ],
      contractors,
      events,
      timelogs,
    });

    expect(indicators.get('invoice-uuid-1')).toBeUndefined();
  });

  it('keeps shared-job fallback matches ambiguous until reviewed', () => {
    const indicators = buildInvoiceApprovalIndicators({
      invoices: [
        createInvoice(),
        createInvoice({
          id: 'invoice-uuid-2',
          eid: 2,
          eventIds: [2],
          timelogIds: [2],
          invoiceNumber: '2026-15',
        }),
      ],
      approvalDocuments: [
        createApprovalDocument({
          invoiceNumber: '',
          comment: [
            'Women Summit',
            '',
            'Daniel Vladař',
            '21.5 18:30 - 23:30',
            'Celkem 5h',
          ].join('\n'),
        }),
      ],
      contractors,
      events: [
        events[0],
        { ...events[1], startDate: '2026-05-21', endDate: '2026-05-21' },
      ],
      timelogs,
    });

    expect(indicators.get('invoice-uuid-1')).toMatchObject({
      status: 'needs_review',
      label: 'Ke kontrole',
    });
    expect(indicators.get('invoice-uuid-2')).toMatchObject({
      status: 'needs_review',
      label: 'Ke kontrole',
    });
  });

  it('matches an approval document to a person on an event by job number and comment', () => {
    const approvalState = getEventPersonApprovalState({
      event: events[0],
      personName: 'Daniel Vladař',
      approvalDocuments: [
        createApprovalDocument({
          approvalStatus: 'approved',
          approvalStatusLabel: 'schváleno',
          invoiceNumber: 'nespolehlive-cislo',
          supplierName: '',
        }),
      ],
    });

    expect(approvalState).toMatchObject({
      status: 'approved',
      label: 'Uzavřeno v approval systému',
      document: {
        documentName: 'Vladar - 2026-14.pdf',
      },
    });
  });

  it('prioritizes pending approval over approved when a person has more matching documents', () => {
    const approvalState = getEventPersonApprovalState({
      event: events[0],
      personName: 'Daniel Vladař',
      approvalDocuments: [
        createApprovalDocument({
          id: 'approval-doc-approved',
          approvalStatus: 'approved',
          approvalStatusLabel: 'schváleno',
        }),
        createApprovalDocument({
          id: 'approval-doc-pending',
          documentName: 'Vladar - 2026-15.pdf',
          approvalStatus: 'pending',
          approvalStatusLabel: 've schvalování',
          invoiceNumber: '2026-15',
        }),
      ],
    });

    expect(approvalState.status).toBe('pending');
    expect(approvalState.label).toBe('Ve schvalování');
  });

  it('matches ORL52 and ORL052 as the same job number for event approval dots', () => {
    const approvalState = getEventPersonApprovalState({
      event: { ...events[0], job: 'ORL52' },
      personName: 'Daniel Vladař',
      approvalDocuments: [
        createApprovalDocument({
          jobNumber: 'ORL052',
          approvalStatus: 'approved',
          approvalStatusLabel: 'schváleno',
        }),
      ],
    });

    expect(approvalState.status).toBe('approved');
  });

  it('returns not found when no approval document matches the event and person', () => {
    expect(getEventPersonApprovalState({
      event: events[0],
      personName: 'Milan Tyl',
      approvalDocuments: [createApprovalDocument()],
    })).toMatchObject({
      status: 'not_found',
      label: 'Nenalezeno v approval systému',
    });
  });

  it('lists approval documents that belong to an event by job number and comment', () => {
    const eventDocuments = getEventApprovalDocuments(events[0], [
      createApprovalDocument({ id: 'matching-doc' }),
      createApprovalDocument({
        id: 'other-event-doc',
        comment: [
          'Women Summit - instal',
          '',
          'Daniel Vladař',
          '20.5 10:00 - 15:00',
          'Celkem 5h',
        ].join('\n'),
      }),
    ]);

    expect(eventDocuments.map((document) => document.id)).toEqual(['matching-doc']);
  });

  it('does not list a document for another named event that only shares job number and date', () => {
    const eventDocuments = getEventApprovalDocuments({
      ...events[0],
      id: 20,
      name: 'Elimon Fresh Festival Pardubice',
      job: 'JTI001',
      startDate: '2026-05-24',
      endDate: '2026-05-24',
    }, [
      createApprovalDocument({
        id: 'pivni-doc',
        documentName: 'Vladar - 2026-16.pdf',
        jobNumber: 'JTI001',
        comment: 'Deinstal Pivní slavnosti Třebíč Daniel Vladař 24.5. 23:00-05:00 (6h)',
      }),
    ]);

    expect(eventDocuments).toEqual([]);
  });

  it('keeps date fallback for generic role events when the PowerApps comment has the real event name', () => {
    const eventDocuments = getEventApprovalDocuments({
      ...events[0],
      id: 21,
      name: 'Řidič B',
      job: 'JTI001',
      startDate: '2026-05-24',
      endDate: '2026-05-24',
    }, [
      createApprovalDocument({
        id: 'pivni-doc',
        documentName: 'Vladar - 2026-16.pdf',
        jobNumber: 'JTI001',
        comment: 'Deinstal Pivní slavnosti Třebíč Daniel Vladař 24.5. 23:00-05:00 (6h)',
      }),
    ]);

    expect(eventDocuments.map((document) => document.id)).toEqual(['pivni-doc']);
  });
});
