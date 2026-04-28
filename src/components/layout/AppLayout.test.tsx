import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const defaultAppContext = {
  darkMode: false,
  currentTab: 'dashboard',
};

let mockAppContext = { ...defaultAppContext };

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../context/useAppContext', () => ({
  useAppContext: () => mockAppContext,
}));

vi.mock('./Sidebar', () => ({
  default: () => <aside data-testid="sidebar" />,
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
  });

  it('applies nodu shell classes to the dashboard layout wrapper', () => {
    const { container } = render(<AppLayout />);

    expect(container.firstElementChild).toHaveClass('nodu-app-shell');
    expect(screen.getByRole('main')).toHaveClass('nodu-page-frame');
  });

  it('adds the dark class when the app context is in dark mode', () => {
    mockAppContext = {
      ...mockAppContext,
      darkMode: true,
    };

    const { container } = render(<AppLayout />);

    expect(container.firstElementChild).toHaveClass('dark', 'nodu-app-shell');
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
});
