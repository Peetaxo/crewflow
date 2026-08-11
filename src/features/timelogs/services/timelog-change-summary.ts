import type { Timelog, TimelogDay, TimelogMeal, TimelogType } from '../../../types';
import { normalizeMealSelection } from '../../../utils';

const phaseLabels: Record<TimelogType, string> = {
  pripravy: 'Přípravy',
  instal: 'Instal',
  provoz: 'Provoz',
  deinstal: 'Deinstal',
};

const mealLabels: Record<TimelogMeal, string> = {
  obed: 'oběd',
  vecere: 'večeře',
};

const formatDate = (date: string): string => {
  const [, month, day] = date.split('-').map(Number);
  return `${day}. ${month}.`;
};

const formatTimeRange = (from: string, to: string): string => `${from}–${to}`;

const formatRange = (day: TimelogDay): string => `${formatDate(day.d)} ${formatTimeRange(day.f, day.t)}`;

const formatMeals = (day: TimelogDay): string => {
  const meals = normalizeMealSelection(day);
  return meals.length > 0 ? meals.map((meal) => mealLabels[meal]).join(', ') : 'bez jídla';
};

const normalizeDay = (day: TimelogDay): TimelogDay => {
  const meals = normalizeMealSelection(day);

  return {
    ...day,
    meals,
    meal: meals[0] ?? null,
    note: day.note ?? '',
  };
};

const sortDays = (days: TimelogDay[]): TimelogDay[] => (
  [...days].map(normalizeDay).sort((a, b) => (
    `${a.d}${a.f}${a.t}${a.type}${formatMeals(a)}${a.note ?? ''}`
      .localeCompare(`${b.d}${b.f}${b.t}${b.type}${formatMeals(b)}${b.note ?? ''}`)
  ))
);

export const buildTimelogChangeSummary = (timelog: Timelog): string[] => {
  const snapshot = timelog.crewConfirmationSnapshot;
  if (!snapshot) return [];

  const beforeDays = sortDays(snapshot.before.days);
  const afterDays = sortDays(timelog.days);
  const changes: string[] = [];
  const maxDayCount = Math.max(beforeDays.length, afterDays.length);

  for (let index = 0; index < maxDayCount; index += 1) {
    const before = beforeDays[index];
    const after = afterDays[index];

    if (before && after) {
      if (before.d !== after.d) {
        changes.push(`${formatRange(before)} -> ${formatRange(after)}`);
      } else if (before.f !== after.f || before.t !== after.t) {
        changes.push(`${formatDate(after.d)} Čas ${formatTimeRange(before.f, before.t)} -> ${formatTimeRange(after.f, after.t)}`);
      }

      if (before.type !== after.type) {
        changes.push(`${formatDate(after.d)} Fáze ${phaseLabels[before.type]} -> ${phaseLabels[after.type]}`);
      }

      if (formatMeals(before) !== formatMeals(after)) {
        changes.push(`${formatDate(after.d)} Jídlo ${formatMeals(before)} -> ${formatMeals(after)}`);
      }

      if ((before.note ?? '').trim() !== (after.note ?? '').trim()) {
        changes.push(`${formatDate(after.d)} poznámka u dne upravena`);
      }
    } else if (after) {
      changes.push(`Přidán den ${formatRange(after)}`);
    } else if (before) {
      changes.push(`Odebrán den ${formatRange(before)}`);
    }
  }

  if (snapshot.before.km !== timelog.km) {
    changes.push(`Cestovné ${snapshot.before.km} km -> ${timelog.km} km`);
  }

  if ((snapshot.before.note ?? '').trim() !== (timelog.note ?? '').trim()) {
    changes.push('Poznámka k výkazu upravena');
  }

  return changes.length > 0 ? changes : ['CH výkaz zkontroloval bez změny hodin.'];
};
