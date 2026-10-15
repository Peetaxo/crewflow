import type { Event, Invoice, Timelog, TimelogType } from '../../../types';
import { calculateDayHours, calculateTotalHours } from '../../../utils';
import type { ProjectInvoiceRecord } from './project-summary';

export type ProjectWorkPhase = { type: TimelogType; hours: number; amount: number };
export type ProjectWorkPhases = {
  phases: ProjectWorkPhase[];
  unallocated: { hours: number; amount: number };
  hasInvoicedAllocation: boolean;
  hasUnallocatedInvoiceCosts: boolean;
};
const phaseTypes: TimelogType[] = ['pripravy', 'instal', 'provoz', 'deinstal'];
const round2 = (value: number) => Math.round(value * 100) / 100;
const normalizeJob = (job: string) => job.trim().toUpperCase();

const phaseHours = (timelog: Timelog): number[] => {
  const hours = [0, 0, 0, 0, 0];
  for (const day of timelog.days) {
    const index = phaseTypes.indexOf(day.type);
    hours[index < 0 ? 4 : index] += calculateDayHours(day.f, day.t);
  }
  return hours;
};

// Largest remainders, with stable phase order for ties, preserve each source amount to the cent.
const partitionAmount = (amount: number, weights: number[]): number[] => {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(amount) || !(total > 0) || !Number.isFinite(total)) return [0, 0, 0, 0, amount];
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) return [0, 0, 0, 0, amount];
  const shares = weights.map((weight) => Math.abs(cents) * (weight / total));
  const allocated = shares.map(Math.floor);
  const remainderOrder = shares.map((share, index) => ({ index, fraction: share - allocated[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const remainder = Math.abs(cents) - allocated.reduce((sum, part) => sum + part, 0);
  if (!Number.isInteger(remainder) || remainder < 0 || remainder > weights.length) return [0, 0, 0, 0, amount];
  for (let index = 0; index < remainder; index++) allocated[remainderOrder[index].index]++;
  return allocated.map((part) => part === 0 ? 0 : Math.sign(cents) * part / 100);
};

type Inputs = {
  timelogs: Timelog[];
  allTimelogs: Timelog[];
  allEvents: Event[];
  allInvoices: Invoice[];
  invoices: ProjectInvoiceRecord[];
  projectIds: Set<string>;
  projectId: string;
  unlinkedWork: { timelog: Timelog; amount: number }[];
  expenseEvent: (timelog: Timelog) => Event | undefined;
  linksTimelog: (invoice: Invoice, timelog: Timelog) => boolean;
};

const completeInvoiceLogs = (invoice: Invoice, inputs: Inputs): Timelog[] | null => {
  const { allTimelogs, allInvoices, allEvents, expenseEvent, linksTimelog, projectIds } = inputs;
  const uuidReferences = invoice.timelogSupabaseIds;
  const useUuids = Boolean(uuidReferences?.length);
  const references = useUuids ? uuidReferences! : invoice.timelogIds ?? [];
  if (!references.length || new Set<string | number>(references).size !== references.length || !invoice.contractorProfileId) return null;
  const linked: Timelog[] = [];
  for (const reference of references) {
    // The same authoritative link predicate as the financial selector also handles explicit empty UUID lists.
    const matches = allTimelogs.filter((log) => (useUuids ? log.supabaseId === reference : log.id === reference) && linksTimelog(invoice, log));
    if (matches.length !== 1) return null;
    const log = matches[0];
    const event = expenseEvent(log);
    const eventMatches = allEvents.filter((candidate) => log.eventSupabaseId ? candidate.supabaseId === log.eventSupabaseId : candidate.id === log.eid);
    const job = normalizeJob(event?.job ?? '');
    if (log.status === 'rejected' || log.contractorProfileId !== invoice.contractorProfileId || !job || !projectIds.has(job)
      || eventMatches.length !== 1 || allInvoices.filter((candidate) => linksTimelog(candidate, log)).length !== 1) return null;
    if (invoice.items?.length && !invoice.items.some((item) => normalizeJob(item.jobNumber) === job)) return null;
    linked.push(log);
  }
  const hours = round2(linked.reduce((sum, log) => sum + round2(calculateTotalHours(log.days)), 0));
  return typeof invoice.hours === 'number' && Number.isFinite(invoice.hours) && round2(invoice.hours) === hours ? linked : null;
};

/** Uses already selected project rows and exact financial amounts; no fetching or repricing. */
export const getProjectWorkPhases = (inputs: Inputs): ProjectWorkPhases => {
  const hours = [0, 0, 0, 0, 0];
  const amounts = [0, 0, 0, 0, 0];
  let hasInvoicedAllocation = false;
  let hasUnallocatedInvoiceCosts = false;
  const addAmount = (amount: number, weights: number[]) => {
    partitionAmount(amount, weights).forEach((part, index) => { amounts[index] = round2(amounts[index] + part); });
  };
  for (const log of inputs.timelogs) {
    if (log.status === 'rejected') continue;
    phaseHours(log).forEach((value, index) => { hours[index] += value; });
  }
  for (const { timelog, amount } of inputs.unlinkedWork) addAmount(amount, phaseHours(timelog));
  for (const { invoice, share } of inputs.invoices) {
    if (!share || share.work === 0) continue;
    const linked = completeInvoiceLogs(invoice, inputs);
    const weights = [0, 0, 0, 0, 0];
    for (const log of linked ?? []) {
      if (normalizeJob(inputs.expenseEvent(log)?.job ?? '') !== inputs.projectId) continue;
      phaseHours(log).forEach((value, index) => { weights[index] += value; });
    }
    if (!linked || !weights.some((weight) => weight > 0)) {
      amounts[4] = round2(amounts[4] + share.work);
      hasUnallocatedInvoiceCosts = true;
    } else {
      addAmount(share.work, weights);
      hasInvoicedAllocation = true;
    }
  }
  return {
    phases: phaseTypes.map((type, index) => ({ type, hours: hours[index], amount: amounts[index] })),
    unallocated: { hours: hours[4], amount: amounts[4] }, hasInvoicedAllocation, hasUnallocatedInvoiceCosts,
  };
};
