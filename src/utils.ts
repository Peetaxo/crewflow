/**
 * Formátuje datum do krátkého českého formátu (den. měsíc.)
 * @example formatShortDate('2025-04-14') → '14. 4.'
 */
export function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
}
/** Alias pro zpětnou kompatibilitu */
export const fd = formatShortDate;

/**
 * Formátuje rozsah dat do čitelného formátu
 * @example formatDateRange('2025-04-14', '2025-04-15') → '14. 4. – 15. 4. 2025'
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const sd = new Date(startDate);
  const ed = new Date(endDate);
  if (startDate === endDate) return formatShortDate(startDate) + '. ' + sd.getFullYear();
  return `${sd.getDate()}. ${sd.getMonth() + 1}. – ${ed.getDate()}. ${ed.getMonth() + 1}. ${ed.getFullYear()}`;
}
export const fdr = formatDateRange;

/**
 * Vrátí pole dat (YYYY-MM-DD) mezi dvěma daty včetně
 */
export function getDatesBetween(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    days.push(new Date(cur).toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}
export const getDays = getDatesBetween;

/**
 * Formátuje částku v Kč (česky)
 * @example formatCurrency(2500) → '2 500 Kč'
 */
export function formatCurrency(amount: number): string {
  return Math.round(amount).toLocaleString('cs-CZ') + ' Kč';
}
export const fc = formatCurrency;

/**
 * Spočítá hodiny jednoho dne z času od–do
 * Podporuje přechod přes půlnoc (např. 22:00 – 06:00 = 8h)
 */
export function calculateDayHours(from: string, to: string): number {
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  let minutes = (th * 60 + tm) - (fh * 60 + fm);
  if (minutes < 0) minutes += 1440; // přechod přes půlnoc
  return minutes / 60;
}
export const calcDayH = calculateDayHours;

/**
 * Spočítá celkové hodiny ze seznamu dnů
 */
export function calculateTotalHours(days: { f: string; t: string }[]): number {
  return days.reduce((sum, day) => sum + calculateDayHours(day.f, day.t), 0);
}
export const calcH = calculateTotalHours;

/**
 * Vrátí odpočet do vypršení 72h lhůty pro rozporování faktury
 * @returns null pokud sentAt je null, jinak objekt s textem a příznakem vypršení
 */
export function getCountdown(sentAt: string | null): { text: string; exp: boolean } | null {
  if (!sentAt) return null;
  const remaining = new Date(sentAt).getTime() + 72 * 3600000 - Date.now();
  if (remaining <= 0) return { text: 'Lhůta vypršela', exp: true };
  return {
    text: `${Math.floor(remaining / 3600000)}h ${Math.floor((remaining % 3600000) / 60000)}m`,
    exp: false
  };
}
export const countdown = getCountdown;
