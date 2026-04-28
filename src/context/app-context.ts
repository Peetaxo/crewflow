import { createContext } from 'react';
import type { Client, Project, ReceiptItem, Role, Timelog } from '../types';

export interface DeleteConfirmData {
  type: 'client' | 'project' | 'event' | 'crew' | 'receipt';
  id: number | string;
  name: string;
}

export interface AppContextType {
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
  selectedContractorProfileId: string | null;
  setSelectedContractorProfileId: (id: string | null) => void;
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
  handleDelete: () => Promise<void>;
}

export const AppContext = createContext<AppContextType | null>(null);
