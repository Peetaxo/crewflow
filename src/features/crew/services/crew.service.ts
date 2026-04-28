import { appDataSource } from '../../../lib/app-config';
import { Contractor, Event, Invoice, Project, ReceiptItem, Timelog } from '../../../types';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import { mapContractor } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import {
  CreateCrewInput,
  CrewListFilters,
  CrewMember,
  DeleteCrewResult,
  UpdateCrewInput,
} from '../types/crew.types';

const DEFAULT_BILLING_COUNTRY = 'Ceska republika';
let crewHydrationPromise: Promise<void> | null = null;
let crewLoaded = false;

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

const toProfilePayload = (member: CreateCrewInput | UpdateCrewInput) => ({
  first_name: member.name.trim().split(/\s+/).slice(0, -1).join(' ') || member.name.trim(),
  last_name: member.name.trim().split(/\s+/).slice(-1).join(''),
  phone: member.phone || null,
  email: member.email || null,
  ico: member.ico || null,
  dic: member.dic || null,
  bank_account: member.bank || null,
  iban: member.iban || null,
  billing_street: member.billingStreet || null,
  billing_zip: member.billingZip || null,
  billing_city: member.billingCity || member.city || null,
  billing_country: member.billingCountry || DEFAULT_BILLING_COUNTRY,
  hourly_rate: Number(member.rate) || 0,
  tags: member.tags.includes('Ridic') ? ['Ridic'] : normalizeTags(member.tags),
  note: member.note || null,
  reliable: member.reliable,
  rating: clampRating(member.rating),
  avatar_color: member.fg || null,
  avatar_bg: member.bg || null,
});

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
    iban: normalizeText(member.iban),
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

const hydrateCrewFromSupabase = async (): Promise<void> => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  const [profilesResult, timelogsResult] = await Promise.all([
    supabase.from('profiles').select('*').order('last_name').order('first_name'),
    supabase.from('timelogs').select('contractor_id, event_id'),
  ]);

  const firstError = profilesResult.error ?? timelogsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  const timelogRows = timelogsResult.data ?? [];
  const eventCountsByProfileId = new Map<string, number>();

  for (const row of timelogRows) {
    if (!row.contractor_id || !row.event_id) continue;
    const key = `${row.contractor_id}:${row.event_id}`;
    if (eventCountsByProfileId.has(key)) continue;
    eventCountsByProfileId.set(key, 1);
  }

  const countsByProfile = new Map<string, number>();
  for (const compositeKey of eventCountsByProfileId.keys()) {
    const profileId = compositeKey.split(':', 1)[0];
    countsByProfile.set(profileId, (countsByProfile.get(profileId) ?? 0) + 1);
  }

  const supabaseCrew = (profilesResult.data ?? []).map((row, index) => ({
    ...mapContractor(row),
    id: index + 1,
    profileId: row.id,
    userId: row.user_id,
    events: countsByProfile.get(row.id) ?? 0,
  }));

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    contractors: supabaseCrew,
  }));
};

const ensureSupabaseCrewLoaded = () => {
  if (appDataSource !== 'supabase' || !supabase || !isSupabaseConfigured) {
    return;
  }

  if (crewLoaded) {
    return;
  }

  if (crewHydrationPromise) {
    return;
  }

  crewHydrationPromise = hydrateCrewFromSupabase()
    .then(() => {
      crewLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist crew ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      crewHydrationPromise = null;
    });
};

export const getCrew = (filters: CrewListFilters = {}): CrewMember[] => {
  ensureSupabaseCrewLoaded();
  const { contractors } = getLocalAppState();
  const safeContractors = contractors ?? [];

  return safeContractors.filter((member) => {
    if (!matchesSearch(member, filters.search?.trim() ?? '')) return false;
    if (filters.city && member.city.toLowerCase() !== filters.city.toLowerCase()) return false;
    if (typeof filters.reliable === 'boolean' && member.reliable !== filters.reliable) return false;
    if (filters.tag && !member.tags.includes(filters.tag)) return false;

    return true;
  });
};

export const getContractors = (): Contractor[] => getCrew();

export const getCrewById = (id: number | null): CrewMember | null => {
  ensureSupabaseCrewLoaded();
  if (id == null) return null;
  return (getLocalAppState().contractors ?? []).find((member) => member.id === id) ?? null;
};

export const getCrewByExternalId = (_externalId: string): CrewMember | null => null;

const parseLegacyCrewKey = (profileId: string | null): number | null => {
  if (!profileId?.startsWith('legacy:')) return null;
  const legacyId = Number(profileId.slice('legacy:'.length));
  return Number.isFinite(legacyId) ? legacyId : null;
};

