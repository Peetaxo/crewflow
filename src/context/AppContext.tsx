import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Role, Event, Contractor, Timelog, Invoice, Candidate, Project, Client,
  TimelogStatus, RecruitmentStage
} from '../types';
import {
  INITIAL_EVENTS, INITIAL_CONTRACTORS, INITIAL_TIMELOGS,
  INITIAL_INVOICES, INITIAL_CANDIDATES, INITIAL_PROJECTS,
  INITIAL_CLIENTS, KM_RATE
} from '../data';
import { NAV_BY_ROLE } from '../constants';
import { calculateTotalHours } from '../utils';

/* ============================================================
   Typy pro kontext aplikace
   ============================================================ */

interface DeleteConfirmData {
  type: 'client' | 'project' | 'event' | 'crew';
  id: number | string;
  name: string;
}

interface AppContextType {
  /* Globální UI stav */
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  role: Role;
  setRole: (r: Role) => void;
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  settingsSection: 'menu' | 'profile' | 'appearance';
  setSettingsSection: (section: 'menu' | 'profile' | 'appearance') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  /* Filtr timelogů */
  timelogFilter: string;
  setTimelogFilter: (f: string) => void;

  /* Filtr projektů */
  projectFilter: string;
  setProjectFilter: (f: string) => void;

  /* Detail views — vybraná ID */
  selectedContractorId: number | null;
  setSelectedContractorId: (id: number | null) => void;
  selectedEventId: number | null;
  setSelectedEventId: (id: number | null) => void;
  selectedProjectIdForStats: string | null;
  setSelectedProjectIdForStats: (id: string | null) => void;
  selectedClientIdForStats: number | null;
  setSelectedClientIdForStats: (id: number | null) => void;

  /* Modální okna */
  editingTimelog: Timelog | null;
  setEditingTimelog: (t: Timelog | null) => void;
  editingEvent: Event | null;
  setEditingEvent: (e: Event | null) => void;
  editingProject: Project | null;
  setEditingProject: (p: Project | null) => void;
  editingClient: Client | null;
  setEditingClient: (c: Client | null) => void;
  assigningCrewToEvent: Event | null;
  setAssigningCrewToEvent: (e: Event | null) => void;
  deleteConfirm: DeleteConfirmData | null;
  setDeleteConfirm: (d: DeleteConfirmData | null) => void;

  /* Záložka v detailu akce */
  eventTab: string;
  setEventTab: (tab: string) => void;

  /* Data */
  events: Event[];
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  contractors: Contractor[];
  setContractors: React.Dispatch<React.SetStateAction<Contractor[]>>;
  timelogs: Timelog[];
  setTimelogs: React.Dispatch<React.SetStateAction<Timelog[]>>;
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  candidates: Candidate[];
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;

  /* Filtrovaná data */
  filteredEvents: Event[];
  filteredTimelogs: Timelog[];
  filteredInvoices: Invoice[];
  filteredContractors: Contractor[];
  filteredProjects: Project[];
  filteredClients: Client[];

  /* Vyhledávací funkce — bezpečné (vrací null místo crash) */
  findContractor: (id: number) => Contractor | null;
  findEvent: (id: number) => Event | null;

  /* Akce / handlery */
  handleTimelogAction: (id: number, action: 'sub' | 'ch' | 'coo' | 'rej') => void;
  approveAllTimelogs: (eventId: number) => void;
  advanceCandidate: (id: number) => void;
  generateInvoices: () => void;
  approveInvoice: (id: string) => void;
  handleSaveTimelog: (updated: Timelog) => void;
  handleSaveEvent: (updated: Event) => void;
  handleDelete: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

/** Hook pro přístup ke kontextu aplikace */
export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext musí být použit uvnitř AppProvider');
  return ctx;
}

/* ============================================================
   Provider
   ============================================================ */

