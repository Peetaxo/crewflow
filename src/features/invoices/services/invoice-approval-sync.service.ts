import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState } from '../../../lib/app-data';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type {
  Contractor,
  Event,
  Invoice,
  InvoiceApprovalDocument,
  InvoiceApprovalIndicator,
  PowerAppsApprovalStatus,
  Timelog,
} from '../../../types';
import { calculateTotalHours, getDatesBetween } from '../../../utils';

type InvoiceApprovalDocumentRow = {
  id: string;
  source: string;
  external_id: string | null;
  document_name: string;
  company: string | null;
  job_number: string | null;
  invoice_number: string | null;
  supplier_name: string | null;
  approval_status: PowerAppsApprovalStatus | string | null;
  approval_status_label: string | null;
  comment: string | null;
  approvers: string[] | null;
  requester: string | null;
  raw_payload: Record<string, unknown> | null;
  matched_invoice_id: string | null;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
};

type ParsedApprovalComment = {
  eventName?: string;
  personName?: string;
  eventDate?: {
    day: number;
    month: number;
  };
  totalHours?: number;
};

type BuildInvoiceApprovalIndicatorsInput = {
  invoices: Invoice[];
  approvalDocuments: InvoiceApprovalDocument[];
  contractors: Contractor[];
  events: Event[];
  timelogs: Timelog[];
};

export type EventPersonApprovalStatus = 'not_found' | 'pending' | 'approved' | 'rejected' | 'needs_review';

export type EventPersonApprovalState = {
  status: EventPersonApprovalStatus;
  label: string;
  document?: InvoiceApprovalDocument;
  documents?: InvoiceApprovalDocument[];
};

const normalizeAscii = (value: string): string => (
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
);

const normalizeToken = (value: string | null | undefined): string => (
  normalizeAscii(value ?? '').replace(/[^a-z0-9]+/g, '')
);

const normalizeJobNumber = (value: string | null | undefined): string => (
  normalizeAscii(value ?? '')
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^([a-z]+)0+(\d+)$/, '$1$2')
);

const parseDecimal = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

const getDocumentStatusLabel = (status: PowerAppsApprovalStatus): string => {
  if (status === 'pending') return 'Ve schvalování';
  if (status === 'approved') return 'Schváleno v approval systému';
  if (status === 'rejected') return 'Zamítnuto';
  return 'Ke kontrole';
};

const toIndicator = (document: InvoiceApprovalDocument): InvoiceApprovalIndicator => ({
  status: document.approvalStatus === 'unknown' ? 'needs_review' : document.approvalStatus,
  label: document.approvalStatus === 'unknown' ? 'Ke kontrole' : getDocumentStatusLabel(document.approvalStatus),
  document,
});

const createNeedsReviewIndicator = (
  documents: InvoiceApprovalDocument[],
  reason: string,
): InvoiceApprovalIndicator => ({
  status: 'needs_review',
  label: 'Ke kontrole',
  documents,
  reason,
});

const getContractorNames = (invoice: Invoice, contractors: Contractor[]): string[] => {
  const contractor = invoice.contractorProfileId
    ? contractors.find((item) => item.profileId === invoice.contractorProfileId)
    : null;

  return [
    contractor?.name,
    contractor?.billingName,
    invoice.supplierSnapshot?.name,
  ].filter((value): value is string => Boolean(value));
};

const jobNumberMatches = (invoice: Invoice, document: InvoiceApprovalDocument): boolean => {
  const documentJob = normalizeJobNumber(document.jobNumber);
  if (!documentJob) return false;

  const invoiceJobs = [
    invoice.job,
    ...(invoice.jobNumbers ?? []),
  ].map(normalizeJobNumber).filter(Boolean);

  return invoiceJobs.includes(documentJob);
};

const parsedPersonMatches = (
  parsedPersonName: string | undefined,
  invoice: Invoice,
  contractors: Contractor[],
): boolean => {
  if (!parsedPersonName) return true;

  const normalizedPersonName = normalizeToken(parsedPersonName);
  return getContractorNames(invoice, contractors)
    .some((name) => normalizeToken(name) === normalizedPersonName);
};

