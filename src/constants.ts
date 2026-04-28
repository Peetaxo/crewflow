import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  Receipt,
  UserPlus,
  Clock,
  FolderKanban,
  Building2,
  Car,
  Boxes,
  Settings,
} from 'lucide-react';
import { Role } from './types';

export const PHASE_CONFIG = [
  { id: 'I', type: 'instal' as const, color: 'bg-blue-500 border-blue-600 shadow-blue-100', label: 'Instal' },
  { id: 'P', type: 'provoz' as const, color: 'bg-emerald-500 border-emerald-600 shadow-emerald-100', label: 'Provoz' },
  { id: 'D', type: 'deinstal' as const, color: 'bg-orange-500 border-orange-600 shadow-orange-100', label: 'Deinstal' },
] as const;

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-shifts', label: 'Moje směny', icon: Clock },
  { id: 'clients', label: 'Klienti', icon: Building2 },
  { id: 'projects', label: 'Projekty', icon: FolderKanban },
  { id: 'events', label: 'Akce', icon: Calendar },
  { id: 'crew', label: 'Crew', icon: Users },
  { id: 'fleet', label: 'Flotila', icon: Car },
  { id: 'warehouse', label: 'Sklad', icon: Boxes },
  { id: 'timelogs', label: 'Timelogy', icon: FileText },
  { id: 'my-timelogs', label: 'Moje timelogy', icon: FileText },
  { id: 'invoices', label: 'Faktury', icon: Receipt },
  { id: 'my-invoices', label: 'Moje faktury', icon: Receipt },
  { id: 'receipts', label: 'Účtenky', icon: Receipt },
  { id: 'my-receipts', label: 'Moje účtenky', icon: Receipt },
  { id: 'recruitment', label: 'Nábor', icon: UserPlus },
  { id: 'settings', label: 'Nastavení', icon: Settings },
] as const;

export const NAV_BY_ROLE: Record<Role, string[]> = {
  crew: ['my-shifts', 'events', 'my-timelogs', 'my-invoices', 'my-receipts'],
  crewhead: ['dashboard', 'my-shifts', 'clients', 'projects', 'events', 'crew', 'fleet', 'warehouse', 'timelogs', 'invoices', 'receipts', 'recruitment'],
  coo: ['dashboard', 'my-shifts', 'clients', 'projects', 'events', 'crew', 'fleet', 'warehouse', 'timelogs', 'invoices', 'receipts'],
};

export const ROLE_LABELS: Record<Role, string> = {
  crew: 'Crew',
  crewhead: 'CrewHead',
  coo: 'COO',
};

export const ROLE_SHORT_LABELS: Record<Role, string> = {
  crew: 'Crew',
  crewhead: 'CH',
  coo: 'COO',
};

export const getNavItemsForRole = (role: Role) =>
  NAV_ITEMS.filter((item) => NAV_BY_ROLE[role].includes(item.id));
