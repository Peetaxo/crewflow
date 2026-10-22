import { billingDate } from './contract';

function dateParts(value: string | null | undefined): [number, number, number] | null {
  const parsed = billingDate.safeParse(value);
  if (!parsed.success) return null;
  const [year, month, day] = parsed.data.split('-').map(Number);
  return [year, month, day];
}

// These are calendar dates: format their stored parts without a local-time conversion.
export function formatBillingDate(value: string | null | undefined): string {
  const parts = dateParts(value);
  return parts ? `${parts[2]}. ${parts[1]}. ${parts[0]}` : 'Neznámé datum';
}

export function formatBillingDateRange(from: string | null | undefined, to: string | null | undefined): string {
  const start = dateParts(from); const end = dateParts(to);
  if (!start || !end) return start || end ? `${formatBillingDate(from)} – ${formatBillingDate(to)}` : 'Neznámé datum';
  if (from === to) return formatBillingDate(from);
  if (start[0] !== end[0]) return `${formatBillingDate(from)}–${formatBillingDate(to)}`;
  if (start[1] !== end[1]) return `${start[2]}. ${start[1]}.–${formatBillingDate(to)}`;
  return `${start[2]}.–${end[2]}. ${end[1]}. ${end[0]}`;
}
