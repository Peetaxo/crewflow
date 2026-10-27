import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, User } from '@supabase/supabase-js';

const setRole = vi.fn();
const setCurrentTab = vi.fn();
const crewId = '11111111-1111-4111-8111-111111111111';
const defaultAppContext = {
  darkMode: false,
  currentTab: 'dashboard',
  role: 'crewhead',
  setRole,
  setCurrentTab,
  selectedEventId: null as string | null,
  selectedProjectIdForStats: null as string | null,
};

const authMockState = {
  isAuthRequired: false,
  isAuthenticated: false,
  isDevSession: false,
  isLoading: false,
  currentUserId: null as string | null,
  user: null as User | null,
  session: null as Session | null,
  isRoleSwitching: false,
  role: null as 'crew' | 'crewhead' | 'coo' | null,
  switchRole: vi.fn(async () => undefined),
};

let mockAppContext = { ...defaultAppContext };
let mockIsMobile = false;

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../context/useAppContext', () => ({
  useAppContext: () => mockAppContext,
}));

vi.mock('../../app/providers/useAuth', () => ({
  useAuth: () => authMockState,
}));

vi.mock('../../hooks/use-mobile', () => ({
  useIsMobile: () => mockIsMobile,
}));

vi.mock('./useNavBadgeCounts', () => ({
  useNavBadgeCounts: () => ({ 'my-timelogs': 2 }),
}));

vi.mock('./Sidebar', () => ({
  default: () => <aside data-testid="sidebar" />,
}));

vi.mock('./MobileCrewNav', () => ({
  default: ({ badgeCounts, role }: { badgeCounts: Record<string, number>; role: string }) => (
    <nav data-testid="mobile-crew-nav" data-role={role}>{badgeCounts['my-timelogs']}</nav>
  ),
}));

vi.mock('../../views/DashboardView', () => ({
  default: () => <div data-testid="dashboard-view" />,
}));

vi.mock('../../views/MyShiftsView', () => ({
  default: () => <div data-testid="my-shifts-view" />,
}));

vi.mock('../../views/ClientsView', () => ({
  default: () => <div data-testid="clients-view" />,
}));

vi.mock('../../views/ProjectsView', () => ({
  default: () => <div data-testid="projects-view" />,
}));

vi.mock('../../views/EventsView', () => ({
  default: () => <div data-testid="events-view" />,
}));

vi.mock('../../views/CrewView', () => ({
  default: () => <div data-testid="crew-view" />,
}));

vi.mock('../../views/TimelogsView', () => ({
  default: () => <div data-testid="timelogs-view" />,
}));

vi.mock('../../views/InvoicesView', () => ({
  default: () => <div data-testid="invoices-view" />,
}));

vi.mock('../../views/ReceiptsView', () => ({
  default: () => <div data-testid="receipts-view" />,
}));

vi.mock('../../views/RecruitmentView', () => ({
  default: () => <div data-testid="recruitment-view" />,
}));

vi.mock('../../views/FleetView', () => ({
  default: () => <div data-testid="fleet-view" />,
}));

vi.mock('../../views/WarehouseView', () => ({
  default: () => <div data-testid="warehouse-view" />,
}));

vi.mock('../../views/SettingsView', () => ({
  default: () => <div data-testid="settings-view" />,
}));

vi.mock('../modals/TimelogEditModal', () => ({
  default: () => null,
}));

vi.mock('../modals/ProjectEditModal', () => ({
  default: () => null,
}));

vi.mock('../modals/ClientEditModal', () => ({
  default: () => null,
}));

vi.mock('../modals/ReceiptEditModal', () => ({
  default: () => null,
}));

vi.mock('../modals/DeleteConfirmModal', () => ({
  default: () => null,
}));

import AppLayout from './AppLayout';

