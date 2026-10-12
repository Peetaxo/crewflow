import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { Contractor, Event, Invoice, Timelog } from '../../../types';
import { KM_RATE } from '../../../data';
import { calculateMealAllowance, calculateTotalHours } from '../../../utils';

const normalizeSearch = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs').trim();
export const filterCrewMembers = (crew: Contractor[], ...queries: string[]) => crew.filter((person) => {
  const text = normalizeSearch([person.name, person.city, person.phone, person.email].join(' '));
  const phone = person.phone.replace(/\D/g, '');
  return queries.every((query) => {
    const normalized = normalizeSearch(query);
    return !normalized || text.includes(normalized) || (/^[+\d\s()-]+$/.test(normalized) && phone.includes(normalized.replace(/\D/g, '')));
  });
});

export const getCrewOverviewStats = (timelogs: Timelog[], invoices: Invoice[]) => {
  const pending = timelogs.filter((t) => t.status === 'pending_ch' || t.status === 'pending_coo');
  return {
    paidAmount: invoices.filter((i) => i.status === 'paid').reduce((sum, i) => sum + i.total, 0),
    toPayAmount: invoices.filter((i) => i.status === 'sent').reduce((sum, i) => sum + i.total, 0),
    pendingCount: pending.length,
    pendingHours: pending.reduce((sum, t) => sum + calculateTotalHours(t.days), 0),
    correctionCount: timelogs.filter((t) => t.status === 'rejected' || t.status === 'pending_crew_confirmation').length,
    approvedHours: timelogs.filter((t) => ['approved', 'invoiced', 'paid'].includes(t.status)).reduce((sum, t) => sum + calculateTotalHours(t.days), 0),
  };
};

const pragueDayFormatter = new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' });
const pragueDay = (date: Date) => {
  const parts = pragueDayFormatter.formatToParts(date);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-');
};
export const formatCrewActivity = (timestamp: string | null | undefined, now = new Date()) => {
  if (!timestamp) return 'Zatím bez aktivity';
  const date = parseISO(timestamp);
  if (Number.isNaN(date.getTime()) || date.getTime() > now.getTime() + 60_000) return 'Aktivita nedostupná';
  const days = differenceInCalendarDays(parseISO(pragueDay(now)), parseISO(pragueDay(date)));
  if (days <= 0) return 'Dnes';
  if (days === 1) return 'Včera';
  if (days < 7) return `Před ${days} dny`;
  return format(parseISO(pragueDay(date)), 'd. M. yyyy');
};

export type CrewTimelogFilter = 'all' | 'pending' | 'corrections' | 'approved';
export const isCrewTimelogInFilter = (timelog: Timelog, filter: CrewTimelogFilter) => {
  if (filter === 'pending') return timelog.status === 'pending_ch' || timelog.status === 'pending_coo';
  if (filter === 'corrections') return ['draft', 'rejected', 'pending_crew_confirmation'].includes(timelog.status);
  if (filter === 'approved') return ['approved', 'invoiced', 'paid'].includes(timelog.status);
  return true;
};

export const findCrewTimelogEvent = (timelog: Timelog, events: Event[]) => (
  (timelog.eventSupabaseId ? events.find((e) => e.supabaseId === timelog.eventSupabaseId) : undefined)
  ?? events.find((e) => e.id === timelog.eid || e.supabaseId === String(timelog.eid))
);

export const calculateCrewTimelogEstimate = (timelog: Timelog, contractor: Contractor, event?: Event) => (
  Math.round(calculateTotalHours(timelog.days) * contractor.rate)
  + Math.round(timelog.km * KM_RATE)
  + Math.round(calculateMealAllowance(timelog.days, { enabled: Boolean(event?.mealAllowanceEnabled) }))
);
