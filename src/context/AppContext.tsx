import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Candidate,
  Client,
  Contractor,
  Event,
  Invoice,
  Project,
  ReceiptItem,
  RecruitmentStage,
  Role,
  Timelog,
} from '../types';
import { KM_RATE } from '../data';
import { NAV_BY_ROLE } from '../constants';
import { calculateTotalHours } from '../utils';
import { appDataSource } from '../lib/app-config';
import { AppDataSnapshot, getLocalAppState, getSupabaseAppData, subscribeToLocalAppState, updateLocalAppState } from '../lib/app-data';
import { deleteCrew } from '../features/crew/services/crew.service';
import { deleteEvent } from '../features/events/services/events.service';
import {
  approveAllTimelogsForEvent,
  saveTimelog as persistTimelog,
  updateTimelogStatus,
} from '../features/timelogs/services/timelogs.service';
import {
  deleteReceipt,
  saveReceipt as persistReceipt,
  updateReceiptStatus,
} from '../features/receipts/services/receipts.service';

interface DeleteConfirmData {
  type: 'client' | 'project' | 'event' | 'crew' | 'receipt';
  id: number | string;
  name: string;
}

interface AppContextType {
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  role: Role;
  setRole: (r: Role) => void;
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  settingsSection: 'menu' | 'profile' | 'appearance';
  setSettingsSection: (section: 'menu' | 'profile' | 'appearance') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  timelogFilter: string;
  setTimelogFilter: (f: string) => void;
  projectFilter: string;
  setProjectFilter: (f: string) => void;
  selectedContractorId: number | null;
  setSelectedContractorId: (id: number | null) => void;
  selectedEventId: number | null;
  setSelectedEventId: (id: number | null) => void;
  selectedProjectIdForStats: string | null;
  setSelectedProjectIdForStats: (id: string | null) => void;
  selectedClientIdForStats: number | null;
  setSelectedClientIdForStats: (id: number | null) => void;
  editingTimelog: Timelog | null;
  setEditingTimelog: (t: Timelog | null) => void;
  editingProject: Project | null;
  setEditingProject: (p: Project | null) => void;
  editingReceipt: ReceiptItem | null;
  setEditingReceipt: (r: ReceiptItem | null) => void;
  editingClient: Client | null;
  setEditingClient: (c: Client | null) => void;
  deleteConfirm: DeleteConfirmData | null;
  setDeleteConfirm: (d: DeleteConfirmData | null) => void;
  eventTab: string;
  setEventTab: (tab: string) => void;
  eventsViewMode: 'list' | 'calendar';
  setEventsViewMode: (mode: 'list' | 'calendar') => void;
  eventsCalendarMode: 'month' | 'week';
  setEventsCalendarMode: (mode: 'month' | 'week') => void;
  eventsFilter: 'upcoming' | 'past' | 'all';
  setEventsFilter: (filter: 'upcoming' | 'past' | 'all') => void;
  eventsCalendarDate: string;
  setEventsCalendarDate: (date: string) => void;
  events: Event[];
  setEvents: React.Dispatch<React.SetStateAction<Event[]>>;
  contractors: Contractor[];
  setContractors: React.Dispatch<React.SetStateAction<Contractor[]>>;
  timelogs: Timelog[];
  setTimelogs: React.Dispatch<React.SetStateAction<Timelog[]>>;
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  receipts: ReceiptItem[];
  setReceipts: React.Dispatch<React.SetStateAction<ReceiptItem[]>>;
  candidates: Candidate[];
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  filteredEvents: Event[];
  filteredTimelogs: Timelog[];
  filteredInvoices: Invoice[];
  filteredReceipts: ReceiptItem[];
  filteredContractors: Contractor[];
  filteredProjects: Project[];
  filteredClients: Client[];
  findContractor: (id: number) => Contractor | null;
  findEvent: (id: number) => Event | null;
  handleTimelogAction: (id: number, action: 'sub' | 'ch' | 'coo' | 'rej') => void;
  approveAllTimelogs: (eventId: number) => void;
  advanceCandidate: (id: number) => void;
  generateInvoices: () => void;
  approveInvoice: (id: string) => void;
  handleReceiptAction: (id: number, action: 'submit' | 'approve' | 'reimburse' | 'reject') => void;
  handleSaveReceipt: (updated: ReceiptItem) => void;
  handleSaveTimelog: (updated: Timelog) => void;
  handleDelete: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext musi byt pouzit uvnitr AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const localData = getLocalAppState();