export function AppProvider({ children }: { children: React.ReactNode }) {
  const sortTimelogDays = useCallback((days: Timelog['days']) => (
    [...days].sort((a, b) => `${a.d}${a.f}${a.type}`.localeCompare(`${b.d}${b.f}${b.type}`))
  ), []);

  const getScheduledEventDay = useCallback((event: Event, day: Timelog['days'][number]) => {
    if (!event.showDayTypes) {
      return {
        ...day,
        type: 'instal' as const,
        f: event.startTime || day.f,
        t: event.endTime || day.t,
      };
    }

    const phaseSlot = event.phaseSchedules?.[day.type]?.find((slot) => slot.dates.includes(day.d));
    const fallbackType = event.dayTypes?.[day.d];
    const fallbackSlot = fallbackType ? event.phaseSchedules?.[fallbackType]?.find((slot) => slot.dates.includes(day.d)) : undefined;
    const resolvedType = phaseSlot ? day.type : (fallbackType || day.type);
    const resolvedSlot = phaseSlot || fallbackSlot;

    return {
      ...day,
      type: resolvedType,
      f: resolvedSlot?.from ?? event.phaseTimes?.[resolvedType]?.from ?? event.startTime ?? day.f,
      t: resolvedSlot?.to ?? event.phaseTimes?.[resolvedType]?.to ?? event.endTime ?? day.t,
    };
  }, []);
  /* ---- Globální UI stav ---- */
  const [darkMode, setDarkMode] = useState(false);
  const [role, setRole] = useState<Role>('crewhead');
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [settingsSection, setSettingsSection] = useState<'menu' | 'profile' | 'appearance'>('menu');
  const [searchQuery, setSearchQuery] = useState('');
  const [timelogFilter, setTimelogFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');

  /* ---- Detail views ---- */
  const [selectedContractorId, setSelectedContractorId] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedProjectIdForStats, setSelectedProjectIdForStats] = useState<string | null>(null);
  const [selectedClientIdForStats, setSelectedClientIdForStats] = useState<number | null>(null);

  /* ---- Modální okna ---- */
  const [editingTimelog, setEditingTimelog] = useState<Timelog | null>(null);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [assigningCrewToEvent, setAssigningCrewToEvent] = useState<Event | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmData | null>(null);
  const [eventTab, setEventTab] = useState<string>('overview');

  /* ---- Data ---- */
  const [events, setEvents] = useState<Event[]>(INITIAL_EVENTS);
  const [contractors, setContractors] = useState<Contractor[]>(INITIAL_CONTRACTORS);
  const [timelogs, setTimelogs] = useState<Timelog[]>(INITIAL_TIMELOGS);
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [candidates, setCandidates] = useState<Candidate[]>(INITIAL_CANDIDATES);
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [clients, setClients] = useState<Client[]>(INITIAL_CLIENTS);

  /* ---- Reset search query při změně tabu ---- */
  useEffect(() => {
    setSearchQuery('');
  }, [currentTab]);

  useEffect(() => {
    const allowedTabs = NAV_BY_ROLE[role];
    if (currentTab !== 'settings' && !allowedTabs.includes(currentTab)) {
      setCurrentTab(allowedTabs[0]);
    }
  }, [role, currentTab]);

  /* ---- Lookup funkce (bezpečné — vrací null) ---- */
  const findContractor = useCallback(
    (id: number): Contractor | null => contractors.find(c => c.id === id) ?? null,
    [contractors]
  );

  const findEvent = useCallback(
    (id: number): Event | null => events.find(e => e.id === id) ?? null,
    [events]
  );

  /* ---- Filtrovaná data ---- */
  const filteredEvents = useMemo(() => {
    if (!searchQuery) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(e =>
      e.name.toLowerCase().includes(q) || e.job.toLowerCase().includes(q)
    );
  }, [events, searchQuery]);

  const filteredTimelogs = useMemo(() => {
    if (!searchQuery) return timelogs;
    const q = searchQuery.toLowerCase();
    return timelogs.filter(t => {
      const e = findEvent(t.eid);
      const c = findContractor(t.cid);
      if (!e || !c) return false;
      return e.name.toLowerCase().includes(q) || e.job.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    });
  }, [timelogs, searchQuery, findEvent, findContractor]);

  const filteredInvoices = useMemo(() => {
    if (!searchQuery) return invoices;
    const q = searchQuery.toLowerCase();
    return invoices.filter(i => {
      const e = findEvent(i.eid);
      const c = findContractor(i.cid);
      if (!e || !c) return false;
      return e.name.toLowerCase().includes(q) || e.job.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q);
    });
  }, [invoices, searchQuery, findEvent, findContractor]);

  const filteredContractors = useMemo(() => {
    if (!searchQuery) return contractors;
    const q = searchQuery.toLowerCase();
    return contractors.filter(c =>
      c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q) || c.tags.some(t => t.toLowerCase().includes(q))
    );
  }, [contractors, searchQuery]);

  const filteredProjects = useMemo(() => {
    let res = projects;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      res = res.filter(p =>
        p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || p.client.toLowerCase().includes(q)
      );
    }
    if (projectFilter !== 'all') {
      const now = new Date().toISOString().split('T')[0];
      res = res.filter(p => {
        const pEvents = events.filter(e => e.job === p.id);
        const isUpcoming = pEvents.some(e => e.startDate >= now);
        return projectFilter === 'upcoming' ? isUpcoming : !isUpcoming;
      });
    }
    return res;
  }, [projects, searchQuery, projectFilter, events]);

  const filteredClients = useMemo(() => {
    if (!searchQuery) return clients;
    const q = searchQuery.toLowerCase();
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q)
    );
  }, [clients, searchQuery]);

  /* ---- Handlery ---- */

  /** Akce na vykaz: submit / approve CH / approve COO / reject */
  const handleTimelogAction = useCallback((id: number, action: 'sub' | 'ch' | 'coo' | 'rej') => {
    setTimelogs(prev => prev.map(t => {
      if (t.id !== id) return t;
      const statusMap: Record<string, TimelogStatus> = {
        sub: 'pending_ch',
        ch: 'pending_coo',
        coo: 'approved',
        rej: 'rejected',
      };
      return { ...t, status: statusMap[action] || t.status };
    }));
  }, []);

  /** Schválit všechny výkazy pro danou akci (COO) */
  const approveAllTimelogs = useCallback((eventId: number) => {
    setTimelogs(prev => prev.map(t =>
      (t.eid === eventId && t.status === 'pending_coo') ? { ...t, status: 'approved' } : t
    ));
  }, []);

  /** Posunout kandidáta do další fáze náboru */
  const advanceCandidate = useCallback((id: number) => {
    setCandidates(prev => prev.map(c => {
      if (c.id !== id) return c;
      const stages: RecruitmentStage[] = ['new', 'interview_scheduled', 'decision', 'accepted'];
      const idx = stages.indexOf(c.stage);
      if (idx < stages.length - 1) return { ...c, stage: stages[idx + 1] };
      return c;
    }));
  }, []);

  /** Generovat faktury ze schválených výkazů */
  const generateInvoices = useCallback(() => {
    const approved = timelogs.filter(t => t.status === 'approved');
    if (approved.length === 0) {
      toast.info('Žádné schválené výkazy k fakturaci.');
      return;
    }

    const newInvoices: Invoice[] = approved.map((t) => {
      const c = findContractor(t.cid);
      const e = findEvent(t.eid);
      if (!c || !e) return null;

      const hours = calculateTotalHours(t.days);
      const kAmt = Math.round(t.km * KM_RATE);
      /* Unikátní ID faktury založené na timestampu */
      const uniqueId = `FAK-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${t.id}`;

      return {
        id: uniqueId,
        cid: t.cid,
        eid: t.eid,
        hours: Math.round(hours),
        hAmt: Math.round(hours * c.rate),
        km: t.km,
        kAmt,
        total: Math.round(hours * c.rate) + kAmt,
        job: e.job,
        status: 'sent' as const,
        sentAt: new Date().toISOString(),
      };
    }).filter((inv): inv is NonNullable<typeof inv> => inv !== null) as Invoice[];

    setInvoices(prev => [...prev, ...newInvoices]);
    setTimelogs(prev => prev.map(t =>
      t.status === 'approved' ? { ...t, status: 'invoiced' } : t
    ));
    setCurrentTab('invoices');
    toast.success(`Vygenerováno ${newInvoices.length} faktur.`);
  }, [timelogs, findContractor, findEvent]);

  /** Schválit (proplatit) fakturu */
  const approveInvoice = useCallback((id: string) => {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;

    setInvoices(prev => prev.map(i => i.id === id ? { ...i, status: 'paid' } : i));

    /* Označit odpovídající timelogy jako 'paid' — párujeme přes eid+cid+status */
    setTimelogs(prev => prev.map(t =>
      (t.eid === inv.eid && t.cid === inv.cid && t.status === 'invoiced')
        ? { ...t, status: 'paid' }
        : t
    ));
  }, [invoices]);

  /** Uložit upravený výkaz */
  const handleSaveTimelog = useCallback((updated: Timelog) => {
    const sortedTimelog = { ...updated, days: sortTimelogDays(updated.days) };
    setTimelogs(prev => prev.map(t => t.id === updated.id ? sortedTimelog : t));
    setEditingTimelog(null);
  }, [sortTimelogDays]);

  /** Uložit upravenou / novou akci */
  const handleSaveEvent = useCallback((updated: Event) => {
    const normalizedEvent = {
      ...updated,
      job: updated.job.trim().toUpperCase(),
      name: updated.name.trim(),
      client: updated.client.trim(),
    };

    const isJobTaken = events.some(e => e.job === normalizedEvent.job && e.id !== normalizedEvent.id);
    if (isJobTaken) {
      toast.error(`Job Number ${normalizedEvent.job} je již přiřazen k jiné akci.`);
      return;
    }

    if (!normalizedEvent.job) {
      toast.error('Vyplňte Job Number.');
      return;
    }

    setEvents(prev => {
      const exists = prev.some(e => e.id === normalizedEvent.id);
      return exists
        ? prev.map(e => e.id === normalizedEvent.id ? normalizedEvent : e)
        : [...prev, normalizedEvent];
    });

    setProjects(prev => {
      const exists = prev.some(project => project.id === normalizedEvent.job);
      if (exists) return prev;

      return [
        ...prev,
        {
          id: normalizedEvent.job,
          name: normalizedEvent.name || normalizedEvent.job,
          client: normalizedEvent.client,
          createdAt: new Date().toISOString().split('T')[0],
          note: '',
        },
      ];
    });

    setTimelogs(prev => prev.map(timelog => {
      if (timelog.eid !== normalizedEvent.id) return timelog;

      return {
        ...timelog,
        days: sortTimelogDays(timelog.days.map(day => getScheduledEventDay(normalizedEvent, day))),
      };
    }));

    setEditingEvent(null);
  }, [events, getScheduledEventDay, sortTimelogDays]);

  /** Smazat entitu potvrzenou v delete modalu */
  const handleDelete = useCallback(() => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;

    switch (type) {
      case 'client':
        setClients(prev => prev.filter(c => c.id !== id));
        break;
      case 'project':
        setProjects(prev => prev.filter(p => p.id !== id));
        break;
      case 'event':
        setEvents(prev => prev.filter(e => e.id !== id));
        setTimelogs(prev => prev.filter(t => t.eid !== id));
        break;
      case 'crew':
        setContractors(prev => prev.filter(c => c.id !== id));
        setTimelogs(prev => prev.filter(t => t.cid !== id));
        break;
    }

    setDeleteConfirm(null);
    toast.success(`${deleteConfirm.name} smazáno.`);
  }, [deleteConfirm]);

  /* ---- Context value ---- */
  const value: AppContextType = {
    darkMode, setDarkMode,
    role, setRole,
    currentTab, setCurrentTab,
    settingsSection, setSettingsSection,
    searchQuery, setSearchQuery,
    timelogFilter, setTimelogFilter,
    projectFilter, setProjectFilter,
    selectedContractorId, setSelectedContractorId,
    selectedEventId, setSelectedEventId,
    selectedProjectIdForStats, setSelectedProjectIdForStats,
    selectedClientIdForStats, setSelectedClientIdForStats,
    editingTimelog, setEditingTimelog,
    editingEvent, setEditingEvent,
    editingProject, setEditingProject,
    editingClient, setEditingClient,
    assigningCrewToEvent, setAssigningCrewToEvent,
    deleteConfirm, setDeleteConfirm,
    eventTab, setEventTab,
    events, setEvents,
    contractors, setContractors,
    timelogs, setTimelogs,
    invoices, setInvoices,
    candidates, setCandidates,
    projects, setProjects,
    clients, setClients,
    filteredEvents,
    filteredTimelogs,
    filteredInvoices,
    filteredContractors,
    filteredProjects,
    filteredClients,
    findContractor,
    findEvent,
    handleTimelogAction,
    approveAllTimelogs,
    advanceCandidate,
    generateInvoices,
    approveInvoice,
    handleSaveTimelog,
    handleSaveEvent,
    handleDelete,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
