import {
  INITIAL_CONTRACTORS,
  INITIAL_FLEET_VEHICLES,
} from '../data';
import type { Event, FleetReservation, Project } from '../types';

export const TEST_FLEET_PROJECTS: Project[] = [
  {
    id: 'AKV104',
    name: 'BTL Mattoni',
    client: 'Next Level',
    createdAt: '2026-04-28',
  },
  {
    id: 'BNZ003',
    name: 'Benzina Roadshow',
    client: 'JCHP s.r.o.',
    createdAt: '2026-04-28',
  },
  {
    id: 'TEST001',
    name: 'TEST',
    client: 'JCHP s.r.o.',
    createdAt: '2026-04-20',
  },
];

export const TEST_FLEET_EVENTS: Event[] = [
  {
    id: 1,
    projectId: 'AKV104',
    name: 'BTL Mattoni',
    job: 'AKV104',
    startDate: '2026-05-02',
    endDate: '2026-05-02',
    startTime: '08:00',
    endTime: '18:00',
    city: 'Praha',
    needed: 1,
    filled: 0,
    status: 'upcoming',
    client: 'Next Level',
  },
  {
    id: 2,
    projectId: 'BNZ003',
    name: 'Benzina Roadshow',
    job: 'BNZ003',
    startDate: '2026-05-03',
    endDate: '2026-05-04',
    startTime: '09:00',
    endTime: '18:00',
    city: 'Brno',
    needed: 1,
    filled: 0,
    status: 'upcoming',
    client: 'JCHP s.r.o.',
  },
  {
    id: 3,
    projectId: 'TEST001',
    name: 'TEST',
    job: 'TEST001',
    startDate: '2026-04-20',
    endDate: '2026-04-20',
    startTime: '08:00',
    endTime: '17:00',
    city: 'Praha',
    needed: 1,
    filled: 0,
    status: 'past',
    client: 'JCHP s.r.o.',
  },
];

export const TEST_FLEET_RESERVATIONS: FleetReservation[] = [
  {
    id: 1,
    vehicleId: 'crafter-1',
    projectId: 'AKV104',
    eventId: 1,
    responsibleProfileId: 'profile-local-1',
    startsAt: '2026-05-02T08:00',
    endsAt: '2026-05-02T18:00',
    note: 'Instalace BTL Mattoni',
    hasConflict: true,
  },
  {
    id: 2,
    vehicleId: 'transit-1',
    projectId: 'BNZ003',
    eventId: 2,
    responsibleProfileId: 'profile-local-1',
    startsAt: '2026-05-03T09:00',
    endsAt: '2026-05-04T18:00',
    note: 'Dvoudenni roadshow',
    hasConflict: false,
  },
  {
    id: 3,
    vehicleId: 'crafter-1',
    projectId: 'TEST001',
    eventId: 3,
    responsibleProfileId: 'profile-local-1',
    startsAt: '2026-04-20T08:00',
    endsAt: '2026-04-20T17:00',
    note: 'Historicka rezervace',
    hasConflict: false,
  },
];

export const TEST_FLEET_CONTRACTORS = INITIAL_CONTRACTORS.slice(0, 1);

export const TEST_FLEET_VEHICLES = INITIAL_FLEET_VEHICLES;
