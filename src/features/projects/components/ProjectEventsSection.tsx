import React, { useId, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, Plus, Search, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import { Input } from '../../../components/ui/input';
import type { Event } from '../../../types';
import { ProjectQueryMessage, type ProjectQueryState } from './ProjectDocuments';
import ProjectEvents from './ProjectEvents';

type Props = {
  events: Event[];
  query: ProjectQueryState & { data: Event[] | undefined };
  canManage: boolean;
  onCreate: () => void;
  onOpen: (id: string | number) => void;
};

const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs').trim();

const ProjectEventsSection = ({ events, query, canManage, onCreate, onOpen }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const headingId = `${id}-title`;
  const countId = `${id}-count`;
  const contentId = `${id}-content`;
  const searchId = `${id}-search`;
  const isPending = query.isPending || query.data === undefined;
  const isReady = !isPending && !query.isError;
  const normalizedSearch = normalizeSearch(search);
  const filteredEvents = normalizedSearch ? events.filter((event) => (
    [event.name, event.city, event.address, event.contactPerson].some((value) => normalizeSearch(value ?? '').includes(normalizedSearch))
  )) : events;

  return <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
    <section className="project-overview-section" aria-labelledby={headingId}>
      <div className="project-events-header">
        <h2 id={headingId} className="project-events-title">
          <CollapsibleTrigger type="button" className="project-events-trigger" aria-controls={contentId} aria-describedby={isReady ? countId : undefined}>
            <CalendarDays className="project-events-icon" aria-hidden="true" />
            <span>Akce projektu</span>
            {isReady && <span className="project-events-count" aria-hidden="true">{events.length}</span>}
            <ChevronDown className="project-events-chevron" aria-hidden="true" />
          </CollapsibleTrigger>
        </h2>
        {isReady && <span id={countId} className="sr-only">Celkem akcí: {events.length}</span>}
        {canManage && <Button type="button" size="icon" aria-label="Nová akce projektu" title="Nová akce projektu" className="h-9 w-9 shrink-0" onClick={onCreate}><Plus aria-hidden="true" /></Button>}
      </div>
      <ProjectQueryMessage query={{ ...query, isPending }} loadingLabel="Načítání akcí" />
      <CollapsibleContent id={contentId}>
        {isReady && <div className="project-events-content">
          <div className="project-events-search">
            <label htmlFor={searchId} className="sr-only">Vyhledat akce projektu</label>
            <Search aria-hidden="true" />
            <Input ref={searchInput} id={searchId} value={search} placeholder="Název, místo nebo kontakt" onChange={(event) => setSearch(event.target.value)} />
            {search && <Button type="button" variant="ghost" size="icon" aria-label="Vymazat hledání akcí" title="Vymazat hledání akcí" onClick={() => { setSearch(''); searchInput.current?.focus(); }}><X aria-hidden="true" /></Button>}
          </div>
          <p className="project-events-results" role="status" aria-live="polite" aria-atomic="true">Zobrazeno {filteredEvents.length} z {events.length} akcí</p>
          {!events.length ? <p className="project-events-empty">Projekt zatím nemá žádné akce.</p>
            : filteredEvents.length ? <ProjectEvents events={filteredEvents} onOpen={onOpen} />
              : <p className="project-events-empty">Žádná akce neodpovídá hledání.</p>}
        </div>}
      </CollapsibleContent>
    </section>
  </Collapsible>;
};

export default ProjectEventsSection;
