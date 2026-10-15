import { KM_RATE } from '../../../data';
import type { AppDataSnapshot } from '../../../lib/app-data';
import type { Event, Invoice, Project, ReceiptItem, Timelog } from '../../../types';
import { calculateMealAllowance, calculateTotalHours } from '../../../utils';

export type ProjectPeriod = { startDate: string; endDate: string };
export type ProjectCostBreakdown = { work: number; travel: number; meals: number; receipts: number; total: number };
export type ProjectCostStage = 'inProgress' | 'approved' | 'invoiced' | 'paid';
export type ProjectSummarySnapshot = Pick<AppDataSnapshot, 'projects' | 'events' | 'timelogs' | 'receipts' | 'contractors' | 'invoices'>;
export type ProjectInvoiceRecord = { invoice: Invoice; share: ProjectCostBreakdown | null };
export type ProjectSummary = {
  project: Project;
  period: ProjectPeriod | null;
  events: Event[];
  costs: ProjectCostBreakdown;
  stages: Record<ProjectCostStage, ProjectCostBreakdown>;
  receipts: ReceiptItem[];
  invoices: ProjectInvoiceRecord[];
  hasUnknownInvoiceAllocation: boolean;
  hasMissingRates: boolean;
};

export const getProjectPeriod = (events: readonly Event[]): ProjectPeriod | null => {
  if (events.length === 0) return null;
  return events.reduce((period, event) => ({
    startDate: event.startDate < period.startDate ? event.startDate : period.startDate,
    endDate: event.endDate > period.endDate ? event.endDate : period.endDate,
  }), { startDate: events[0].startDate, endDate: events[0].endDate });
};

export const formatProjectPeriod = (period: ProjectPeriod | null): string => {
  if (!period) return '—';
  const format = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return `${day}. ${month}. ${year}`;
  };
  return period.startDate === period.endDate
    ? format(period.startDate)
    : `${format(period.startDate)} – ${format(period.endDate)}`;
};

const emptyCosts = (): ProjectCostBreakdown => ({ work: 0, travel: 0, meals: 0, receipts: 0, total: 0 });
const roundAmount = (amount: number): number => Math.round(amount * 100) / 100;
const addCosts = (target: ProjectCostBreakdown, amount: ProjectCostBreakdown) => {
  for (const key of ['work', 'travel', 'meals', 'receipts', 'total'] as const) {
    target[key] = roundAmount(target[key] + amount[key]);
  }
};
const costs = (work = 0, travel = 0, meals = 0, receipts = 0): ProjectCostBreakdown => ({
  work: roundAmount(work), travel: roundAmount(travel), meals: roundAmount(meals), receipts: roundAmount(receipts),
  total: roundAmount(work + travel + meals + receipts),
});
const normalizeJob = (job: string): string => job.trim().toUpperCase();
const atomicJobs = (jobs: string[]): string[] => jobs.flatMap((job) => job.split(',').map(normalizeJob)).filter(Boolean);

const expenseStage = (status: Timelog['status'] | ReceiptItem['status']): ProjectCostStage => {
  if (status === 'paid' || status === 'reimbursed') return 'paid';
  if (status === 'invoiced' || status === 'attached') return 'invoiced';
  return status === 'approved' ? 'approved' : 'inProgress';
};
const invoiceStage = (invoice: Invoice): ProjectCostStage => (
  invoice.status === 'paid' ? 'paid' : invoice.status === 'sent' ? 'invoiced' : 'approved'
);

const matchesInvoiceLink = (
  expense: { id: number; supabaseId?: string },
  ids: number[] | undefined,
  supabaseIds: string[] | undefined,
): boolean => {
  // Numeric IDs are regenerated during hydration; an available UUID list is authoritative.
  if (supabaseIds !== undefined && expense.supabaseId) return supabaseIds.includes(expense.supabaseId);
  if (supabaseIds?.length) return false;
  return ids?.includes(expense.id) ?? false;
};
const linksTimelog = (invoice: Invoice, timelog: Timelog) => matchesInvoiceLink(timelog, invoice.timelogIds, invoice.timelogSupabaseIds);
const linksReceipt = (invoice: Invoice, receipt: ReceiptItem) => matchesInvoiceLink(receipt, invoice.receiptIds, invoice.receiptSupabaseIds);
const uniqueExpenses = <T extends { id: number; supabaseId?: string }>(expenses: T[]): T[] => (
  Array.from(new Map(expenses.map((expense) => [expense.supabaseId ? `uuid:${expense.supabaseId}` : `local:${expense.id}`, expense])).values())
);

const closeAmount = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.011;
const hasFiniteAmounts = (amounts: ProjectCostBreakdown): boolean => (
  (['work', 'travel', 'meals', 'receipts', 'total'] as const)
    .every((key) => typeof amounts[key] === 'number' && Number.isFinite(amounts[key]))
);
const invoiceHeaderCosts = (invoice: Invoice): ProjectCostBreakdown => ({
  work: invoice.hAmt, travel: invoice.kAmt,
  meals: invoice.mealAmt === undefined ? 0 : invoice.mealAmt,
  receipts: invoice.receiptAmt === undefined ? 0 : invoice.receiptAmt,
  total: invoice.total,
});

