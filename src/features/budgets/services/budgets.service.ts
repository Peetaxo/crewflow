import { appDataSource } from '../../../lib/app-config';
import { getLocalAppState, subscribeToLocalAppState, updateLocalAppState } from '../../../lib/app-data';
import type { AppDataSnapshot } from '../../../lib/app-data';
import { mapBudgetItem, mapBudgetPackage } from '../../../lib/supabase-mappers';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type { BudgetItem, BudgetItemDraft, BudgetPackage, BudgetPackageDraft, Event } from '../../../types';

export interface BudgetPackageOverview extends BudgetPackage {
  items: BudgetItem[];
  linkedEvents: Event[];
  plannedTotal: number;
  actualTotal: number;
  variance: number;
}

export interface ProjectBudgetOverview {
  projectId: string;
  packages: BudgetPackageOverview[];
  plannedTotal: number;
  actualTotal: number;
  variance: number;
}

export interface BudgetDependencies {
  projects: AppDataSnapshot['projects'];
  events: AppDataSnapshot['events'];
  budgetPackages: AppDataSnapshot['budgetPackages'];
  budgetItems: AppDataSnapshot['budgetItems'];
}

const today = () => new Date().toISOString().split('T')[0];

const normalizeProjectId = (projectId: string): string => projectId.trim().toUpperCase();

const normalizeText = (value: string | null | undefined): string => (value ?? '').trim();

const normalizeNumber = (value: unknown): number => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
};

const roundToCents = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const getNextId = (rows: Array<{ id: number }>): number => Math.max(0, ...rows.map((row) => row.id)) + 1;

const normalizeEventIds = (eventIds: number[] | undefined): number[] => (
  [...new Set((eventIds ?? []).map(Number).filter((id) => Number.isFinite(id)))]
    .sort((left, right) => left - right)
);

const normalizePackage = (
  draft: BudgetPackageDraft,
  existingPackages: BudgetPackage[],
): BudgetPackage => {
  const existingPackage = draft.id
    ? existingPackages.find((budgetPackage) => budgetPackage.id === draft.id)
    : undefined;

  return {
    id: draft.id ?? getNextId(existingPackages),
    supabaseId: draft.supabaseId ?? existingPackage?.supabaseId,
    projectId: normalizeProjectId(draft.projectId),
    name: normalizeText(draft.name),
    note: normalizeText(draft.note),
    eventIds: normalizeEventIds(draft.eventIds),
    createdAt: draft.createdAt ?? existingPackage?.createdAt ?? today(),
  };
};

const assertBudgetPackageProjectUnchanged = (
  budgetPackage: BudgetPackage,
  existingPackages: BudgetPackage[],
): void => {
  const existingPackage = existingPackages.find((item) => item.id === budgetPackage.id);
  if (
    existingPackage
    && normalizeProjectId(existingPackage.projectId) !== normalizeProjectId(budgetPackage.projectId)
  ) {
    throw new Error('Rozpoctovy balik nepatri do vybraneho projektu.');
  }
};

const assertBudgetPackageEventsBelongToProject = (
  budgetPackage: BudgetPackage,
  events: Event[],
): void => {
  const projectId = normalizeProjectId(budgetPackage.projectId);
  const hasCrossProjectEvent = budgetPackage.eventIds.some((eventId) => {
    const event = events.find((item) => item.id === eventId);
    return !event || normalizeProjectId(event.job) !== projectId;
  });

  if (hasCrossProjectEvent) {
    throw new Error('Akce nepatri do vybraneho projektu.');
  }
};

