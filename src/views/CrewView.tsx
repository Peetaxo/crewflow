import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Mail, MapPin, MoreHorizontal, Pencil, Phone, Plus, Search, Star, Trash2, Users, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/useAppContext';
import CrewDetailView from './CrewDetailView';
import CrewShiftCalendarView from './CrewShiftCalendarView';
import ContractorEditModal from '../components/modals/ContractorEditModal';
import { Button } from '../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import type { Contractor } from '../types';
import { getCrew, subscribeToCrewChanges } from '../features/crew/services/crew.service';
import { filterCrewMembers, formatCrewActivity } from '../features/crew/services/crew-presentation';
import { useCrewActivity } from '../features/crew/useCrewActivity';

const AVATAR_PALETTE = [
  { bg: '#E1F5EE', fg: '#0F6E56' },
  { bg: '#EEEDFE', fg: '#534AB7' },
  { bg: '#E6F1FB', fg: '#185FA5' },
  { bg: '#FAEEDA', fg: '#854F0B' },
  { bg: '#EAF3DE', fg: '#3B6D11' },
];

const createEmptyContractor = (nextId: number): Contractor => {
  const palette = AVATAR_PALETTE[(nextId - 1) % AVATAR_PALETTE.length];

  return {
    id: nextId,
    name: '',
    ii: '',
    bg: palette.bg,
    fg: palette.fg,
    tags: [],
    events: 0,
    rate: 200,
    phone: '',
    email: '',
    ico: '',
    dic: '',
    bank: '',
    iban: '',
    city: '',
    billingName: '',
    billingStreet: '',
    billingZip: '',
    billingCity: '',
    billingCountry: 'Ceska republika',
    reliable: false,
    rating: null,
    note: '',
  };
};

const getContractorDetailKey = (contractor: Contractor) => (
  contractor.profileId ?? `legacy:${contractor.id}`
);