export const getCrewDetailData = (profileId: string | null): {
  contractor: CrewMember | null;
  timelogs: Timelog[];
  invoices: Invoice[];
  events: Event[];
  projects: Project[];
} => {
  ensureSupabaseCrewLoaded();
  const snapshot = getLocalAppState();
  const legacyId = parseLegacyCrewKey(profileId);
  const contractor = profileId == null
    ? null
    : (snapshot.contractors ?? []).find((member) => (
      legacyId == null
        ? member.profileId === profileId
        : member.id === legacyId
    )) ?? null;

  if (!contractor) {
    return {
      contractor: null,
      timelogs: [],
      invoices: [],
      events: snapshot.events ?? [],
      projects: snapshot.projects ?? [],
    };
  }

  const matchesContractor = (item: { cid?: number; contractorProfileId?: string }) => (
    contractor.profileId
      ? item.contractorProfileId === contractor.profileId
      : item.cid === contractor.id
  );

  return {
    contractor,
    timelogs: (snapshot.timelogs ?? []).filter(matchesContractor),
    invoices: (snapshot.invoices ?? []).filter(matchesContractor),
    events: snapshot.events ?? [],
    projects: snapshot.projects ?? [],
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

export const updateCrew = async (input: UpdateCrewInput): Promise<CrewMember> => {
  const normalized = normalizeCrewMember(input);
  validateCrewMember(normalized);

  let updatedContractor: Contractor | null = null;

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    if (!normalized.profileId) {
      throw new Error('Clen crew nema UUID profil, nelze jej ulozit do Supabase.');
    }

    const profileUpdate = await supabase
      .from('profiles')
      .update(toProfilePayload(normalized))
      .eq('id', normalized.profileId);

    if (profileUpdate.error) {
      throw new Error(profileUpdate.error.message);
    }
  }

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

export const updateContractor = async (contractor: Contractor): Promise<Contractor> => (
  updateCrew(contractor as UpdateCrewInput)
);

export const deleteCrew = async (id: number): Promise<DeleteCrewResult> => {
  let existing: Contractor | null = null;

  if (appDataSource === 'supabase' && supabase && isSupabaseConfigured) {
    const snapshot = getLocalAppState();
    existing = snapshot.contractors.find((member) => member.id === id) ?? null;
    if (!existing) {
      throw new Error('Clen crew nebyl nalezen.');
    }

    if (!existing.profileId) {
      throw new Error('Clen crew nema UUID profil, nelze jej smazat ze Supabase.');
    }

    const hasLinkedData = (snapshot.timelogs ?? []).some((timelog) => timelog.contractorProfileId === existing?.profileId)
      || (snapshot.receipts ?? []).some((receipt) => receipt.contractorProfileId === existing?.profileId)
      || (snapshot.invoices ?? []).some((invoice) => invoice.contractorProfileId === existing?.profileId);

    if (hasLinkedData) {
      throw new Error('Clena crew s navazanymi vykazy, uctenkami nebo fakturami zatim nelze smazat.');
    }

    const assignmentDelete = await supabase
      .from('event_assignments')
      .delete()
      .eq('profile_id', existing.profileId);

    if (assignmentDelete.error) {
      throw new Error(assignmentDelete.error.message);
    }

    const profileDelete = await supabase
      .from('profiles')
      .delete()
      .eq('id', existing.profileId);

    if (profileDelete.error) {
      throw new Error(profileDelete.error.message);
    }
  }

  updateLocalAppState((snapshot) => {
    existing = snapshot.contractors.find((member) => member.id === id) ?? null;
    if (!existing) {
      throw new Error('Clen crew nebyl nalezen.');
    }

    return {
      ...snapshot,
      contractors: snapshot.contractors.filter((member) => member.id !== id),
      timelogs: snapshot.timelogs.filter((timelog) => timelog.contractorProfileId !== existing?.profileId),
      receipts: snapshot.receipts.filter((receipt) => receipt.contractorProfileId !== existing?.profileId),
    };
  });

  return { id };
};

export const getCrewReceipts = (contractorProfileId: string): ReceiptItem[] => (
  (ensureSupabaseCrewLoaded(), (getLocalAppState().receipts ?? []).filter((receipt) => (
    receipt.contractorProfileId === contractorProfileId
  )))
);

export const subscribeToCrewChanges = (listener: () => void): (() => void) => {
  ensureSupabaseCrewLoaded();
  return subscribeToLocalAppState(() => listener());
};

export const resetSupabaseCrewHydration = () => {
  crewHydrationPromise = null;
  crewLoaded = false;
};