const getInvoiceEvents = (invoice: Invoice, events: Event[]): Event[] => {
  const eventIds = new Set([
    invoice.eid,
    ...(invoice.eventIds ?? []),
  ].filter((value) => Number.isFinite(value)));

  return events.filter((event) => eventIds.has(event.id));
};

const eventNameMatches = (parsedName: string | undefined, event: Event): boolean => {
  if (!parsedName) return false;

  const parsed = normalizeAscii(parsedName);
  const eventName = normalizeAscii(event.name);

  return eventName.includes(parsed) || parsed.includes(eventName);
};

const eventDateMatches = (parsedDate: ParsedApprovalComment['eventDate'], event: Event): boolean => {
  if (!parsedDate) return false;

  return getDatesBetween(event.startDate, event.endDate).some((date) => {
    const [year, month, day] = date.split('-').map(Number);
    return Boolean(year) && month === parsedDate.month && day === parsedDate.day;
  });
};

const eventCommentContainsName = (comment: string, event: Event): boolean => {
  const normalizedComment = normalizeAscii(comment);
  const normalizedEventName = normalizeAscii(event.name);
  if (!normalizedComment || !normalizedEventName) return false;

  return normalizedComment.includes(normalizedEventName) || normalizedEventName.includes(normalizedComment);
};

const documentJobMatchesEvent = (document: InvoiceApprovalDocument, event: Event): boolean => {
  const documentJob = normalizeJobNumber(document.jobNumber);
  const eventJob = normalizeJobNumber(event.job);

  return Boolean(documentJob && eventJob && documentJob === eventJob);
};

const documentMatchesEvent = (document: InvoiceApprovalDocument, event: Event): boolean => {
  if (!documentJobMatchesEvent(document, event)) {
    return false;
  }

  const parsed = parsePowerAppsApprovalComment(document.comment);
  return (
    eventNameMatches(parsed.eventName, event)
    || eventDateMatches(parsed.eventDate, event)
    || eventCommentContainsName(document.comment, event)
  );
};

const getPersonTokens = (personName: string): string[] => (
  normalizeAscii(personName)
    .split(/[^a-z0-9]+/)
    .map((token) => normalizeToken(token))
    .filter((token) => token.length >= 3)
);

const candidateMatchesPerson = (candidate: string | null | undefined, personName: string): boolean => {
  const candidateToken = normalizeToken(candidate);
  const personToken = normalizeToken(personName);
  if (!candidateToken || !personToken) return false;

  if (candidateToken === personToken || candidateToken.includes(personToken)) {
    return true;
  }

  if (candidateToken.length >= 6 && personToken.includes(candidateToken)) {
    return true;
  }

  const personTokens = getPersonTokens(personName);
  if (personTokens.length === 0) return false;

  const matchingTokenCount = personTokens.filter((token) => candidateToken.includes(token)).length;
  if (matchingTokenCount >= Math.min(2, personTokens.length)) {
    return true;
  }

  const lastToken = personTokens[personTokens.length - 1];
  return Boolean(lastToken && candidateToken.includes(lastToken));
};

const documentMatchesPerson = (document: InvoiceApprovalDocument, personName: string): boolean => {
  const parsed = parsePowerAppsApprovalComment(document.comment);
  const candidates = [
    parsed.personName,
    document.supplierName,
    document.documentName,
    document.comment,
  ];

  return candidates.some((candidate) => candidateMatchesPerson(candidate, personName));
};

const getEventPersonApprovalLabel = (status: EventPersonApprovalStatus): string => {
  if (status === 'pending') return 'Ve schvalování';
  if (status === 'approved') return 'Uzavřeno v approval systému';
  if (status === 'rejected') return 'Zamítnuto';
  if (status === 'needs_review') return 'Ke kontrole';
  return 'Nenalezeno v approval systému';
};

const invoiceHoursFromTimelogs = (invoice: Invoice, timelogs: Timelog[]): number => {
  const linkedIds = new Set(invoice.timelogIds ?? []);
  const linkedTimelogs = timelogs.filter((timelog) => linkedIds.has(timelog.id));
  if (linkedTimelogs.length === 0) return invoice.hours;

  return linkedTimelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
};

