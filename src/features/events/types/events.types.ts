import { Event, Timelog } from '../../../types';

export type EventFilter = 'upcoming' | 'past' | 'all';

export type EventWithDerivedStatus = Event & {
  derivedStatus: 'upcoming' | 'full' | 'past';
};

export interface EventConflictDetail {
  eventName: string;
  eventJob: string;
  startDate?: string;
  endDate?: string;
}

export interface EventAssignmentResult {
  event: Event;
  timelog: Timelog;
}
