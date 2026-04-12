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
import { deleteProject } from '../features/projects/services/projects.service';
import { deleteClient } from '../features/clients/services/clients.service';
import {
  getTimelogs,
  markApprovedTimelogsAsInvoiced,
  markTimelogsAsPaidForInvoice,
} from '../features/timelogs/services/timelogs.service';
import {
  deleteReceipt,
  getReceipts,
  markApprovedReceiptsAsAttached,
  markReceiptsAsReimbursedForInvoice,
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
  invoices: Invoice[];
  setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>>;
  candidates: Candidate[];
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  filteredEvents: Event[];
  filteredInvoices: Invoice[];
  filteredContractors: Contractor[];
  findContractor: (id: number) => Contractor | null;
  findEvent: (id: number) => Event | null;
  advanceCandidate: (id: number) => void;
  generateInvoices: () => void;
  approveInvoice: (id: string) => void;
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
  const [invoices, setInvoicesState] = useState<Invoice[]>(localData.invoices);
  const [candidates, setCandidatesState] = useState<Candidate[]>(localData.candidates);
  const syncSnapshotToState = useCallback((snapshot: AppDataSnapshot) => {
    setEventsState(snapshot.events);
    setContractorsState(snapshot.contractors);
    setInvoicesState(snapshot.invoices);
    setCandidatesState(snapshot.candidates);
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

  const setInvoices: React.Dispatch<React.SetStateAction<Invoice[]>> = useCallback((value) => {
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      invoices: typeof value === 'function' ? value(snapshot.invoices) : value,
    }));
  }, []);

  const setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>> = useCallback((value) => {
    updateLocalAppState((snapshot) => ({
      ...snapshot,
      candidates: typeof value === 'function' ? value(snapshot.candidates) : value,
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

  const filteredContractors = useMemo(() => {
    if (!searchQuery) return contractors;
    const q = searchQuery.toLowerCase();
    return contractors.filter((contractor) => (
      contractor.name.toLowerCase().includes(q)
      || contractor.city.toLowerCase().includes(q)
      || contractor.tags.some((tag) => tag.toLowerCase().includes(q))
    ));
  }, [contractors, searchQuery]);

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
    const timelogs = getTimelogs();
    const receipts = getReceipts();
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
    markApprovedTimelogsAsInvoiced();
    markApprovedReceiptsAsAttached();
    setCurrentTab('invoices');
    toast.success(`Vygenerovano ${newInvoices.length} faktur.`);
  }, [findContractor, findEvent, setInvoices]);

  const approveInvoice = useCallback((id: string) => {
    const invoice = invoices.find((item) => item.id === id);
    if (!invoice) return;

    setInvoices((prev) => prev.map((item) => item.id === id ? { ...item, status: 'paid' } : item));
    markTimelogsAsPaidForInvoice(invoice.eid, invoice.cid);
    markReceiptsAsReimbursedForInvoice(invoice.eid, invoice.cid);
  }, [invoices, setInvoices]);

  const handleDelete = useCallback(() => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;

    switch (type) {
      case 'client':
        deleteClient(Number(id));
        break;
      case 'project':
        deleteProject(String(id));
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
  }, [deleteConfirm]);

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
    invoices, setInvoices,
    candidates, setCandidates,
    filteredEvents,
    filteredInvoices,
    filteredContractors,
    findContractor,
    findEvent,
    advanceCandidate,
    generateInvoices,
    approveInvoice,
    handleDelete,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