  const sortTimelogDays = useCallback((days: Timelog['days']) => (
    [...days].sort((a, b) => `${a.d}${a.f}${a.type}`.localeCompare(`${b.d}${b.f}${b.type}`))
  ), []);

  const [darkMode, setDarkMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [role, setRole] = useState<Role>('crewhead');
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [settingsSection, setSettingsSection] = useState<'menu' | 'profile' | 'appearance'>('menu');
  const [searchQuery, setSearchQuery] = useState('');
  const [timelogFilter, setTimelogFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');

  const [selectedContractorId, setSelectedContractorId] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [selectedProjectIdForStats, setSelectedProjectIdForStats] = useState<string | null>(null);
  const [selectedClientIdForStats, setSelectedClientIdForStats] = useState<number | null>(null);

  const [editingTimelog, setEditingTimelog] = useState<Timelog | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingReceipt, setEditingReceipt] = useState<ReceiptItem | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmData | null>(null);
  const [eventTab, setEventTab] = useState<string>('overview');
  const [eventsViewMode, setEventsViewMode] = useState<'list' | 'calendar'>('list');
  const [eventsCalendarMode, setEventsCalendarMode] = useState<'month' | 'week'>('month');
  const [eventsFilter, setEventsFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [eventsCalendarDate, setEventsCalendarDate] = useState<string>('');

  const [events, setEventsState] = useState<Event[]>(localData.events);
  const [contractors, setContractorsState] = useState<Contractor[]>(localData.contractors);
  const [timelogs, setTimelogsState] = useState<Timelog[]>(localData.timelogs);
  const [invoices, setInvoicesState] = useState<Invoice[]>(localData.invoices);
  const [receipts, setReceiptsState] = useState<ReceiptItem[]>(localData.receipts);
  const [candidates, setCandidatesState] = useState<Candidate[]>(localData.candidates);
  const [projects, setProjectsState] = useState<Project[]>(localData.projects);
  const [clients, setClientsState] = useState<Client[]>(localData.clients);

  const syncSnapshotToState = useCallback((snapshot: AppDataSnapshot) => {
    setEventsState(snapshot.events);
    setContractorsState(snapshot.contractors);
    setTimelogsState(snapshot.timelogs);
    setInvoicesState(snapshot.invoices);
    setReceiptsState(snapshot.receipts);
    setCandidatesState(snapshot.candidates);
    setProjectsState(snapshot.projects);
    setClientsState(snapshot.clients);
  }, []);

  useEffect(() => subscribeToLocalAppState(syncSnapshotToState), [syncSnapshotToState]);

  const setEvents: React.Dispatch<React.SetStateAction<Event[]>> = useCallback((value) => {
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      events: typeof value === 'function' ? value(snapshot.events) : value,
    }));
  }, []);

  const setContractors: React.Dispatch<React.SetStateAction<Contractor[]>> = useCallback((value) => {
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      contractors: typeof value === 'function' ? value(snapshot.contractors) : value,
    }));
  }, []);

  const setTimelogs: React.Dispatch<React.SetStateAction<Timelog[]>> = useCallback((value) => {
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      timelogs: typeof value === 'function' ? value(snapshot.timelogs) : value,
    }));
  }, []);

  const setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>> = useCallback((value) => {
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      invoices: typeof value === 'function' ? value(snapshot.invoices) : value,
    }));
  }, []);

  const setReceipts: React.Dispatch<React.SetStateAction<ReceiptItem[]>> = useCallback((value) => {
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      receipts: typeof value === 'function' ? value(snapshot.receipts) : value,
    }));
  }, []);

  const setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>> = useCallback((value) => {
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      candidates: typeof value === 'function' ? value(snapshot.candidates) : value,
    }));
  }, []);

  const setProjects: React.Dispatch<React.SetStateAction<Project[]>> = useCallback((value) => {
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      projects: typeof value === 'function' ? value(snapshot.projects) : value,
    }));
  }, []);

  const setClients: React.Dispatch<React.SetStateAction<Client[]>> = useCallback((value) => {
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      clients: typeof value === 'function' ? value(snapshot.clients) : value,
    }));
  }, []);

  useEffect(() => {
    setSearchQuery('');
  }, [currentTab]);

  useEffect(() => {
    if (appDataSource !== 'supabase') return;

    let isCancelled = false;

    void (async () => {
      try {
        const snapshot = await getSupabaseAppData();
        if (isCancelled) return;
        updateLocalAppState(() => snapshot);
        toast.success('Aplikace nacetla data ze Supabase.');
      } catch (error) {
        if (isCancelled) return;
        const message = error instanceof Error ? error.message : 'Nepodarilo se nacist data ze Supabase.';
        toast.warning(`Supabase data se nepodarilo nacist: ${message}`);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currentTab !== 'crew') setSelectedContractorId(null);
    if (currentTab !== 'events') {
      setSelectedEventId(null);
      setEventTab('overview');
    }
    if (currentTab !== 'projects') setSelectedProjectIdForStats(null);
    if (currentTab !== 'clients') setSelectedClientIdForStats(null);
  }, [currentTab]);

  useEffect(() => {
    const allowedTabs = NAV_BY_ROLE[role];
    if (currentTab !== 'settings' && !allowedTabs.includes(currentTab)) {
      setCurrentTab(allowedTabs[0]);
    }
  }, [role, currentTab]);

  const findContractor = useCallback(
    (id: number): Contractor | null => contractors.find((contractor) => contractor.id === id) ?? null,
    [contractors],
  );

  const findEvent = useCallback(
    (id: number): Event | null => events.find((event) => event.id === id) ?? null,
    [events],
  );

  const filteredEvents = useMemo(() => {
    if (!searchQuery) return events;
    const q = searchQuery.toLowerCase();
    return events.filter((event) => (
      event.name.toLowerCase().includes(q) || event.job.toLowerCase().includes(q)
    ));
  }, [events, searchQuery]);

  const filteredTimelogs = useMemo(() => {
    if (!searchQuery) return timelogs;
    const q = searchQuery.toLowerCase();
    return timelogs.filter((timelog) => {
      const event = findEvent(timelog.eid);
      const contractor = findContractor(timelog.cid);
      if (!event || !contractor) return false;
      return (
        event.name.toLowerCase().includes(q)
        || event.job.toLowerCase().includes(q)
        || contractor.name.toLowerCase().includes(q)
      );
    });
  }, [timelogs, searchQuery, findEvent, findContractor]);

  const filteredInvoices = useMemo(() => {
    if (!searchQuery) return invoices;
    const q = searchQuery.toLowerCase();
    return invoices.filter((invoice) => {
      const event = findEvent(invoice.eid);
      const contractor = findContractor(invoice.cid);
      if (!event || !contractor) return false;
      return (
        event.name.toLowerCase().includes(q)
        || event.job.toLowerCase().includes(q)
        || contractor.name.toLowerCase().includes(q)
        || invoice.id.toLowerCase().includes(q)
      );
    });
  }, [invoices, searchQuery, findEvent, findContractor]);

  const filteredReceipts = useMemo(() => {
    if (!searchQuery) return receipts;
    const q = searchQuery.toLowerCase();
    return receipts.filter((receipt) => {
      const event = findEvent(receipt.eid);
      const contractor = findContractor(receipt.cid);
      if (!event || !contractor) return false;
      return (
        receipt.title.toLowerCase().includes(q)
        || receipt.vendor.toLowerCase().includes(q)
        || receipt.job.toLowerCase().includes(q)
        || event.name.toLowerCase().includes(q)
        || contractor.name.toLowerCase().includes(q)
      );
    });
  }, [receipts, searchQuery, findEvent, findContractor]);

  const filteredContractors = useMemo(() => {
    if (!searchQuery) return contractors;
    const q = searchQuery.toLowerCase();
    return contractors.filter((contractor) => (
      contractor.name.toLowerCase().includes(q)
      || contractor.city.toLowerCase().includes(q)
      || contractor.tags.some((tag) => tag.toLowerCase().includes(q))
    ));
  }, [contractors, searchQuery]);

  const filteredProjects = useMemo(() => {
    let result = projects;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((project) => (
        project.id.toLowerCase().includes(q)
        || project.name.toLowerCase().includes(q)
        || project.client.toLowerCase().includes(q)
      ));
    }
    if (projectFilter !== 'all') {
      const now = new Date().toISOString().split('T')[0];
      result = result.filter((project) => {
        const projectEvents = events.filter((event) => event.job === project.id);
        const isUpcoming = projectEvents.some((event) => event.startDate >= now);
        return projectFilter === 'upcoming' ? isUpcoming : !isUpcoming;
      });
    }
    return result;
  }, [projects, searchQuery, projectFilter, events]);

  const filteredClients = useMemo(() => {
    if (!searchQuery) return clients;
    const q = searchQuery.toLowerCase();
    return clients.filter((client) => (
      client.name.toLowerCase().includes(q) || client.city?.toLowerCase().includes(q)
    ));
  }, [clients, searchQuery]);

  const handleTimelogAction = useCallback((id: number, action: 'sub' | 'ch' | 'coo' | 'rej') => {
    updateTimelogStatus(id, action);
  }, []);

  const approveAllTimelogs = useCallback((eventId: number) => {
    approveAllTimelogsForEvent(eventId);
  }, []);

  const advanceCandidate = useCallback((id: number) => {
    setCandidates((prev) => prev.map((candidate) => {
      if (candidate.id !== id) return candidate;
      const stages: RecruitmentStage[] = ['new', 'interview_scheduled', 'decision', 'accepted'];
      const index = stages.indexOf(candidate.stage);
      if (index < stages.length - 1) {
        return { ...candidate, stage: stages[index + 1] };
      }
      return candidate;
    }));
  }, [setCandidates]);

  const generateInvoices = useCallback(() => {
    const approvedTimelogs = timelogs.filter((timelog) => timelog.status === 'approved');
    const approvedReceipts = receipts.filter((receipt) => receipt.status === 'approved');

    if (approvedTimelogs.length === 0 && approvedReceipts.length === 0) {
      toast.info('Zadne schvalene vykazy ani uctenky k fakturaci.');
      return;
    }

    const grouped = new Map<string, { cid: number; eid: number; timelogs: Timelog[]; receipts: ReceiptItem[] }>();

    approvedTimelogs.forEach((timelog) => {
      const key = `${timelog.cid}-${timelog.eid}`;
      const existing = grouped.get(key) || { cid: timelog.cid, eid: timelog.eid, timelogs: [], receipts: [] };
      existing.timelogs.push(timelog);
      grouped.set(key, existing);
    });

    approvedReceipts.forEach((receipt) => {
      const key = `${receipt.cid}-${receipt.eid}`;
      const existing = grouped.get(key) || { cid: receipt.cid, eid: receipt.eid, timelogs: [], receipts: [] };
      existing.receipts.push(receipt);
      grouped.set(key, existing);
    });

    const newInvoices: Invoice[] = [...grouped.values()]
      .map((group, index) => {
        const contractor = findContractor(group.cid);
        const event = findEvent(group.eid);
        if (!contractor || !event) return null;

        const hours = group.timelogs.reduce((sum, timelog) => sum + calculateTotalHours(timelog.days), 0);
        const km = group.timelogs.reduce((sum, timelog) => sum + timelog.km, 0);
        const hAmt = Math.round(hours * contractor.rate);
        const kAmt = Math.round(km * KM_RATE);
        const receiptAmt = Math.round(group.receipts.reduce((sum, receipt) => sum + receipt.amount, 0));
        const uniqueId = `FAK-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${index + 1}`;

        return {
          id: uniqueId,
          cid: group.cid,
          eid: group.eid,
          hours: Math.round(hours),
          hAmt,
          km,
          kAmt,
          receiptAmt,
          total: hAmt + kAmt + receiptAmt,
          job: event.job,
          status: 'sent' as const,
          sentAt: new Date().toISOString(),
        };
      })
      .filter((invoice): invoice is Invoice => invoice !== null);

    setInvoices((prev) => [...prev, ...newInvoices]);
    setTimelogs((prev) => prev.map((timelog) => (
      timelog.status === 'approved' ? { ...timelog, status: 'invoiced' } : timelog
    )));
    setReceipts((prev) => prev.map((receipt) => (
      receipt.status === 'approved' ? { ...receipt, status: 'attached' } : receipt
    )));
    setCurrentTab('invoices');
    toast.success(`Vygenerovano ${newInvoices.length} faktur.`);
  }, [timelogs, receipts, findContractor, findEvent, setInvoices, setReceipts, setTimelogs]);

  const approveInvoice = useCallback((id: string) => {
    const invoice = invoices.find((item) => item.id === id);
    if (!invoice) return;

    setInvoices((prev) => prev.map((item) => item.id === id ? { ...item, status: 'paid' } : item));
    setTimelogs((prev) => prev.map((timelog) => (
      timelog.eid === invoice.eid && timelog.cid === invoice.cid && timelog.status === 'invoiced'
        ? { ...timelog, status: 'paid' }
        : timelog
    )));
    setReceipts((prev) => prev.map((receipt) => (
      receipt.eid === invoice.eid && receipt.cid === invoice.cid && receipt.status === 'attached'
        ? { ...receipt, status: 'reimbursed' }
        : receipt
    )));
  }, [invoices, setInvoices, setReceipts, setTimelogs]);

  const handleReceiptAction = useCallback((id: number, action: 'submit' | 'approve' | 'reimburse' | 'reject') => {
    updateReceiptStatus(id, action);
  }, []);

  const handleSaveReceipt = useCallback((updated: ReceiptItem) => {
    try {
      persistReceipt(updated);
      setEditingReceipt(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se ulozit uctenku.');
    }
  }, []);

  const handleSaveTimelog = useCallback((updated: Timelog) => {
    persistTimelog(updated);
    setEditingTimelog(null);
  }, []);

  const handleDelete = useCallback(() => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;

    switch (type) {
      case 'client':
        setClients((prev) => prev.filter((client) => client.id !== id));
        break;
      case 'project':
        setProjects((prev) => prev.filter((project) => project.id !== id));
        break;
      case 'event':
        deleteEvent(Number(id));
        break;
      case 'crew':
        deleteCrew(Number(id));
        break;
      case 'receipt':
        deleteReceipt(Number(id));
        break;
    }

    setDeleteConfirm(null);
    toast.success(`${deleteConfirm.name} smazano.`);
  }, [deleteConfirm, setClients, setProjects]);

  const value: AppContextType = {
    darkMode, setDarkMode,
    sidebarCollapsed, setSidebarCollapsed,
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
    editingProject, setEditingProject,
    editingReceipt, setEditingReceipt,
    editingClient, setEditingClient,
    deleteConfirm, setDeleteConfirm,
    eventTab, setEventTab,
    eventsViewMode, setEventsViewMode,
    eventsCalendarMode, setEventsCalendarMode,
    eventsFilter, setEventsFilter,
    eventsCalendarDate, setEventsCalendarDate,
    events, setEvents,
    contractors, setContractors,
    timelogs, setTimelogs,
    invoices, setInvoices,
    receipts, setReceipts,
    candidates, setCandidates,
    projects, setProjects,
    clients, setClients,
    filteredEvents,
    filteredTimelogs,
    filteredInvoices,
    filteredReceipts,
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
    handleReceiptAction,
    handleSaveReceipt,
    handleSaveTimelog,
    handleDelete,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