const normalizeItem = (
  draft: BudgetItemDraft,
  existingItems: BudgetItem[],
): BudgetItem => {
  const existingItem = draft.id
    ? existingItems.find((budgetItem) => budgetItem.id === draft.id)
    : undefined;

  return {
    id: draft.id ?? getNextId(existingItems),
    supabaseId: draft.supabaseId ?? existingItem?.supabaseId,
    projectId: normalizeProjectId(draft.projectId),
    budgetPackageId: draft.budgetPackageId ?? null,
    eventId: draft.eventId ?? null,
    section: normalizeText(draft.section).toUpperCase(),
    name: normalizeText(draft.name),
    units: normalizeText(draft.units),
    amount: normalizeNumber(draft.amount),
    quantity: normalizeNumber(draft.quantity),
    unitPrice: normalizeNumber(draft.unitPrice),
    note: normalizeText(draft.note),
    createdAt: draft.createdAt ?? existingItem?.createdAt ?? today(),
  };
};

const sum = (values: number[]): number => roundToCents(values.reduce((total, value) => total + value, 0));

const canUseSupabase = (): boolean => appDataSource === 'supabase' && Boolean(supabase) && isSupabaseConfigured;

const getProjectSupabaseId = (projectId: string, snapshot = getLocalAppState()): string => {
  const project = (snapshot.projects ?? []).find((item) => normalizeProjectId(item.id) === normalizeProjectId(projectId));
  if (!project?.supabaseId) {
    throw new Error('Projekt neni propojeny se Supabase.');
  }
  return project.supabaseId;
};

const getEventForSupabaseWrite = (eventId: number, projectId: string, snapshot: AppDataSnapshot): Event => {
  const event = (snapshot.events ?? []).find((item) => item.id === eventId);
  if (!event?.supabaseId) {
    throw new Error('Akce neni propojena se Supabase.');
  }
  if (normalizeProjectId(event.job) !== normalizeProjectId(projectId)) {
    throw new Error('Akce nepatri do vybraneho projektu.');
  }
  return event;
};

const getBudgetPackageForSupabaseWrite = (
  budgetPackageId: number,
  projectId: string,
  snapshot: AppDataSnapshot,
): BudgetPackage => {
  const budgetPackage = (snapshot.budgetPackages ?? []).find((item) => item.id === budgetPackageId);
  if (!budgetPackage?.supabaseId) {
    throw new Error('Rozpoctovy balik neni propojeny se Supabase.');
  }
  if (normalizeProjectId(budgetPackage.projectId) !== normalizeProjectId(projectId)) {
    throw new Error('Rozpoctovy balik nepatri do vybraneho projektu.');
  }
  return budgetPackage;
};

const assertBudgetItemLinksBelongToProject = (
  budgetItem: BudgetItem,
  snapshot: AppDataSnapshot,
): void => {
  const projectId = normalizeProjectId(budgetItem.projectId);

  if (budgetItem.budgetPackageId) {
    const budgetPackage = (snapshot.budgetPackages ?? []).find((item) => item.id === budgetItem.budgetPackageId);
    if (!budgetPackage || normalizeProjectId(budgetPackage.projectId) !== projectId) {
      throw new Error('Rozpoctovy balik nepatri do vybraneho projektu.');
    }
  }

  if (budgetItem.eventId) {
    const event = (snapshot.events ?? []).find((item) => item.id === budgetItem.eventId);
    if (!event || normalizeProjectId(event.job) !== projectId) {
      throw new Error('Akce nepatri do vybraneho projektu.');
    }
  }
};

