import type { Timelog } from '../../../types';
import { formatShortDate } from '../../../utils';

const moneyFormatter = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
export const displayTimelogMoney = (amount: number) => moneyFormatter.format(amount);
export const displayTimelogHours = (hours: number) => `${hours.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} h`;

export function timelogPeriod(timelog: Timelog) {
  const dates = [...new Set(timelog.days.map((day) => day.d).filter(Boolean))].sort();
  if (!dates.length) return 'Termín není vyplněný';
  const last = dates[dates.length - 1];
  const range = dates.length === 1 ? formatShortDate(last) : `${formatShortDate(dates[0])} – ${formatShortDate(last)}`;
  return `${range} ${last.slice(0, 4)}`;
}