const totalHoursMatches = (invoice: Invoice, parsedHours: number | undefined, timelogs: Timelog[]): boolean => {
  if (parsedHours == null) return false;
  return Math.abs(invoiceHoursFromTimelogs(invoice, timelogs) - parsedHours) <= 0.1;
};

const fallbackMatches = (
  invoice: Invoice,
  document: InvoiceApprovalDocument,
  contractors: Contractor[],
  events: Event[],
  timelogs: Timelog[],
): boolean => {
  if (!jobNumberMatches(invoice, document)) {
    return false;
  }

  const parsed = parsePowerAppsApprovalComment(document.comment);
  if (!parsed.eventName && !parsed.eventDate && parsed.totalHours == null && !parsed.personName) {
    return false;
  }
  if (!parsedPersonMatches(parsed.personName, invoice, contractors)) {
    return false;
  }

  const invoiceEvents = getInvoiceEvents(invoice, events);
  const hasEventMatch = invoiceEvents.some((event) => (
    eventNameMatches(parsed.eventName, event) || eventDateMatches(parsed.eventDate, event)
  ));
  const hasHoursMatch = totalHoursMatches(invoice, parsed.totalHours, timelogs);

  return hasEventMatch && hasHoursMatch;
};

export const mapPowerAppsApprovalStatus = (statusLabel: string | null | undefined): PowerAppsApprovalStatus => {
  const normalized = normalizeAscii(statusLabel ?? '');

  if (normalized.includes('ve schvalovani') || normalized.includes('ceka') || normalized.includes('pending')) {
    return 'pending';
  }
  if (normalized.includes('schvaleno') || normalized.includes('approved')) {
    return 'approved';
  }
  if (normalized.includes('zamitnuto') || normalized.includes('rejected')) {
    return 'rejected';
  }

  return 'unknown';
};

export const parsePowerAppsApprovalComment = (comment: string): ParsedApprovalComment => {
  const lines = comment
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const dateLine = lines.find((line) => /\b\d{1,2}\.\d{1,2}/.test(line));
  const dateMatch = dateLine?.match(/\b(\d{1,2})\.(\d{1,2})(?:\.\d{2,4})?\b/);
  const totalHoursMatch = comment.match(/celkem\s*([\d.,]+)\s*h/i) ?? comment.match(/\b([\d.,]+)\s*h\b/i);

  return {
    eventName: lines[0],
    personName: lines[1],
    eventDate: dateMatch
      ? {
        day: Number(dateMatch[1]),
        month: Number(dateMatch[2]),
      }
      : undefined,
    totalHours: parseDecimal(totalHoursMatch?.[1]),
  };
};

export const getEventApprovalDocuments = (
  event: Event,
  approvalDocuments: InvoiceApprovalDocument[],
): InvoiceApprovalDocument[] => (
  approvalDocuments
    .filter((document) => documentMatchesEvent(document, event))
    .sort((left, right) => {
      const leftDate = Date.parse(left.lastSyncedAt || left.createdAt || '');
      const rightDate = Date.parse(right.lastSyncedAt || right.createdAt || '');
      if (Number.isFinite(leftDate) && Number.isFinite(rightDate) && leftDate !== rightDate) {
        return rightDate - leftDate;
      }
      return left.documentName.localeCompare(right.documentName, 'cs');
    })
);

export const getEventPersonApprovalState = ({
  event,
  personName,
  approvalDocuments,
}: {
  event: Event;
  personName: string;
  approvalDocuments: InvoiceApprovalDocument[];
}): EventPersonApprovalState => {
  const documents = getEventApprovalDocuments(event, approvalDocuments)
    .filter((document) => documentMatchesPerson(document, personName));

  if (documents.length === 0) {
    return {
      status: 'not_found',
      label: getEventPersonApprovalLabel('not_found'),
    };
  }

  const status = documents.some((document) => document.approvalStatus === 'pending')
    ? 'pending'
    : documents.some((document) => document.approvalStatus === 'approved')
      ? 'approved'
      : documents.some((document) => document.approvalStatus === 'rejected')
        ? 'rejected'
        : 'needs_review';

  return {
    status,
    label: getEventPersonApprovalLabel(status),
    document: documents[0],
    documents,
  };
};