const mapBudgetSnapshot = (
  packageRows: Array<Parameters<typeof mapBudgetPackage>[0]>,
  packageEventRows: Array<{ budget_package_id: string; event_id: string }>,
  itemRows: Array<Parameters<typeof mapBudgetItem>[0]>,
  projectRows: Array<{ id: string; job_number: string }>,
  eventRows: Array<{ id: string }>,
): Pick<AppDataSnapshot, 'budgetPackages' | 'budgetItems'> => {
  const projectJobNumberByUuid = new Map(projectRows.map((row) => [row.id, row.job_number]));
  const eventIdByUuid = new Map(eventRows.map((row, index) => [row.id, index + 1]));
  const packageIdByUuid = new Map(packageRows.map((row, index) => [row.id, index + 1]));
  const eventIdsByPackageUuid = new Map<string, number[]>();

  for (const row of packageEventRows) {
    const eventId = eventIdByUuid.get(row.event_id);
    if (!eventId) {
      continue;
    }
    const current = eventIdsByPackageUuid.get(row.budget_package_id) ?? [];
    current.push(eventId);
    eventIdsByPackageUuid.set(row.budget_package_id, current);
  }

  return {
    budgetPackages: packageRows.map((row) => mapBudgetPackage(row, {
      localId: packageIdByUuid.get(row.id) ?? Number.NaN,
      projectJobNumber: projectJobNumberByUuid.get(row.project_id) ?? row.project_id,
      eventIds: eventIdsByPackageUuid.get(row.id) ?? [],
    })),
    budgetItems: itemRows.map((row, index) => mapBudgetItem(row, {
      localId: index + 1,
      projectJobNumber: projectJobNumberByUuid.get(row.project_id) ?? row.project_id,
      budgetPackageId: row.budget_package_id ? (packageIdByUuid.get(row.budget_package_id) ?? null) : null,
      eventId: row.event_id ? (eventIdByUuid.get(row.event_id) ?? null) : null,
    })),
  };
};

export const fetchBudgetsSnapshot = async (): Promise<Pick<AppDataSnapshot, 'budgetPackages' | 'budgetItems'>> => {
  if (!canUseSupabase() || !supabase) {
    const snapshot = getLocalAppState();
    return {
      budgetPackages: snapshot.budgetPackages ?? [],
      budgetItems: snapshot.budgetItems ?? [],
    };
  }

  const [
    packagesResult,
    packageEventsResult,
    itemsResult,
    projectsResult,
    eventsResult,
  ] = await Promise.all([
    supabase.from('budget_packages').select('*').order('created_at'),
    supabase.from('budget_package_events').select('*').order('created_at'),
    supabase.from('budget_items').select('*').order('created_at'),
    supabase.from('projects').select('id, job_number').order('job_number'),
    supabase.from('events').select('id').order('date_from').order('name'),
  ]);

  const firstError = packagesResult.error
    ?? packageEventsResult.error
    ?? itemsResult.error
    ?? projectsResult.error
    ?? eventsResult.error;
  if (firstError) {
    throw new Error(firstError.message);
  }

  return mapBudgetSnapshot(
    packagesResult.data ?? [],
    packageEventsResult.data ?? [],
    itemsResult.data ?? [],
    projectsResult.data ?? [],
    eventsResult.data ?? [],
  );
};

let budgetsHydrationPromise: Promise<void> | null = null;
let budgetsLoaded = false;

const hydrateBudgetsFromSupabase = async (): Promise<void> => {
  const budgetsSnapshot = await fetchBudgetsSnapshot();

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    ...budgetsSnapshot,
  }));
};

const ensureSupabaseBudgetsLoaded = (): void => {
  if (!canUseSupabase() || budgetsLoaded || budgetsHydrationPromise) {
    return;
  }

  budgetsHydrationPromise = hydrateBudgetsFromSupabase()
    .then(() => {
      budgetsLoaded = true;
    })
    .catch((error) => {
      console.warn('Nepodarilo se nacist rozpocty ze Supabase, zustavam na lokalnich datech.', error);
    })
    .finally(() => {
      budgetsHydrationPromise = null;
    });
};

