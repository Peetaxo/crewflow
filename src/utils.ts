import { Event } from './types';

/**
 * Formatuje datum do krátkého českého formátu (den. měsíc.)
 * @example formatShortDate('2025-04-14') -> '14. 4.'
 */
export function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
}
/** Alias pro zpětnou kompatibilitu */
export const fd = formatShortDate;

/**
 * Formatuje rozsah dat do citelneho formatu
 * @example formatDateRange('2025-04-14', '2025-04-15') -> '14. 4. - 15. 4. 2025'
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const sd = new Date(startDate);
  const ed = new Date(endDate);
  if (startDate === endDate) return `${formatShortDate(startDate)}. ${sd.getFullYear()}`;
  return `${sd.getDate()}. ${sd.getMonth() + 1}. - ${ed.getDate()}. ${ed.getMonth() + 1}. ${ed.getFullYear()}`;
}
export const fdr = formatDateRange;

/**
 * Vrati pole dat (YYYY-MM-DD) mezi dvema daty vcetne.
 */
export function getDatesBetween(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    days.push(new Date(cur).toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
export const getDays = getDatesBetween;

/**
 * Formatuje castku v Kc (cesky).
 * @example formatCurrency(2500) -> '2 500 Kc'
 */
export function formatCurrency(amount: number): string {
  return `${Math.round(amount).toLocaleString('cs-CZ')} Kc`;
}
export const fc = formatCurrency;

/**
 * Spocita hodiny jednoho dne z casu od-do.
 * Podporuje prechod pres pulnoc (napr. 22:00 - 06:00 = 8h).
 */
const parseTimeToMinutes = (time: string): number | null => {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
};

export function isOvernightTimeRange(from: string, to: string): boolean {
  const fromMinutes = parseTimeToMinutes(from);
  const toMinutes = parseTimeToMinutes(to);
  if (fromMinutes === null || toMinutes === null) return false;

  return toMinutes < fromMinutes;
}

export function calculateDayHours(from: string, to: string): number {
  const fromMinutes = parseTimeToMinutes(from) ?? 0;
  const toMinutes = parseTimeToMinutes(to) ?? 0;
  let minutes = toMinutes - fromMinutes;
  if (minutes < 0) minutes += 1440;
  return minutes / 60;
}
export const calcDayH = calculateDayHours;

/**
 * Spocita celkove hodiny ze seznamu dnu.
 */
export function calculateTotalHours(days: { f: string; t: string }[]): number {
  return days.reduce((sum, day) => sum + calculateDayHours(day.f, day.t), 0);
}
export const calcH = calculateTotalHours;

/**
 * Vrátí odpočet do vypršení 72h lhůty pro rozporování faktury.
 */
export function getCountdown(sentAt: string | null): { text: string; exp: boolean } | null {
  if (!sentAt) return null;
  const remaining = new Date(sentAt).getTime() + 72 * 3600000 - Date.now();
  if (remaining <= 0) return { text: 'Lhuta vyprsela', exp: true };
  return {
    text: `${Math.floor(remaining / 3600000)}h ${Math.floor((remaining % 3600000) / 60000)}m`,
    exp: false,
  };
}
export const countdown = getCountdown;

/**
 * Odvodi provozni stav akce z data a obsazenosti.
 */
export function getEventStatus(event: Pick<Event, 'endDate' | 'filled' | 'needed'>): 'upcoming' | 'full' | 'past' {
  const today = new Date().toISOString().split('T')[0];

  if (event.endDate < today) return 'past';
  if (event.filled >= event.needed) return 'full';
  return 'upcoming';
}

/**
 * Vrati true, pokud akce zasahuje do konkretniho dne.
 */
export function eventOccursOnDate(event: Pick<Event, 'startDate' | 'endDate'>, date: string): boolean {
  return event.startDate <= date && event.endDate >= date;
}