describe('AppLayout shell', () => {
  beforeEach(() => {
    mockAppContext = { ...defaultAppContext };
    mockIsMobile = false;
    setRole.mockClear();
    setCurrentTab.mockClear();
    window.localStorage.clear();
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'false');
    authMockState.isAuthenticated = false;
    authMockState.isDevSession = false;
    authMockState.isLoading = false;
    authMockState.currentUserId = null;
    authMockState.user = null;
    authMockState.session = null;
    authMockState.isAuthRequired = false;
    authMockState.isRoleSwitching = false;
    authMockState.role = null;
    authMockState.switchRole.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  const enableCrewGuide = () => {
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true');
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431');
    mockAppContext = { ...mockAppContext, role: 'crew' };
    authMockState.isAuthRequired = true;
    authMockState.isAuthenticated = true;
    authMockState.currentUserId = crewId;
    authMockState.role = 'crew';
    authMockState.user = { id: crewId, is_anonymous: false } as User;
    authMockState.session = { user: authMockState.user, access_token: 'test-session' } as Session;
  };

  it('offers the optional guide to genuine crew before entering the shell', () => {
    enableCrewGuide();
    render(<AppLayout />);

    expect(screen.getByRole('heading', { name: 'Jak používat nodu' })).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-view')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Přeskočit' }));
    expect(screen.getByTestId('dashboard-view')).toBeVisible();
    expect(setCurrentTab).not.toHaveBeenCalled();
  });

  it('opens My Shifts from the guide and keeps it dismissed after remount', () => {
    enableCrewGuide();
    const first = render(<AppLayout />);
    fireEvent.click(screen.getByRole('button', { name: 'Zobrazit směny' }));
    expect(setCurrentTab).toHaveBeenCalledExactlyOnceWith('my-shifts');
    first.unmount();
    render(<AppLayout />);
    expect(screen.queryByRole('heading', { name: 'Jak používat nodu' })).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-view')).toBeVisible();
  });

  it('applies nodu shell classes to the dashboard layout wrapper', () => {
    render(<AppLayout />);

    expect(screen.getByRole('main').parentElement).toHaveClass('nodu-app-shell');
    expect(screen.getByRole('main')).toHaveClass('nodu-page-frame');
  });

  it('adds the dark class when the app context is in dark mode', () => {
    mockAppContext = {
      ...mockAppContext,
      darkMode: true,
    };

    render(<AppLayout />);

    expect(screen.getByRole('main').parentElement).toHaveClass('dark', 'nodu-app-shell');
    expect(screen.getByRole('main')).toHaveClass('nodu-page-frame');
    expect(screen.getByRole('main').className).not.toContain('bg-white');
  });

  it('renders the fleet view for the fleet tab', () => {
    mockAppContext = {
      ...mockAppContext,
      currentTab: 'fleet',
    };

    render(<AppLayout />);

    expect(screen.getByTestId('fleet-view')).toBeInTheDocument();
  });

  it('renders the warehouse view for the warehouse tab', () => {
    mockAppContext = {
      ...mockAppContext,
      currentTab: 'warehouse',
    };

    render(<AppLayout />);

    expect(screen.getByTestId('warehouse-view')).toBeInTheDocument();
  });

  it('uses the mobile app shell for Crew without preview role controls', () => {
    mockAppContext = {
      ...mockAppContext,
      role: 'crew',
    };
    mockIsMobile = true;

    render(<AppLayout />);

    expect(screen.getByRole('main').parentElement).toHaveClass('nodu-app-shell--mobile-crew');
    expect(screen.getByRole('main')).toHaveClass('nodu-page-frame--mobile-crew');
    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    expect(screen.getByTestId('mobile-crew-nav')).toHaveTextContent('2');
    expect(screen.getByTestId('mobile-crew-nav')).toHaveAttribute('data-role', 'crew');
    expect(screen.queryByRole('button', { name: 'Crew' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CrewHead' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'COO' })).not.toBeInTheDocument();
  });

  it('hides the mobile Crew nav while a Crew event detail is open', () => {
    mockAppContext = {
      ...mockAppContext,
      currentTab: 'events',
      role: 'crew',
      selectedEventId: 'event-uuid-1',
    };
    mockIsMobile = true;

    render(<AppLayout />);

    expect(screen.queryByTestId('mobile-crew-nav')).not.toBeInTheDocument();
    expect(screen.getByTestId('events-view')).toBeInTheDocument();
  });

  it('hides the mobile nav inside an event opened from a project', () => {
    mockAppContext = { ...mockAppContext, currentTab: 'projects', selectedProjectIdForStats: 'JTI001', selectedEventId: 'event-1' };
    mockIsMobile = true;
    render(<AppLayout />);
    expect(screen.queryByTestId('mobile-crew-nav')).not.toBeInTheDocument();
    expect(screen.getByTestId('projects-view')).toBeInTheDocument();
  });

  it('uses the mobile app shell for management roles on mobile', () => {
    mockAppContext = {
      ...mockAppContext,
      role: 'crewhead',
    };
    mockIsMobile = true;

    render(<AppLayout />);

    expect(screen.queryByTestId('sidebar')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('nodu-page-frame--mobile-crew');
    expect(screen.getByTestId('mobile-crew-nav')).toHaveAttribute('data-role', 'crewhead');
    expect(screen.queryByRole('button', { name: 'CrewHead' })).not.toBeInTheDocument();
  });

  it.each([false, true])('does not expose mobile role controls (authenticated=%s)', (authenticated) => {
    mockAppContext = { ...mockAppContext, role: 'crew' };
    authMockState.isAuthRequired = authenticated;
    authMockState.role = 'crew';
    mockIsMobile = true;
    render(<AppLayout />);
    expect(screen.queryByLabelText('Přepnutí role v mobilním preview')).not.toBeInTheDocument();
    expect(setRole).not.toHaveBeenCalled();
    expect(authMockState.switchRole).not.toHaveBeenCalled();
  });
});