const persistBudgetPackageToSupabase = async (budgetPackage: BudgetPackage): Promise<string | undefined> => {
  if (!supabase) {
    return budgetPackage.supabaseId;
  }

  const snapshot = getLocalAppState();
  const projectId = getProjectSupabaseId(budgetPackage.projectId, snapshot);
  const eventIds = budgetPackage.eventIds
    .map((eventId) => getEventForSupabaseWrite(eventId, budgetPackage.projectId, snapshot).supabaseId)
    .filter((eventId): eventId is string => Boolean(eventId));
  const payload = {
    project_id: projectId,
    name: budgetPackage.name,
    note: budgetPackage.note || null,
  };
  let supabaseId = budgetPackage.supabaseId;

  if (supabaseId) {
    const updateResult = await supabase
      .from('budget_packages')
      .update(payload)
      .eq('id', supabaseId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }
  } else {
    const insertResult = await supabase
      .from('budget_packages')
      .insert(payload)
      .select('id')
      .single();

    if (insertResult.error) {
      throw new Error(insertResult.error.message);
    }

    supabaseId = insertResult.data?.id ?? supabaseId;
  }

  if (!supabaseId) {
    return supabaseId;
  }

  const saveLinksResult = await supabase.rpc('save_budget_package_events', {
    p_budget_package_id: supabaseId,
    p_event_ids: eventIds,
  });

  if (saveLinksResult.error) {
    throw new Error(saveLinksResult.error.message);
  }

  return supabaseId;
};

const persistBudgetItemToSupabase = async (budgetItem: BudgetItem): Promise<string | undefined> => {
  if (!supabase) {
    return budgetItem.supabaseId;
  }

  const snapshot = getLocalAppState();
  const budgetPackage = budgetItem.budgetPackageId
    ? getBudgetPackageForSupabaseWrite(budgetItem.budgetPackageId, budgetItem.projectId, snapshot)
    : null;
  const event = budgetItem.eventId
    ? getEventForSupabaseWrite(budgetItem.eventId, budgetItem.projectId, snapshot)
    : null;
  const payload = {
    project_id: getProjectSupabaseId(budgetItem.projectId, snapshot),
    budget_package_id: budgetPackage?.supabaseId ?? null,
    event_id: event?.supabaseId ?? null,
    section: budgetItem.section,
    name: budgetItem.name,
    units: budgetItem.units,
    amount: budgetItem.amount,
    quantity: budgetItem.quantity,
    unit_price: budgetItem.unitPrice,
    note: budgetItem.note || null,
  };
  let supabaseId = budgetItem.supabaseId;

  if (supabaseId) {
    const updateResult = await supabase
      .from('budget_items')
      .update(payload)
      .eq('id', supabaseId);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }
  } else {
    const insertResult = await supabase
      .from('budget_items')
      .insert(payload)
      .select('id')
      .single();

    if (insertResult.error) {
      throw new Error(insertResult.error.message);
    }

    supabaseId = insertResult.data?.id ?? supabaseId;
  }

  return supabaseId;
};

const invoiceMatchesProject = (invoice: AppDataSnapshot['invoices'][number], projectId: string): boolean => (
  normalizeProjectId(invoice.job) === projectId
  || (invoice.jobNumbers ?? []).some((jobNumber) => normalizeProjectId(jobNumber) === projectId)
);

const invoiceMatchesAnyEvent = (invoice: AppDataSnapshot['invoices'][number], linkedEventIds: Set<number>): boolean => (
  linkedEventIds.has(invoice.eid)
  || (invoice.eventIds ?? []).some((eventId) => linkedEventIds.has(eventId))
);

const getProjectInvoicesActual = (snapshot: AppDataSnapshot, projectId: string): number => sum(
  (snapshot.invoices ?? [])
    .filter((invoice) => invoiceMatchesProject(invoice, projectId) && invoice.status !== 'draft')
    .map((invoice) => normalizeNumber(invoice.total)),
);

const getProjectReceiptsActual = (snapshot: AppDataSnapshot, projectId: string): number => sum(
  (snapshot.receipts ?? [])
    .filter((receipt) => (
      normalizeProjectId(receipt.job) === projectId
      && receipt.status !== 'draft'
      && receipt.status !== 'rejected'
    ))
    .map((receipt) => normalizeNumber(receipt.amount)),
);

