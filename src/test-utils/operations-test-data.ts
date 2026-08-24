import type { AppDataSnapshot } from '../lib/app-data';
import type { Event, FleetReservation, Project } from '../types';

const projects: Project[] = [
  {
    id: 'TEST001',
    name: 'Testovací projekt',
    client: 'Next Level',
    createdAt: '2026-04-01',
  },
  {
    id: 'AKV104',
    name: 'BTL Mattoni',
    client: 'Next Level',
    createdAt: '2026-04-01',
  },
  {
    id: 'BNZ003',
    name: 'Dealers meeting',
    client: 'Next Level',
    createdAt: '2026-04-01',
  },
  {
    id: 'Majáles Bratislava',
    name: 'Majáles Bratislava',
    client: 'Next Level',
    createdAt: '2026-04-01',
  },
];

const createEvent = (
  id: number,
  name: string,
  job: string,
  startDate: string,
  endDate = startDate,
): Event => ({
  id,
  projectId: job,
  name,
  job,
  startDate,
  endDate,
  city: 'Praha',
  needed: 1,
  filled: 0,
  status: 'upcoming',
  client: 'Next Level',
});

const events: Event[] = [
  createEvent(1, 'Testovací akce', 'TEST001', '2026-04-09', '2026-04-10'),
  createEvent(22, 'BTL Mattoni', 'AKV104', '2026-05-02'),
  createEvent(23, 'BTL Mattoni', 'AKV104', '2026-05-02'),
  createEvent(26, 'Dealers meeting', 'BNZ003', '2026-05-04', '2026-05-08'),
  createEvent(205, 'Majáles Bratislava', 'Majáles Bratislava', '2026-05-01', '2026-05-02'),
];

const fleetReservations: FleetReservation[] = [
  {
    id: 5,
    vehicleId: 'crafter-1',
    projectId: 'TEST001',
    eventId: 1,
    responsibleProfileId: 'profile-local-1',
    startsAt: '2026-04-09T08:00',
    endsAt: '2026-04-10T18:00',
    note: 'Historická rezervace pro test detailu.',
    hasConflict: false,
  },
  {
    id: 1,
    vehicleId: 'crafter-1',
    projectId: 'AKV104',
    eventId: 22,
    responsibleProfileId: 'profile-local-1',
    startsAt: '2026-05-02T08:00',
    endsAt: '2026-05-02T18:00',
    note: 'BTL Mattoni - materiál a instalace.',
    hasConflict: false,
  },
  {
    id: 2,
    vehicleId: 'transit-1',
    projectId: 'BNZ003',
    eventId: 26,
    responsibleProfileId: 'profile-local-22',
    startsAt: '2026-05-04T07:00',
    endsAt: '2026-05-08T20:00',
    note: 'Dealers meeting produkce.',
    hasConflict: false,
  },
  {
    id: 3,
    vehicleId: 'octavia-1',
    projectId: 'Majáles Bratislava',
    eventId: 205,
    responsibleProfileId: 'profile-local-11',
    startsAt: '2026-05-01T09:00',
    endsAt: '2026-05-02T22:00',
    note: 'Produkční cesta.',
    hasConflict: false,
  },
  {
    id: 4,
    vehicleId: 'crafter-1',
    projectId: 'AKV104',
    eventId: 23,
    responsibleProfileId: 'profile-local-7',
    startsAt: '2026-05-02T15:00',
    endsAt: '2026-05-02T21:00',
    note: 'Záměrný překryv pro test konfliktu.',
    hasConflict: true,
  },
];

export const withOperationsTestData = (snapshot: AppDataSnapshot): AppDataSnapshot => ({
  ...snapshot,
  projects,
  events,
  fleetReservations,
});
