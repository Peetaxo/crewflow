import type { Timelog } from '../../../types';

export const hasSubmittedEventHours = (log: Pick<Timelog, 'status'>) => log.status !== 'draft';