const getPackageActual = (snapshot: AppDataSnapshot, projectId: string, eventIds: number[]): number => {
  const linkedEventIds = new Set(eventIds);

  const invoiceActual = (snapshot.invoices ?? [])
    .filter((invoice) => (
      invoiceMatchesProject(invoice, projectId)
      && invoice.status !== 'draft'
      && invoiceMatchesAnyEvent(invoice, linkedEventIds)
    ))
    .map((invoice) => normalizeNumber(invoice.total));

  const receiptActual = (snapshot.receipts ?? [])
    .filter((receipt) => (
      normalizeProjectId(receipt.job) === projectId
      && receipt.status !== 'draft'
      && receipt.status !== 'rejected'
      && linkedEventIds.has(receipt.eid)
    ))
    .map((receipt) => normalizeNumber(receipt.amount));

  return sum([...invoiceActual, ...receiptActual]);
};

export const getBudgetItemTotal = (item: Pick<BudgetItem, 'amount' | 'quantity' | 'unitPrice'>): number => (
  roundToCents(normalizeNumber(item.amount) * normalizeNumber(item.quantity) * normalizeNumber(item.unitPrice))
);

export const getProjectBudgetOverview = (projectId: string): ProjectBudgetOverview => {
  ensureSupabaseBudgetsLoaded();

  const normalizedProjectId = normalizeProjectId(projectId);
  const snapshot = getLocalAppState();

  const projectPackages = (snapshot.budgetPackages ?? [])
    .filter((budgetPackage) => normalizeProjectId(budgetPackage.projectId) === normalizedProjectId);
  const projectItems = (snapshot.budgetItems ?? [])
    .filter((budgetItem) => normalizeProjectId(budgetItem.projectId) === normalizedProjectId);

  const packages = projectPackages.map((budgetPackage): BudgetPackageOverview => {
    const items = projectItems.filter((budgetItem) => budgetItem.budgetPackageId === budgetPackage.id);
    const linkedEvents = (snapshot.events ?? [])
      .filter((event) => budgetPackage.eventIds.includes(event.id));
    const plannedTotal = sum(items.map(getBudgetItemTotal));
    const actualTotal = getPackageActual(snapshot, normalizedProjectId, budgetPackage.eventIds);

    return {
      ...budgetPackage,
      items,
      linkedEvents,
      plannedTotal,
      actualTotal,
      variance: roundToCents(plannedTotal - actualTotal),
    };
  });

  const plannedTotal = sum(projectItems.map(getBudgetItemTotal));
  const actualTotal = sum([
    getProjectInvoicesActual(snapshot, normalizedProjectId),
    getProjectReceiptsActual(snapshot, normalizedProjectId),
  ]);

  return {
    projectId: normalizedProjectId,
    packages,
    plannedTotal,
    actualTotal,
    variance: roundToCents(plannedTotal - actualTotal),
  };
};

export const createEmptyBudgetPackage = (projectId = ''): BudgetPackage => ({
  id: getNextId(getLocalAppState().budgetPackages ?? []),
  projectId: normalizeProjectId(projectId),
  name: '',
  note: '',
  eventIds: [],
  createdAt: today(),
});

export const createEmptyBudgetItem = (
  projectId = '',
  budgetPackageId: number | null = null,
): BudgetItem => ({
  id: getNextId(getLocalAppState().budgetItems ?? []),
  projectId: normalizeProjectId(projectId),
  budgetPackageId,
  eventId: null,
  section: '',
  name: '',
  units: '',
  amount: 0,
  quantity: 0,
  unitPrice: 0,
  note: '',
  createdAt: today(),
});

