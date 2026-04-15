import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../app/providers/AuthProvider';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Client,
  Project,
  ReceiptItem,
  Role,
  Timelog,
} from '../types';
import { NAV_BY_ROLE } from '../constants';
import { deleteCrew } from '../features/crew/services/crew.service';
import { deleteEvent } from '../features/events/services/events.service';
import { deleteProject } from '../features/projects/services/projects.service';
import { deleteClient } from '../features/clients/services/clients.service';
import { deleteReceipt } from '../features/receipts/services/receipts.service';

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
  setNavigationGuardMessage: (message: string | null) => void;
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
  handleDelete: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function useAppContext(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext musi byt pouzit uvnitr AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { isAuthRequired, role: authRole } = useAuth();
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [role, setRole] = useState<Role>('crewhead');
  const [currentTab, setCurrentTabState] = useState('dashboard');
  const [navigationGuardMessage, setNavigationGuardMessage] = useState<string | null>(null);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
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

  const setCurrentTab = useCallback((tab: string) => {
    if (navigationGuardMessage && tab !== currentTab) {
      setPendingTab(tab);
      return;
    }

    setCurrentTabState(tab);
  }, [currentTab, navigationGuardMessage]);

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
      setCurrentTabState(allowedTabs[0]);
    }
  }, [role, currentTab]);

  useEffect(() => {
    if (isAuthRequired && authRole && authRole !== role) {
      setRole(authRole);
    }
  }, [authRole, isAuthRequired, role]);

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
    setNavigationGuardMessage,
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
    handleDelete,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      <AlertDialog open={pendingTab !== null} onOpenChange={(open) => { if (!open) setPendingTab(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rozpracovane zmeny se neulozi</AlertDialogTitle>
            <AlertDialogDescription>
              {navigationGuardMessage ?? 'Pokud ted odejdes, neulozene zmeny se ztrati.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zustat</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingTab) {
                  setNavigationGuardMessage(null);
                  setCurrentTabState(pendingTab);
                }
                setPendingTab(null);
              }}
            >
              Odejit bez ulozeni
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppContext.Provider>
  );
}
