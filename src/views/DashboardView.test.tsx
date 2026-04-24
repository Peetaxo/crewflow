import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let mockAppContext = {
  darkMode: false,
  currentTab: 'dashboard',
};

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../context/AppContext', () => ({
  useAppContext: () => mockAppContext,
}));

vi.mock('../components/layout/Sidebar', () => ({
  default: () => <aside data-testid="sidebar" />,
}));

vi.mock('./DashboardView', () => ({
  default: () => <div data-testid="dashboard-view" />,
}));

vi.mock('./MyShiftsView', () => ({
  default: () => <div data-testid="my-shifts-view" />,
}));

vi.mock('./ClientsView', () => ({
  default: () => <div data-testid="clients-view" />,
}));

vi.mock('./ProjectsView', () => ({
  default: () => <div data-testid="projects-view" />,
}));

vi.mock('./EventsView', () => ({
  default: () => <div data-testid="events-view" />,
}));

vi.mock('./CrewView', () => ({
  default: () => <div data-testid="crew-view" />,
}));

vi.mock('./TimelogsView', () => ({
  default: () => <div data-testid="timelogs-view" />,
}));

vi.mock('./InvoicesView', () => ({
  default: () => <div data-testid="invoices-view" />,
}));

vi.mock('./ReceiptsView', () => ({
  default: () => <div data-testid="receipts-view" />,
}));

vi.mock('./RecruitmentView', () => ({
  default: () => <div data-testid="recruitment-view" />,
}));

vi.mock('./SettingsView', () => ({
  default: () => <div data-testid="settings-view" />,
}));

vi.mock('../components/modals/TimelogEditModal', () => ({
  default: () => null,
}));

vi.mock('../components/modals/ProjectEditModal', () => ({
  default: () => null,
}));

vi.mock('../components/modals/ClientEditModal', () => ({
  default: () => null,
}));

vi.mock('../components/modals/ReceiptEditModal', () => ({
  default: () => null,
}));

vi.mock('../components/modals/DeleteConfirmModal', () => ({
  default: () => null,
}));

import AppLayout from '../components/layout/AppLayout';

describe('DashboardView shell', () => {
  it('applies nodu shell classes to the dashboard layout wrapper', () => {
    const { container } = render(<AppLayout />);

    expect(container.firstElementChild).toHaveClass('nodu-app-shell');
    expect(screen.getByRole('main')).toHaveClass('nodu-page-frame');
  });
});