export const saveBudgetPackage = async (draft: BudgetPackageDraft): Promise<BudgetPackage> => {
  const snapshot = getLocalAppState();
  const existingPackages = snapshot.budgetPackages ?? [];
  let normalizedPackage = normalizePackage(draft, existingPackages);
  assertBudgetPackageProjectUnchanged(normalizedPackage, existingPackages);
  assertBudgetPackageEventsBelongToProject(normalizedPackage, snapshot.events ?? []);

  if (canUseSupabase()) {
    const supabaseId = await persistBudgetPackageToSupabase(normalizedPackage);
    normalizedPackage = {
      ...normalizedPackage,
      supabaseId,
    };
  }

  updateLocalAppState((snapshot) => {
    const existingPackages = snapshot.budgetPackages ?? [];
    const exists = existingPackages.some((budgetPackage) => budgetPackage.id === normalizedPackage.id);

    return {
      ...snapshot,
      budgetPackages: exists
        ? existingPackages.map((budgetPackage) => (
            budgetPackage.id === normalizedPackage.id ? normalizedPackage : budgetPackage
          ))
        : [...existingPackages, normalizedPackage],
    };
  });

  return normalizedPackage;
};

export const saveBudgetItem = async (draft: BudgetItemDraft): Promise<BudgetItem> => {
  const snapshot = getLocalAppState();
  let normalizedItem = normalizeItem(draft, snapshot.budgetItems ?? []);
  assertBudgetItemLinksBelongToProject(normalizedItem, snapshot);

  if (canUseSupabase()) {
    const supabaseId = await persistBudgetItemToSupabase(normalizedItem);
    normalizedItem = {
      ...normalizedItem,
      supabaseId,
    };
  }

  updateLocalAppState((snapshot) => {
    const existingItems = snapshot.budgetItems ?? [];
    const exists = existingItems.some((budgetItem) => budgetItem.id === normalizedItem.id);

    return {
      ...snapshot,
      budgetItems: exists
        ? existingItems.map((budgetItem) => (
            budgetItem.id === normalizedItem.id ? normalizedItem : budgetItem
          ))
        : [...existingItems, normalizedItem],
    };
  });

  return normalizedItem;
};

export const deleteBudgetPackage = async (id: number): Promise<{ id: number }> => {
  if (canUseSupabase() && supabase) {
    const supabaseId = getLocalAppState().budgetPackages.find((budgetPackage) => budgetPackage.id === id)?.supabaseId;
    if (supabaseId) {
      const deleteResult = await supabase
        .from('budget_packages')
        .delete()
        .eq('id', supabaseId);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }
    }
  }

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    budgetPackages: (snapshot.budgetPackages ?? []).filter((budgetPackage) => budgetPackage.id !== id),
    budgetItems: (snapshot.budgetItems ?? []).map((budgetItem) => (
      budgetItem.budgetPackageId === id ? { ...budgetItem, budgetPackageId: null } : budgetItem
    )),
  }));

  return { id };
};

export const deleteBudgetItem = async (id: number): Promise<{ id: number }> => {
  if (canUseSupabase() && supabase) {
    const supabaseId = getLocalAppState().budgetItems.find((budgetItem) => budgetItem.id === id)?.supabaseId;
    if (supabaseId) {
      const deleteResult = await supabase
        .from('budget_items')
        .delete()
        .eq('id', supabaseId);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }
    }
  }

  updateLocalAppState((snapshot) => ({
    ...snapshot,
    budgetItems: (snapshot.budgetItems ?? []).filter((budgetItem) => budgetItem.id !== id),
  }));

  return { id };
};

export const getBudgetDependencies = (): BudgetDependencies => {
  ensureSupabaseBudgetsLoaded();

  const snapshot = getLocalAppState();

  return {
    projects: snapshot.projects ?? [],
    events: snapshot.events ?? [],
    budgetPackages: snapshot.budgetPackages ?? [],
    budgetItems: snapshot.budgetItems ?? [],
  };
};

export const subscribeToBudgetChanges = (listener: () => void): (() => void) => (
  subscribeToLocalAppState(() => listener())
);

export const resetSupabaseBudgetsHydration = (): void => {
  budgetsHydrationPromise = null;
  budgetsLoaded = false;
};
