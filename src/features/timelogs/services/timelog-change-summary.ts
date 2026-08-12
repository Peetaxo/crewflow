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
  [...days].map(normalizeDay).sort((a, b) => getDaySortKey(a).localeCompare(getDaySortKey(b)))
);

const getDaySignature = (day: TimelogDay): string => JSON.stringify([
  day.d,
  day.f,
  day.t,
  day.type,
  formatMeals(day),
  (day.note ?? '').trim(),
]);

const getDaySortKey = (day: TimelogDay): string => getDaySignature(day);

const splitExactMatches = (
  beforeDays: TimelogDay[],
  afterDays: TimelogDay[],
): { beforeRemaining: TimelogDay[]; afterRemaining: TimelogDay[] } => {
  const afterRemaining = [...afterDays];
  const beforeRemaining: TimelogDay[] = [];

  beforeDays.forEach((before) => {
    const matchingAfterIndex = afterRemaining.findIndex((after) => getDaySignature(after) === getDaySignature(before));

    if (matchingAfterIndex >= 0) {
      afterRemaining.splice(matchingAfterIndex, 1);
      return;
    }

    beforeRemaining.push(before);
  });

  return { beforeRemaining, afterRemaining };
};

const getSameDateEditScore = (before: TimelogDay, after: TimelogDay): number => {
  let score = 0;

  if (before.f !== after.f || before.t !== after.t) score += 1;
  if (before.type !== after.type) score += 1;
  if (formatMeals(before) !== formatMeals(after)) score += 1;
  if ((before.note ?? '').trim() !== (after.note ?? '').trim()) score += 1;

  return score;
};

const splitSameIdEdits = (
  beforeDays: TimelogDay[],
  afterDays: TimelogDay[],
): { pairs: Array<{ before: TimelogDay; after: TimelogDay }>; beforeRemaining: TimelogDay[]; afterRemaining: TimelogDay[] } => {
  const afterRemaining = [...afterDays];
  const beforeRemaining: TimelogDay[] = [];
  const pairs: Array<{ before: TimelogDay; after: TimelogDay }> = [];

  beforeDays.forEach((before) => {
    if (!before.id) {
      beforeRemaining.push(before);
      return;
    }

    const matchingAfterIndex = afterRemaining.findIndex((after) => after.id === before.id);

    if (matchingAfterIndex < 0) {
      beforeRemaining.push(before);
      return;
    }

    const [after] = afterRemaining.splice(matchingAfterIndex, 1);
    pairs.push({ before, after });
  });

  return { pairs, beforeRemaining, afterRemaining };
};

const splitSameDateEdits = (
  beforeDays: TimelogDay[],
  afterDays: TimelogDay[],
): { pairs: Array<{ before: TimelogDay; after: TimelogDay }>; beforeRemaining: TimelogDay[]; afterRemaining: TimelogDay[] } => {
  const afterRemaining = [...afterDays];
  const beforeRemaining: TimelogDay[] = [];
  const pairs: Array<{ before: TimelogDay; after: TimelogDay }> = [];

  beforeDays.forEach((before) => {
    const candidates = afterRemaining
      .map((after, index) => ({ after, index, score: getSameDateEditScore(before, after) }))
      .filter((candidate) => candidate.after.d === before.d)
      .sort((a, b) => a.score - b.score || getDaySortKey(a.after).localeCompare(getDaySortKey(b.after)));
    const match = candidates[0];

    if (!match) {
      beforeRemaining.push(before);
      return;
    }

    pairs.push({ before, after: match.after });
    afterRemaining.splice(match.index, 1);
  });

  return { pairs, beforeRemaining, afterRemaining };
};

const collectDayChanges = (before: TimelogDay, after: TimelogDay): string[] => {
  const changes: string[] = [];

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

  return changes;
};

export const buildTimelogChangeSummary = (timelog: Timelog): string[] => {
  const snapshot = timelog.crewConfirmationSnapshot;
  if (!snapshot) return [];

  const beforeDays = sortDays(snapshot.before.days);
  const afterDays = sortDays(timelog.days);
  const changes: string[] = [];
  const sameIdSplit = splitSameIdEdits(beforeDays, afterDays);
  const exactSplit = splitExactMatches(sameIdSplit.beforeRemaining, sameIdSplit.afterRemaining);
  const sameDateSplit = splitSameDateEdits(exactSplit.beforeRemaining, exactSplit.afterRemaining);

  sameIdSplit.pairs.forEach(({ before, after }) => {
    changes.push(...collectDayChanges(before, after));
  });

  sameDateSplit.pairs.forEach(({ before, after }) => {
    changes.push(...collectDayChanges(before, after));
  });

  sameDateSplit.afterRemaining.forEach((after) => {
    changes.push(`Přidán den ${formatRange(after)}`);
  });

  sameDateSplit.beforeRemaining.forEach((before) => {
    changes.push(`Odebrán den ${formatRange(before)}`);
  });

  if (snapshot.before.km !== timelog.km) {
    changes.push(`Cestovné ${snapshot.before.km} km -> ${timelog.km} km`);
  }

  if ((snapshot.before.note ?? '').trim() !== (timelog.note ?? '').trim()) {
    changes.push('Poznámka k výkazu upravena');
  }

  return changes.length > 0 ? changes : ['CH výkaz zkontroloval bez změny hodin.'];
};
