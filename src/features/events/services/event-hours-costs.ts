import { KM_RATE } from '../../../data';

export type EventCrewCosts = Record<'work' | 'travel' | 'meals' | 'receipts', number | null>;
export const costCategories = ['work', 'travel', 'meals', 'receipts'] as const;
export const emptyCrewCosts = (): EventCrewCosts => ({ work: 0, travel: 0, meals: 0, receipts: 0 });
export const knownAmount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export function addAmounts(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return (Math.round(left * 100) + Math.round(right * 100)) / 100;
}

export function addCrewCosts(target: EventCrewCosts, source: EventCrewCosts) {
  for (const category of costCategories) target[category] = addAmounts(target[category], source[category]);
}

export function totalCrewCosts(costs: EventCrewCosts): number | null {
  return costCategories.reduce<number | null>((sum, key) => addAmounts(sum, costs[key]), 0);
}

export type CapturedCosts = {
  rate: unknown; hours: unknown; work: unknown; km: unknown; travel: unknown; meals: unknown;
};

export function priceApprovedLog(minutes: number, mealAllowance: number, km: number | null, profileRate: number | null, captured?: CapturedCosts | null) {
  if (captured) {
    const rate = knownAmount(captured.rate);
    const hours = knownAmount(captured.hours);
    const sameHours = hours !== null && Math.round(hours * 60) === minutes;
    return { rate, costs: {
      work: sameHours && rate !== null ? knownAmount(captured.work) : null,
      travel: knownAmount(captured.km) !== null ? knownAmount(captured.travel) : null,
      meals: sameHours ? knownAmount(captured.meals) : null,
      receipts: 0,
    } };
  }

  // Round each approved report to haléře before adding it to a member's total.
  const distance = knownAmount(km);
  return { rate: profileRate, costs: {
    work: profileRate === null ? null : Math.round(minutes * Math.round(profileRate * 100) / 60) / 100,
    travel: distance === null ? null : Math.round(Math.round(distance * 100) * Math.round(KM_RATE * 100) / 100) / 100,
    meals: mealAllowance,
    receipts: 0,
  } };
}
