import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../app/providers/useAuth';
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
import { Client, Project, ReceiptItem, Role, Timelog } from '../types';
import { NAV_BY_ROLE } from '../constants';
import { deleteCrew } from '../features/crew/services/crew.service';
import { deleteEvent } from '../features/events/services/events.service';
import { deleteProject } from '../features/projects/services/projects.service';
import { deleteClient } from '../features/clients/services/clients.service';
import { deleteReceipt } from '../features/receipts/services/receipts.service';
import { loadPersistedUiSession, savePersistedUiSession, type PersistedUiSessionState } from './ui-session-storage';
import { loadUiPreferences, saveUiPreferences } from './ui-preferences-storage';
import { AppContext, type AppContextType, type DeleteConfirmData, type SelectedEventId } from './app-context';

const normalizeUiSessionState = (
  state: PersistedUiSessionState,
  role: Role | null,
): PersistedUiSessionState => {
  const normalizedState: PersistedUiSessionState = { ...state };

  if (role) {
    const allowedTabs = NAV_BY_ROLE[role];
    if (normalizedState.currentTab !== 'settings' && !allowedTabs.includes(normalizedState.currentTab)) {
      normalizedState.currentTab = allowedTabs[0];
    }
  }

  if (normalizedState.currentTab !== 'crew') {
    normalizedState.selectedContractorProfileId = null;
  }

  if (normalizedState.currentTab !== 'events') {
    normalizedState.selectedEventId = null;
    normalizedState.eventTab = 'overview';
  }

  if (normalizedState.currentTab !== 'projects') {
    normalizedState.selectedProjectIdForStats = null;
  }

  if (normalizedState.currentTab !== 'clients') {
    normalizedState.selectedClientIdForStats = null;
  }

  return normalizedState;
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { isAuthRequired, isLoading: isAuthLoading, role: authRole } = useAuth();
  const initialUiPreferences = useMemo(() => loadUiPreferences(), []);
  const persistedUiSession = useMemo(() => loadPersistedUiSession(), []);
  const shouldDeferUiRestore = isAuthRequired && isAuthLoading && Boolean(persistedUiSession);
  const pendingDeferredUiSession = useRef<PersistedUiSessionState | null>(shouldDeferUiRestore ? persistedUiSession : null);
  const initialUiSession = useMemo(
    () => (shouldDeferUiRestore
      ? null
      : (persistedUiSession ? normalizeUiSessionState(persistedUiSession, authRole ?? null) : null)),
    [authRole, persistedUiSession, shouldDeferUiRestore],
  );
  const skipInitialSearchReset = useRef(Boolean(initialUiSession));
  const [darkMode, setDarkMode] = useState(initialUiPreferences?.darkMode ?? false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialUiPreferences?.sidebarCollapsed ?? false);
  const [role, setRole] = useState<Role>(authRole ?? 'crewhead');
  const [currentTab, setCurrentTabState] = useState(initialUiSession?.currentTab ?? 'dashboard');
  const [navigationGuardMessage, setNavigationGuardMessage] = useState<string | null>(null);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [settingsSection, setSettingsSection] = useState<'menu' | 'profile' | 'appearance'>('menu');
  const [searchQuery, setSearchQuery] = useState(initialUiSession?.searchQuery ?? '');
  const [timelogFilter, setTimelogFilter] = useState(initialUiSession?.timelogFilter ?? 'all');
  const [projectFilter, setProjectFilter] = useState(initialUiSession?.projectFilter ?? 'all');

  const [selectedContractorProfileId, setSelectedContractorProfileId] = useState<string | null>(initialUiSession?.selectedContractorProfileId ?? null);
  const [selectedEventId, setSelectedEventId] = useState<SelectedEventId | null>(initialUiSession?.selectedEventId ?? null);
  const [selectedProjectIdForStats, setSelectedProjectIdForStats] = useState<string | null>(initialUiSession?.selectedProjectIdForStats ?? null);
  const [selectedClientIdForStats, setSelectedClientIdForStats] = useState<number | null>(initialUiSession?.selectedClientIdForStats ?? null);

  const [editingTimelog, setEditingTimelog] = useState<Timelog | null>(initialUiSession?.editingTimelog ?? null);
  const [editingProject, setEditingProject] = useState<Project | null>(initialUiSession?.editingProject ?? null);
  const [editingReceipt, setEditingReceipt] = useState<ReceiptItem | null>(initialUiSession?.editingReceipt ?? null);
  const [editingClient, setEditingClient] = useState<Client | null>(initialUiSession?.editingClient ?? null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmData | null>(null);
  const [eventTab, setEventTab] = useState<string>(initialUiSession?.eventTab ?? 'overview');
  const [eventsViewMode, setEventsViewMode] = useState<'list' | 'calendar'>(initialUiSession?.eventsViewMode ?? 'list');
  const [eventsCalendarMode, setEventsCalendarMode] = useState<'month' | 'week'>(initialUiSession?.eventsCalendarMode ?? 'month');
  const [eventsFilter, setEventsFilter] = useState<'upcoming' | 'past' | 'all'>(initialUiSession?.eventsFilter ?? 'upcoming');
  const [eventsCalendarDate, setEventsCalendarDate] = useState<string>(initialUiSession?.eventsCalendarDate ?? '');

  const setCurrentTab = useCallback((tab: string) => {
    if (navigationGuardMessage && tab !== currentTab) {
      setPendingTab(tab);
      return;
    }

    setCurrentTabState(tab);
  }, [currentTab, navigationGuardMessage]);

  useEffect(() => {
    if (skipInitialSearchReset.current) {
      skipInitialSearchReset.current = false;
      return;
    }
    setSearchQuery('');
  }, [currentTab]);

  useEffect(() => {
    if (currentTab !== 'crew') setSelectedContractorProfileId(null);
    if (currentTab !== 'events') {
      setSelectedEventId(null);
      setEventTab('overview');
    }
    if (currentTab !== 'projects') setSelectedProjectIdForStats(null);
    if (currentTab !== 'clients') setSelectedClientIdForStats(null);
  }, [currentTab]);

  useEffect(() => {
    if (isAuthRequired && isAuthLoading) {
      return;
    }

    const allowedTabs = NAV_BY_ROLE[role];
    if (currentTab !== 'settings' && !allowedTabs.includes(currentTab)) {
      setCurrentTabState(allowedTabs[0]);
    }
  }, [currentTab, isAuthLoading, isAuthRequired, role]);

  useEffect(() => {
    if (isAuthRequired && authRole && authRole !== role) {
      setRole(authRole);
    }
  }, [authRole, isAuthRequired, role]);

  useEffect(() => {
    if (pendingDeferredUiSession.current && (!isAuthRequired || !isAuthLoading)) {
      const restoredState = normalizeUiSessionState(
        pendingDeferredUiSession.current,
        authRole ?? role ?? null,
      );

      skipInitialSearchReset.current = true;
      setCurrentTabState(restoredState.currentTab);
      setSearchQuery(restoredState.searchQuery);
      setTimelogFilter(restoredState.timelogFilter);
      setProjectFilter(restoredState.projectFilter);
      setSelectedContractorProfileId(restoredState.selectedContractorProfileId);
      setSelectedEventId(restoredState.selectedEventId);
      setSelectedProjectIdForStats(restoredState.selectedProjectIdForStats);
      setSelectedClientIdForStats(restoredState.selectedClientIdForStats);
      setEventTab(restoredState.eventTab);
      setEventsViewMode(restoredState.eventsViewMode);
      setEventsCalendarMode(restoredState.eventsCalendarMode);
      setEventsFilter(restoredState.eventsFilter);
      setEventsCalendarDate(restoredState.eventsCalendarDate);
      setEditingTimelog(restoredState.editingTimelog);
      setEditingReceipt(restoredState.editingReceipt);
      setEditingProject(restoredState.editingProject);
      setEditingClient(restoredState.editingClient);
      pendingDeferredUiSession.current = null;
    }
  }, [authRole, isAuthLoading, isAuthRequired, role]);

  useEffect(() => {
    saveUiPreferences({ darkMode, sidebarCollapsed });
  }, [darkMode, sidebarCollapsed]);

  useEffect(() => {
    if (
      pendingDeferredUiSession.current
      || (isAuthRequired && isAuthLoading)
      || (isAuthRequired && authRole && authRole !== role)
    ) {
      return;
    }

    savePersistedUiSession(normalizeUiSessionState({
      currentTab,
      searchQuery,
      timelogFilter,
      projectFilter,
      selectedContractorProfileId,
      selectedEventId,
      selectedProjectIdForStats,
      selectedClientIdForStats,
      eventTab,
      eventsViewMode,
      eventsCalendarMode,
      eventsFilter,
      eventsCalendarDate,
      editingTimelog,
      editingReceipt,
      editingProject,
      editingClient,
    }, role));
  }, [
    authRole,
    currentTab,
    searchQuery,
    timelogFilter,
    projectFilter,
    selectedContractorProfileId,
    selectedEventId,
    selectedProjectIdForStats,
    selectedClientIdForStats,
    eventTab,
    eventsViewMode,
    eventsCalendarMode,
    eventsFilter,
    eventsCalendarDate,
    editingTimelog,
    editingReceipt,
    editingProject,
    editingClient,
    isAuthLoading,
    isAuthRequired,
    role,
  ]);

  const handleDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;

    try {
      switch (type) {
        case 'client':
          await deleteClient(Number(id));
          break;
        case 'project':
          await deleteProject(String(id));
          break;
        case 'event':
          await deleteEvent(id);
          break;
        case 'crew':
          await deleteCrew(Number(id));
          break;
        case 'receipt':
          await deleteReceipt(Number(id));
          break;
      }

      setDeleteConfirm(null);
      toast.success(`${deleteConfirm.name} smazano.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nepodarilo se polozku smazat.');
    }
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
    selectedContractorProfileId, setSelectedContractorProfileId,
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
