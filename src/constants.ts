import {
  LayoutDashboard,
  Calendar,
  Users,
  FileText,
  CheckCircle2,
  Receipt,
  UserPlus,
  Clock,
  FolderKanban,
  Building2,
  Settings,
} from 'lucide-react';

/** Konfigurace fází akce (Instal / Provoz / Deinstal) */
export const PHASE_CONFIG = [
  { id: 'I', type: 'instal' as const, color: 'bg-blue-500 border-blue-600 shadow-blue-100', label: 'Instal' },
  { id: 'P', type: 'provoz' as const, color: 'bg-emerald-500 border-emerald-600 shadow-emerald-100', label: 'Provoz' },
  { id: 'D', type: 'deinstal' as const, color: 'bg-orange-500 border-orange-600 shadow-orange-100', label: 'Deinstal' },
] as const;

/** Položky navigace v sidebaru (bez Settings — ten je zvlášť) */
export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-shifts', label: 'Moje směny', icon: Clock },
  { id: 'clients', label: 'Klienti', icon: Building2 },
  { id: 'projects', label: 'Projekty', icon: FolderKanban },
  { id: 'events', label: 'Akce', icon: Calendar },
  { id: 'crew', label: 'Crew', icon: Users },
  { id: 'timelogs', label: 'Timelogy', icon: FileText },
  { id: 'approvals', label: 'Schvalování', icon: CheckCircle2 },
  { id: 'invoices', label: 'Faktury', icon: Receipt },
  { id: 'recruitment', label: 'Nábor', icon: UserPlus },
] as const;
