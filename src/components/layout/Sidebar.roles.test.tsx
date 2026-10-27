import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from './Sidebar';

const state = vi.hoisted(() => ({ collapsed: false }));
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => ({
  isAuthRequired: true, isRoleSwitching: false, profile: null, role: 'crew', signOut: vi.fn(), switchRole: vi.fn(),
}) }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({
  sidebarCollapsed: state.collapsed, setSidebarCollapsed: vi.fn(), role: 'crew', setRole: vi.fn(),
  currentTab: 'my-shifts', setCurrentTab: vi.fn(), setSettingsSection: vi.fn(), searchQuery: '', setSearchQuery: vi.fn(),
  setSelectedContractorProfileId: vi.fn(), setSelectedEventId: vi.fn(),
  setSelectedProjectIdForStats: vi.fn(), setSelectedClientIdForStats: vi.fn(),
}) }));
vi.mock('./useNavBadgeCounts', () => ({ useNavBadgeCounts: () => ({}) }));
vi.mock('../../features/notifications/NotificationCenter', () => ({ NotificationBell: () => null }));

describe('Sidebar role controls', () => {
  it.each([false, true])('has no self-role buttons when collapsed=%s', collapsed => {
    state.collapsed = collapsed;
    render(<Sidebar />);
    expect(screen.queryByRole('button', { name: 'CrewHead' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'COO' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nastaveni/ })).toBeInTheDocument();
  });
});