const CrewView = () => {
  const { role, selectedContractorProfileId, setSelectedContractorProfileId, searchQuery, setSearchQuery, setDeleteConfirm } = useAppContext();
  const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
  const [crew, setCrew] = useState<Contractor[]>([]);
  const [query, setQuery] = useState('');
  const [crewViewMode, setCrewViewMode] = useState<'list' | 'calendar'>('list');
  const loadCrew = useCallback(() => { setCrew(getCrew()); }, []);
  useEffect(() => { loadCrew(); }, [loadCrew]);
  useEffect(() => subscribeToCrewChanges(loadCrew), [loadCrew]);
  const nextContractorId = useMemo(() => Math.max(0, ...crew.map((person) => person.id)) + 1, [crew]);
  const filteredCrew = useMemo(() => filterCrewMembers(crew, query, searchQuery), [crew, query, searchQuery]);
  const canViewRatings = role !== 'crew';
  const activity = useCrewActivity(canViewRatings && !selectedContractorProfileId && crewViewMode === 'list');
  const clearSearch = () => { setQuery(''); setSearchQuery?.(''); };

  if (selectedContractorProfileId) return <CrewDetailView key={selectedContractorProfileId} />;
  if (crewViewMode === 'calendar') return <CrewShiftCalendarView onBack={() => setCrewViewMode('list')} />;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--nodu-text)]">Crew</h1>
          <p className="mt-1 text-sm text-[var(--nodu-text-soft)]">Lidé a kontakty na jednom místě.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setCrewViewMode('calendar')}><CalendarDays size={16} />Kalendář směn</Button>
          <Button type="button" className="min-h-11" onClick={() => setEditingContractor(createEmptyContractor(nextContractorId))}><Plus size={16} />Nový člen</Button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-3.5 text-[var(--nodu-text-soft)]" />
          <input type="search" aria-label="Hledat v crew" placeholder="Jméno, město, telefon nebo e-mail" value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 w-full rounded-xl border border-[var(--nodu-border)] bg-white pl-10 pr-10 text-sm text-[var(--nodu-text)] outline-none focus:border-[var(--nodu-accent)] focus:ring-2 focus:ring-[var(--nodu-accent-soft)]" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Vymazat text hledání" className="absolute right-0 top-0 flex h-11 w-10 items-center justify-center text-[var(--nodu-text-soft)]"><X size={16} /></button>}
        </div>
        <p role="status" className="text-xs text-[var(--nodu-text-soft)]">{query || searchQuery ? `${filteredCrew.length} z ${crew.length} lidí` : `${crew.length} ${crew.length === 1 ? 'člověk' : crew.length < 5 && crew.length > 1 ? 'lidé' : 'lidí'} v crew`}</p>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.3fr)_6rem_minmax(0,1.3fr)_9rem_2.75rem] gap-4 px-5 pb-2 text-[11px] font-medium text-[var(--nodu-text-soft)] lg:grid">
        <span>Jméno a město</span><span>Hodnocení</span><span>Kontakt</span><span>Poslední aktivita</span><span />
      </div>
      <ul aria-label="Členové crew" className="space-y-3 lg:space-y-0 lg:overflow-hidden lg:rounded-[24px] lg:border lg:border-[var(--nodu-border)] lg:bg-white lg:[&>li+li]:border-t">
        {filteredCrew.map((person) => {
          const timestamp = person.profileId ? activity.data[person.profileId] : undefined;
          const activityLabel = activity.status === 'loading' ? 'Načítám aktivitu…' : activity.status === 'error' ? 'Aktivita nedostupná' : formatCrewActivity(timestamp);
          return <li key={getContractorDetailKey(person)} className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto_2.75rem] gap-x-2 gap-y-2 rounded-2xl border border-[var(--nodu-border)] bg-white p-3 lg:grid-cols-[minmax(0,1.3fr)_6rem_minmax(0,1.3fr)_9rem_2.75rem] lg:items-center lg:gap-4 lg:rounded-none lg:border-0 lg:px-5 lg:py-4">
            <button type="button" aria-label={`Otevřít profil ${person.name}`} onClick={() => setSelectedContractorProfileId(getContractorDetailKey(person))}
              className="group col-start-1 row-start-1 flex min-h-11 min-w-0 items-center gap-2 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--nodu-accent)]">
              <span className="av h-9 w-9 shrink-0 text-sm" style={{ backgroundColor: person.bg, color: person.fg }}>{person.ii}</span>
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-[var(--nodu-text)] group-hover:text-[var(--nodu-accent)]">{person.name}</span>
                <span className="mt-0.5 flex min-w-0 items-start gap-1 text-xs text-[var(--nodu-text-soft)]"><MapPin size={12} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{person.city || 'Město neuvedeno'}</span></span></span>
            </button>
            <div className="col-start-2 row-start-1 flex items-center gap-1.5 text-xs lg:col-start-2 lg:row-start-1">
              {canViewRatings && <><Star size={14} className="shrink-0 text-[var(--nodu-accent)]" />{typeof person.rating === 'number'
                ? <span className="font-medium text-[var(--nodu-text)]">{`${person.rating.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} / 10`}</span>
                : <><span aria-hidden="true" className="text-[var(--nodu-text-soft)] lg:hidden">—</span><span className="sr-only lg:not-sr-only font-medium text-[var(--nodu-text)]">Bez hodnocení</span></>}</>}
            </div>
            <div className="col-start-3 row-start-1 lg:col-start-5">
              <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={`Možnosti pro ${person.name}`}><MoreHorizontal size={18} /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="min-h-11" onSelect={() => setEditingContractor(person)}><Pencil size={14} className="mr-2" />Upravit profil</DropdownMenuItem>
                  <DropdownMenuItem className="min-h-11 text-[var(--nodu-error-text)]" onSelect={() => setDeleteConfirm({ type: 'crew', id: person.id, name: person.name })}><Trash2 size={14} className="mr-2" />Smazat člena</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="col-span-3 row-start-2 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--nodu-border)] pt-2 lg:contents">
              <div className="min-w-0 break-words text-xs text-[var(--nodu-text-soft)] lg:col-span-1 lg:col-start-4 lg:row-start-1" title="Poslední zaznamenané používání aplikace">
                <span className="sr-only">Poslední aktivita:</span><Clock3 size={12} aria-hidden="true" className="mr-1 inline lg:hidden" /><span>{activityLabel}</span>
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:flex-col lg:items-stretch lg:gap-0">
                {person.phone && <a href={`tel:${person.phone.replace(/[^+\d]/g, '')}`} aria-label={`Zavolat: ${person.name}, ${person.phone}`} title={person.phone} className="flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--nodu-border)] px-2.5 text-xs text-[var(--nodu-text)] outline-none hover:border-[var(--nodu-accent)] hover:text-[var(--nodu-accent)] focus-visible:ring-2 focus-visible:ring-[var(--nodu-accent)] lg:min-h-8 lg:rounded-none lg:border-0 lg:px-0 lg:text-sm"><Phone size={14} className="shrink-0 text-[var(--nodu-text-soft)]" /><span className="text-sm lg:hidden">Zavolat</span><span className="hidden break-words lg:inline">{person.phone}</span></a>}
                {person.email && <a href={`mailto:${person.email}`} aria-label={`Napsat e-mail: ${person.name}, ${person.email}`} title={person.email} className="flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg border border-[var(--nodu-border)] px-2.5 text-xs text-[var(--nodu-text-soft)] outline-none hover:border-[var(--nodu-accent)] hover:text-[var(--nodu-accent)] focus-visible:ring-2 focus-visible:ring-[var(--nodu-accent)] lg:min-h-8 lg:rounded-none lg:border-0 lg:px-0 lg:text-xs"><Mail size={14} className="shrink-0" /><span className="text-sm lg:hidden">E-mail</span><span className="hidden min-w-0 break-all lg:inline">{person.email}</span></a>}
                {!person.phone && !person.email && <p className="py-2 text-xs text-[var(--nodu-text-soft)]">Kontakt neuveden</p>}
              </div>
            </div>
          </li>;
        })}
      </ul>
      {filteredCrew.length === 0 && <div className="rounded-[24px] border border-dashed border-[var(--nodu-border)] bg-white px-5 py-12 text-center">
        <Users size={28} className="mx-auto mb-3 text-[var(--nodu-text-soft)]" />
        <h2 className="text-sm font-semibold text-[var(--nodu-text)]">{crew.length ? 'Nikdo neodpovídá hledání' : 'Zatím žádní členové crew'}</h2>
        <p className="mt-2 text-xs text-[var(--nodu-text-soft)]">{crew.length ? 'Zkus jiné jméno, město nebo kontakt.' : 'Přidej prvního člověka do svého týmu.'}</p>
        {crew.length > 0 && <Button type="button" variant="outline" className="mt-4" onClick={clearSearch}>Vymazat hledání</Button>}
      </div>}
      <ContractorEditModal editingContractor={editingContractor} onClose={() => setEditingContractor(null)} onChange={setEditingContractor} />
    </motion.div>
  );
};
export default CrewView;
