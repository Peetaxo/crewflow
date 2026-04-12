import { Contractor, Event, Invoice, Project, ReceiptItem, Timelog } from '../../../types';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import {
  CreateCrewInput,
  CrewListFilters,
  CrewMember,
  DeleteCrewResult,
  UpdateCrewInput,
} from '../types/crew.types';

const DEFAULT_BILLING_COUNTRY = 'Ceska republika';

const getInitials = (name: string) => (
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
);

const clampRating = (rating?: number | null) => {
  if (rating == null || Number.isNaN(Number(rating))) return null;
  return Math.min(5, Math.max(1, Number(rating)));
};

const normalizeText = (value?: string) => value?.trim() ?? '';

const normalizeTags = (tags: string[] = []) => (
  tags
    .map((tag) => tag.trim())
    .filter(Boolean)
);

const normalizeCrewMember = <T extends CreateCrewInput | UpdateCrewInput>(member: T): T => {
  const name = normalizeText(member.name);
  const city = normalizeText(member.city);

  return {
    ...member,
    name,
    ii: getInitials(name),
    phone: normalizeText(member.phone),
    email: normalizeText(member.email),
    ico: normalizeText(member.ico),
    dic: normalizeText(member.dic),
    bank: normalizeText(member.bank),
    city,
    billingName: normalizeText(member.billingName) || name,
    billingStreet: normalizeText(member.billingStreet),
    billingZip: normalizeText(member.billingZip),
    billingCity: normalizeText(member.billingCity) || city,
    billingCountry: normalizeText(member.billingCountry) || DEFAULT_BILLING_COUNTRY,
    tags: member.tags.includes('Ridic') ? ['Ridic'] : normalizeTags(member.tags),
    note: normalizeText(member.note),
    rate: Number(member.rate) || 0,
    rating: clampRating(member.rating),
  } as T;
};

const validateCrewMember = (member: CreateCrewInput | UpdateCrewInput) => {
  if (!member.name.trim()) {
    throw new Error('Vyplnte jmeno clena crew.');
  }

  if (!member.city.trim()) {
    throw new Error('Vyplnte mesto clena crew.');
  }

  if (!member.phone.trim() && !member.email.trim()) {
    throw new Error('Vyplnte telefon nebo e-mail clena crew.');
  }

  if (member.rate < 0) {
    throw new Error('Sazba nemuze byt zaporna.');
  }
};

const matchesSearch = (member: CrewMember, search: string) => {
  if (!search) return true;

  const query = search.toLowerCase();
  return (
    member.name.toLowerCase().includes(query)
    || member.city.toLowerCase().includes(query)
    || member.tags.some((tag) => tag.toLowerCase().includes(query))
  );
};

export const getCrew = (filters: CrewListFilters = {}): CrewMember[] => {
  const { contractors } = getLocalAppState();

  return contractors.filter((member) => {
    if (!matchesSearch(member, filters.search?.trim() ?? '')) return false;
    if (filters.city && member.city.toLowerCase() !== filters.city.toLowerCase()) return false;
    if (typeof filters.reliable === 'boolean' && member.reliable !== filters.reliable) return false;
    if (filters.tag && !member.tags.includes(filters.tag)) return false;

    return true;
  });
};

export const getCrewById = (id: number | null): CrewMember | null => {
  if (id == null) return null;
  return getLocalAppState().contractors.find((member) => member.id === id) ?? null;
};

export const getCrewByExternalId = (_externalId: string): CrewMember | null => null;

export const getCrewDetailData = (contractorId: number | null): {
  contractor: CrewMember | null;
  timelogs: Timelog[];
  invoices: Invoice[];
  events: Event[];
  projects: Project[];
} => {
  const snapshot = getLocalAppState();
  const contractor = contractorId == null
    ? null
    : snapshot.contractors.find((member) => member.id === contractorId) ?? null;

  if (!contractor) {
    return {
      contractor: null,
      timelogs: [],
      invoices: [],
      events: snapshot.events,
      projects: snapshot.projects,
    };
  }

  return {
    contractor,
    timelogs: snapshot.timelogs.filter((timelog) => timelog.cid === contractor.id),
    invoices: snapshot.invoices.filter((invoice) => invoice.cid === contractor.id),
    events: snapshot.events,
    projects: snapshot.projects,
  };
};

export const createCrew = (input: CreateCrewInput): CrewMember => {
  const normalized = normalizeCrewMember(input);
  validateCrewMember(normalized);

  updateLocalAppState((snapshot) => {
    if (snapshot.contractors.some((member) => member.id === normalized.id)) {
      throw new Error('Clen crew s timto ID uz existuje.');
    }

    return {
      ...snapshot,
      contractors: [...snapshot.contractors, normalized],
    };
  });

  return normalized;
};

export const updateCrew = (input: UpdateCrewInput): CrewMember => {
  const normalized = normalizeCrewMember(input);
  validateCrewMember(normalized);

  let updatedContractor: Contractor | null = null;

  updateLocalAppState((snapshot) => {
    const existing = snapshot.contractors.find((member) => member.id === normalized.id);
    if (!existing) {
      throw new Error('Clen crew nebyl nalezen.');
    }

    updatedContractor = {
      ...existing,
      ...normalized,
    };

    return {
      ...snapshot,
      contractors: snapshot.contractors.map((member) => (
        member.id === normalized.id ? updatedContractor as Contractor : member
      )),
    };
  });

  return updatedContractor as CrewMember;
};

export const deleteCrew = (id: number): DeleteCrewResult => {
  let existing: Contractor | null = null;

  updateLocalAppState((snapshot) => {
    existing = snapshot.contractors.find((member) => member.id === id) ?? null;
    if (!existing) {
      throw new Error('Clen crew nebyl nalezen.');
    }

    return {
      ...snapshot,
      contractors: snapshot.contractors.filter((member) => member.id !== id),
      timelogs: snapshot.timelogs.filter((timelog) => timelog.cid !== id),
      receipts: snapshot.receipts.filter((receipt) => receipt.cid !== id),
    };
  });

  return { id };
};

export const getCrewReceipts = (contractorId: number): ReceiptItem[] => (
  getLocalAppState().receipts.filter((receipt) => receipt.cid === contractorId)
);

export const subscribeToCrewChanges = (listener: () => void): (() => void) => (
  subscribeToLocalAppState(() => listener())
);