export const buildInvoiceApprovalIndicators = ({
  invoices,
  approvalDocuments,
  contractors,
  events,
  timelogs,
}: BuildInvoiceApprovalIndicatorsInput): Map<string, InvoiceApprovalIndicator> => {
  const indicators = new Map<string, InvoiceApprovalIndicator>();
  const fallbackMatchesByInvoiceId = new Map<string, InvoiceApprovalDocument[]>();
  const fallbackInvoiceIdsByDocumentId = new Map<string, string[]>();

  approvalDocuments.forEach((document) => {
    const matchingInvoiceIds = invoices
      .filter((invoice) => fallbackMatches(invoice, document, contractors, events, timelogs))
      .map((invoice) => invoice.id);

    if (matchingInvoiceIds.length > 0) {
      fallbackInvoiceIdsByDocumentId.set(document.id, matchingInvoiceIds);
    }

    matchingInvoiceIds.forEach((invoiceId) => {
      const current = fallbackMatchesByInvoiceId.get(invoiceId) ?? [];
      current.push(document);
      fallbackMatchesByInvoiceId.set(invoiceId, current);
    });
  });

  invoices.forEach((invoice) => {
    const explicitMatches = approvalDocuments.filter((document) => document.matchedInvoiceId === invoice.id);
    if (explicitMatches.length === 1) {
      indicators.set(invoice.id, toIndicator(explicitMatches[0]));
      return;
    }
    if (explicitMatches.length > 1) {
      indicators.set(invoice.id, createNeedsReviewIndicator(explicitMatches, 'Více dokumentů je ručně navázaných na stejnou fakturu.'));
      return;
    }

    const fallbackDocuments = fallbackMatchesByInvoiceId.get(invoice.id) ?? [];

    if (fallbackDocuments.length === 1) {
      const matchingInvoiceIds = fallbackInvoiceIdsByDocumentId.get(fallbackDocuments[0].id) ?? [];
      indicators.set(
        invoice.id,
        matchingInvoiceIds.length === 1
          ? toIndicator(fallbackDocuments[0])
          : createNeedsReviewIndicator(fallbackDocuments, 'Jeden PowerApps dokument odpovídá více fakturám se sdíleným job number.'),
      );
      return;
    }
    if (fallbackDocuments.length > 1) {
      indicators.set(invoice.id, createNeedsReviewIndicator(fallbackDocuments, 'Více dokumentů odpovídá komentáři a sdílenému job number.'));
    }
  });

  return indicators;
};

export const mapInvoiceApprovalDocumentRow = (row: InvoiceApprovalDocumentRow): InvoiceApprovalDocument => ({
  id: row.id,
  source: 'powerapps_document_approval',
  externalId: row.external_id,
  documentName: row.document_name,
  company: row.company ?? '',
  jobNumber: row.job_number ?? '',
  invoiceNumber: row.invoice_number ?? '',
  supplierName: row.supplier_name ?? '',
  approvalStatus: mapPowerAppsApprovalStatus(row.approval_status_label ?? row.approval_status),
  approvalStatusLabel: row.approval_status_label ?? '',
  comment: row.comment ?? '',
  approvers: row.approvers ?? [],
  requester: row.requester ?? '',
  rawPayload: row.raw_payload ?? null,
  matchedInvoiceId: row.matched_invoice_id,
  lastSyncedAt: row.last_synced_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const fetchInvoiceApprovalDocuments = async (): Promise<InvoiceApprovalDocument[]> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return getLocalAppState().invoiceApprovalDocuments ?? [];
  }

  const result = await supabase
    .from('invoice_approval_documents')
    .select('*')
    .order('last_synced_at');

  if (result.error) {
    console.warn('Nepodarilo se nacist approval dokumenty ze Supabase.', result.error);
    return getLocalAppState().invoiceApprovalDocuments ?? [];
  }

  return ((result.data ?? []) as InvoiceApprovalDocumentRow[]).map(mapInvoiceApprovalDocumentRow);
};
