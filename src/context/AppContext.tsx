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
  ReceiptStatus,
  RecruitmentStage,
  Role,
  Timelog,
  TimelogStatus,
} from '../types';
import {
  INITIAL_CANDIDATES,
  INITIAL_CLIENTS,
  INITIAL_CONTRACTORS,
  INITIAL_EVENTS,
  INITIAL_INVOICES,
  INITIAL_PROJECTS,
  INITIAL_RECEIPTS,
  INITIAL_TIMELOGS,
  KM_RATE,
} from '../data';
import { NAV_BY_ROLE } from '../constants';
import { calculateTotalHours } from '../utils';

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
  editingEvent: Event | null;
  setEditingEvent: (e: Event | null) => void;
  editingProject: Project | null;
  setEditingProject: (p: Project | null) => void;
  editingReceipt: ReceiptItem | null;
  setEditingReceipt: (r: ReceiptItem | null) => void;
  editingClient: Client | null;
  setEditingClient: (c: Client | null) => void;
  editingContractor: Contractor | null;
  setEditingContractor: (c: Contractor | null) => void;
  assigningCrewToEvent: Event | null;
  setAssigningCrewToEvent: (e: Event | null) => void;
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
  handleSaveEvent: (updated: Event) => void;
  handleDelete: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext musí být použit uvnitř AppProvider');
  return ctx;
}

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
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingReceipt, setEditingReceipt] = useState<ReceiptItem | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [editingContractor, setEditingContractor] = useState<Contractor | null>(null);
  const [assigningCrewToEvent, setAssigningCrewToEvent] = useState<Event | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmData | null>(null);
  const [eventTab, setEventTab] = useState<string>('overview');
  const [eventsViewMode, setEventsViewMode] = useState<'list' | 'calendar'>('list');
  const [eventsCalendarMode, setEventsCalendarMode] = useState<'month' | 'week'>('month');
  const [eventsFilter, setEventsFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [eventsCalendarDate, setEventsCalendarDate] = useState<string>('');

  const [events, setEvents] = useState<Event[]>(INITIAL_EVENTS);
  const [contractors, setContractors] = useState<Contractor[]>(INITIAL_CONTRACTORS);
  const [timelogs, setTimelogs] = useState<Timelog[]>(INITIAL_TIMELOGS);
  const [invoices, setInvoices] = useState<Invoice[]>(INITIAL_INVOICES);
  const [receipts, setReceipts] = useState<ReceiptItem[]>(INITIAL_RECEIPTS);
  const [candidates, setCandidates] = useState<Candidate[]>(INITIAL_CANDIDATES);
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  const [clients, setClients] = useState<Client[]>(INITIAL_CLIENTS);

  useEffect(() => {
    setSearchQuery('');
  }, [currentTab]);

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
    setTimelogs((prev) => prev.map((timelog) => {
      if (timelog.id !== id) return timelog;
      const statusMap: Record<string, TimelogStatus> = {
        sub: 'pending_ch',
        ch: 'pending_coo',
        coo: 'approved',
        rej: 'rejected',
      };
      return { ...timelog, status: statusMap[action] || timelog.status };
    }));
  }, []);

  const approveAllTimelogs = useCallback((eventId: number) => {
    setTimelogs((prev) => prev.map((timelog) => (
      timelog.eid === eventId && timelog.status === 'pending_coo'
        ? { ...timelog, status: 'approved' }
        : timelog
    )));
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
  }, []);

  const generateInvoices = useCallback(() => {
    const approvedTimelogs = timelogs.filter((timelog) => timelog.status === 'approved');
    const approvedReceipts = receipts.filter((receipt) => receipt.status === 'approved');

    if (approvedTimelogs.length === 0 && approvedReceipts.length === 0) {
      toast.info('Žádné schválené výkazy ani účtenky k fakturaci.');
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
      toast.success(`Vygenerováno ${newInvoices.length} faktur.`);
  }, [timelogs, receipts, findContractor, findEvent]);

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
  }, [invoices]);

  const handleReceiptAction = useCallback((id: number, action: 'submit' | 'approve' | 'reimburse' | 'reject') => {
    const statusMap: Record<'submit' | 'approve' | 'reimburse' | 'reject', ReceiptStatus> = {
      submit: 'submitted',
      approve: 'approved',
      reimburse: 'reimbursed',
      reject: 'rejected',
    };

    setReceipts((prev) => prev.map((receipt) => (
      receipt.id === id
        ? { ...receipt, status: statusMap[action] }
        : receipt
    )));
  }, []);

  const handleSaveReceipt = useCallback((updated: ReceiptItem) => {
    const normalizedReceipt = {
      ...updated,
      job: updated.job.trim().toUpperCase(),
      title: updated.title.trim(),
      vendor: updated.vendor.trim(),
      note: updated.note.trim(),
    };

    if (!normalizedReceipt.eid || !normalizedReceipt.cid || !normalizedReceipt.title || normalizedReceipt.amount <= 0) {
      toast.error('Vyplňte akci, název účtenky a částku.');
      return;
    }

    setReceipts((prev) => {
      const exists = prev.some((receipt) => receipt.id === normalizedReceipt.id);
      return exists
        ? prev.map((receipt) => receipt.id === normalizedReceipt.id ? normalizedReceipt : receipt)
        : [...prev, normalizedReceipt];
    });

    setEditingReceipt(null);
  }, []);

  const handleSaveTimelog = useCallback((updated: Timelog) => {
    const sortedTimelog = { ...updated, days: sortTimelogDays(updated.days) };
    setTimelogs((prev) => prev.map((timelog) => timelog.id === updated.id ? sortedTimelog : timelog));
    setEditingTimelog(null);
  }, [sortTimelogDays]);

  const handleSaveEvent = useCallback((updated: Event) => {
    const normalizedEvent = {
      ...updated,
      job: updated.job.trim().toUpperCase(),
      name: updated.name.trim(),
      client: updated.client.trim(),
    };

    if (!normalizedEvent.job) {
      toast.error('Vyplňte Job Number.');
      return;
    }

    setEvents((prev) => {
      const exists = prev.some((event) => event.id === normalizedEvent.id);
      return exists
        ? prev.map((event) => event.id === normalizedEvent.id ? normalizedEvent : event)
        : [...prev, normalizedEvent];
    });

    setProjects((prev) => {
      const exists = prev.some((project) => project.id === normalizedEvent.job);
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

    setTimelogs((prev) => prev.map((timelog) => {
      if (timelog.eid !== normalizedEvent.id) return timelog;
      return {
        ...timelog,
        days: sortTimelogDays(timelog.days.map((day) => getScheduledEventDay(normalizedEvent, day))),
      };
    }));

    setEditingEvent(null);
  }, [getScheduledEventDay, sortTimelogDays]);

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
        setEvents((prev) => prev.filter((event) => event.id !== id));
        setTimelogs((prev) => prev.filter((timelog) => timelog.eid !== id));
        setReceipts((prev) => prev.filter((receipt) => receipt.eid !== id));
        break;
      case 'crew':
        setContractors((prev) => prev.filter((contractor) => contractor.id !== id));
        setTimelogs((prev) => prev.filter((timelog) => timelog.cid !== id));
        setReceipts((prev) => prev.filter((receipt) => receipt.cid !== id));
        break;
      case 'receipt':
        setReceipts((prev) => prev.filter((receipt) => receipt.id !== id));
        break;
    }

    setDeleteConfirm(null);
    toast.success(`${deleteConfirm.name} smazáno.`);
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
    editingEvent, setEditingEvent,
    editingProject, setEditingProject,
    editingReceipt, setEditingReceipt,
    editingClient, setEditingClient,
    editingContractor, setEditingContractor,
    assigningCrewToEvent, setAssigningCrewToEvent,
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
    handleSaveEvent,
    handleDelete,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
