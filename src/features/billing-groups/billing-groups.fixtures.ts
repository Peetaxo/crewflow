import type { Event } from '../../types';

export const billingEvents: Event[] = [
  {
    id: 1,
    name: 'Nakládka',
    job: 'A',
    projectId: 'pa',
    startDate: '2026-09-03',
    endDate: '2026-09-03',
    city: 'Praha',
    needed: 2,
    filled: 1,
    status: 'upcoming',
    client: 'Klient',
  },
  {
    id: 2,
    name: 'Instal',
    job: 'B',
    projectId: 'pb',
    startDate: '2026-09-04',
    endDate: '2026-09-04',
    city: 'Praha',
    needed: 2,
    filled: 1,
    status: 'planning',
    client: 'Klient',
  },
];