const getInvoiceShare = (invoice: Invoice, projectId: string, jobs: Set<string>): ProjectCostBreakdown | null => {
  const header = invoiceHeaderCosts(invoice);
  if (invoice.hasKnownAmounts === false || !hasFiniteAmounts(header)) return null;
  const items = invoice.items;
  if (!items?.length) {
    return jobs.size === 1 && jobs.has(projectId)
      && closeAmount(header.total, header.work + header.travel + header.meals + header.receipts)
      ? header : null;
  }

  const total = emptyCosts();
  const share = emptyCosts();
  const itemIds = new Set<string>();
  let hasProjectItem = false;
  for (const item of items) {
    const job = normalizeJob(item.jobNumber);
    if (!job || job.includes(',') || !item.id || itemIds.has(item.id) || !hasFiniteAmounts(item)
      || !closeAmount(item.total, item.work + item.travel + item.meals + item.receipts)) return null;
    itemIds.add(item.id);
    addCosts(total, item);
    if (job === projectId) {
      hasProjectItem = true;
      addCosts(share, item);
    }
  }
  // Reconcile every category, not just the requested job: a capped/RLS-partial snapshot is never exact.
  if (!(['work', 'travel', 'meals', 'receipts', 'total'] as const).every((key) => closeAmount(total[key], header[key]))) return null;
  return hasProjectItem ? share : null;
};

/** Pure selector over the currently authorized snapshot; it performs no loads or writes. */
export const getProjectSummary = (projectId: string, snapshot: ProjectSummarySnapshot): ProjectSummary | null => {
  const project = snapshot.projects.find((item) => item.id === projectId);
  if (!project) return null;
  const job = normalizeJob(projectId);
  const allEvents = snapshot.events ?? [];
  const eventsById = new Map(allEvents.map((event) => [event.id, event]));
  const eventsByUuid = new Map(allEvents.filter((event) => event.supabaseId).map((event) => [event.supabaseId, event]));
  const expenseEvent = (expense: { eid: number; eventSupabaseId?: string }) => (
    expense.eventSupabaseId ? eventsByUuid.get(expense.eventSupabaseId) : eventsById.get(expense.eid)
  );
  const events = allEvents.filter((event) => normalizeJob(event.job) === job)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate) || a.name.localeCompare(b.name));
  const allTimelogs = uniqueExpenses(snapshot.timelogs ?? []);
  const allReceipts = uniqueExpenses(snapshot.receipts ?? []);
  const receiptJob = (receipt: ReceiptItem) => normalizeJob(receipt.job || expenseEvent(receipt)?.job || '');
  const receipts = allReceipts.filter((receipt) => receiptJob(receipt) === job);
  const timelogs = allTimelogs.filter((timelog) => normalizeJob(expenseEvent(timelog)?.job || '') === job);
  const stages: ProjectSummary['stages'] = { inProgress: emptyCosts(), approved: emptyCosts(), invoiced: emptyCosts(), paid: emptyCosts() };

  const invoices: ProjectInvoiceRecord[] = [];
  for (const invoice of snapshot.invoices ?? []) {
    const jobs = new Set(atomicJobs([invoice.job || '', ...(invoice.jobNumbers ?? []), ...(invoice.items ?? []).map((item) => item.jobNumber)]));
    // Linked rows also reveal membership of legacy invoices without explicit job numbers.
    for (const timelog of allTimelogs) {
      if (linksTimelog(invoice, timelog)) {
        const event = expenseEvent(timelog);
        if (event?.job) jobs.add(normalizeJob(event.job));
      }
    }
    for (const receipt of allReceipts) {
      if (linksReceipt(invoice, receipt) && receiptJob(receipt)) jobs.add(receiptJob(receipt));
    }
    if (!jobs.size) {
      for (const eventId of invoice.eventIds ?? [invoice.eid]) {
        const event = eventsById.get(eventId);
        if (event?.job) jobs.add(normalizeJob(event.job));
      }
    }
    if (!jobs.has(job)) continue;
    const share = getInvoiceShare(invoice, job, jobs);
    invoices.push({ invoice, share });
    if (share) addCosts(stages[invoiceStage(invoice)], share);
  }

  let hasMissingRates = false;
  const contractorsByProfile = new Map((snapshot.contractors ?? []).map((contractor) => [contractor.profileId, contractor]));
  for (const timelog of timelogs) {
    if (timelog.status === 'rejected' || invoices.some(({ invoice }) => linksTimelog(invoice, timelog))) continue;
    const hours = calculateTotalHours(timelog.days);
    const contractor = timelog.contractorProfileId ? contractorsByProfile.get(timelog.contractorProfileId) : undefined;
    const rate = contractor?.rate;
    const hasRate = contractor?.hasKnownRate !== false && typeof rate === 'number' && Number.isFinite(rate);
    if (hours > 0 && !hasRate) hasMissingRates = true;
    addCosts(stages[expenseStage(timelog.status)], costs(
      hasRate ? hours * rate : 0,
      timelog.km * KM_RATE,
      calculateMealAllowance(timelog.days, { enabled: Boolean(expenseEvent(timelog)?.mealAllowanceEnabled) }),
    ));
  }
  for (const receipt of receipts) {
    if (receipt.status === 'rejected' || invoices.some(({ invoice }) => linksReceipt(invoice, receipt))) continue;
    addCosts(stages[expenseStage(receipt.status)], costs(0, 0, 0, receipt.amount));
  }
  const totalCosts = emptyCosts();
  Object.values(stages).forEach((stage) => addCosts(totalCosts, stage));
  return { project, period: getProjectPeriod(events), events, costs: totalCosts, stages, receipts, invoices,
    hasUnknownInvoiceAllocation: invoices.some(({ share }) => share === null), hasMissingRates };
};
