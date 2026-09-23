import type { Timelog } from '../../../types';
import { parseTimeToMinutes } from '../../../utils';

export const assertTimelogComplete = (timelog: Pick<Timelog, 'days'>): void => {
  if (timelog.days.length === 0) throw new Error('Doplňte alespoň jeden záznam hodin.');
  timelog.days.forEach((day, index) => {
    const from = parseTimeToMinutes(day.f);
    const to = parseTimeToMinutes(day.t);
    if (from === null || to === null || from === to) {
      throw new Error(`Doplňte platný čas od a do: ${day.d}, záznam ${index + 1}.`);
    }
  });
};
