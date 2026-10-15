import React from 'react';
import { CalendarDays, ChevronRight, MapPin, Users } from 'lucide-react';
import type { Event } from '../../../types';
import { formatProjectPeriod } from '../services/project-summary';

const months = ['LED', 'ÚNO', 'BŘE', 'DUB', 'KVĚ', 'ČER', 'ČVC', 'SRP', 'ZÁŘ', 'ŘÍJ', 'LIS', 'PRO'];

const ProjectEvents = ({ events, onOpen }: { events: Event[]; onOpen: (id: string | number) => void }) => (
  <ul className="project-event-list" aria-label="Akce projektu">
    {events.map((event) => {
      const [, month, day] = event.startDate.split('-').map(Number);
      return <li key={event.supabaseId ?? event.id}>
        <button className="project-event-card" aria-label={event.name} onClick={() => onOpen(event.supabaseId ?? event.id)}>
          <span className="project-event-date" aria-hidden="true"><strong>{day || '—'}</strong><span>{months[month - 1] || '—'}</span></span>
          <span className="project-event-main">
            <strong className="project-event-name">{event.name}</strong>
            <span className="project-event-meta">
              <span><MapPin aria-hidden="true" />{event.city || event.address || '—'}</span>
              <span><CalendarDays aria-hidden="true" />{formatProjectPeriod({ startDate: event.startDate, endDate: event.endDate })}</span>
              <span><Users aria-hidden="true" /><span><span className="sr-only">Obsazení: </span>{event.filled} / {event.needed}</span></span>
            </span>
            <span className="project-event-contact">Kontaktní osoba: {event.contactPerson || '—'}</span>
          </span>
          <ChevronRight className="project-event-arrow" aria-hidden="true" />
        </button>
      </li>;
    })}
  </ul>
);
export default ProjectEvents;
