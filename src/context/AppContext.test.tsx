import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useAppContext } from './AppContext';
import type { Role } from '../types';
import {
  clearPersistedUiSession,
  loadPersistedUiSession,
  savePersistedUiSession,
} from './ui-session-storage';

const mockAuthState = {
  isAuthRequired: true,
  isLoading: false,
  role: 'coo' as Role | null,
};

vi.mock('../app/providers/AuthProvider', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogCancel: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../features/crew/services/crew.service', () => ({
  deleteCrew: vi.fn(),
}));

vi.mock('../features/events/services/events.service', () => ({
  deleteEvent: vi.fn(),
}));

vi.mock('../features/projects/services/projects.service', () => ({
  deleteProject: vi.fn(),
}));

vi.mock('../features/clients/services/clients.service', () => ({
  deleteClient: vi.fn(),
}));

vi.mock('../features/receipts/services/receipts.service', () => ({
  deleteReceipt: vi.fn(),
}));

const editingReceipt = {
  id: 42,
  cid: 7,
  eid: 9,
  job: 'JOB-42',
  title: 'Taxi',
  vendor: 'Bolt',
  amount: 321,
  paidAt: '2026-04-22',
  note: 'Pozdni prijezd',
  status: 'draft',
} as const;

function ContextProbe() {
  const context = useAppContext();

  return (
    <div>
      <div data-testid="currentTab">{context.currentTab}</div>
      <div data-testid="searchQuery">{context.searchQuery}</div>
      <div data-testid="selectedEventId">{context.selectedEventId ?? 'null'}</div>
      <div data-testid="eventTab">{context.eventTab}</div>
      <div data-testid="editingReceiptTitle">{context.editingReceipt?.title ?? 'null'}</div>
      <button onClick={() => context.setCurrentTab('events')}>set-events-tab</button>
      <button onClick={() => context.setCurrentTab('dashboard')}>set-dashboard-tab</button>
      <button onClick={() => context.setSearchQuery('rozdelana prace')}>set-search</button>
      <button onClick={() => context.setSelectedEventId(55)}>set-event-id</button>
      <button onClick={() => context.setEventTab('crew')}>set-event-tab</button>
      <button onClick={() => context.setEditingReceipt({ ...editingReceipt })}>set-editing-receipt</button>
      <button onClick={() => context.setDeleteConfirm({ type: 'receipt', id: 99, name: 'Nemazat snapshot' })}>set-delete-confirm</button>
    </div>
  );
}

function AuthResolutionHarness() {
  const [, forceRender] = React.useState(0);

  React.useEffect(() => {
    mockAuthState.isLoading = false;
    mockAuthState.role = 'crew';
    forceRender(1);
  }, []);

  return (
    <AppProvider>
      <ContextProbe />
    </AppProvider>
  );
}

describe('AppProvider UI session restore', () => {
  beforeEach(() => {
    mockAuthState.isAuthRequired = true;
    mockAuthState.isLoading = false;
    mockAuthState.role = 'coo';
    clearPersistedUiSession();
    window.sessionStorage.clear();
  });

  it('restores persisted UI snapshot on initial load', () => {
    savePersistedUiSession({
      currentTab: 'events',
      searchQuery: 'rozdelane',
      timelogFilter: 'draft',
      projectFilter: 'active',
      selectedContractorProfileId: null,
      selectedEventId: 12,
      selectedProjectIdForStats: null,
      selectedClientIdForStats: null,
      eventTab: 'crew',
      eventsViewMode: 'calendar',
      eventsCalendarMode: 'week',
      eventsFilter: 'all',
      eventsCalendarDate: '2026-04-23',
      editingTimelog: null,
      editingReceipt: { ...editingReceipt },
      editingProject: null,
      editingClient: null,
    });

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    expect(screen.getByTestId('currentTab')).toHaveTextContent('events');
    expect(screen.getByTestId('searchQuery')).toHaveTextContent('rozdelane');
    expect(screen.getByTestId('selectedEventId')).toHaveTextContent('12');
    expect(screen.getByTestId('eventTab')).toHaveTextContent('crew');
    expect(screen.getByTestId('editingReceiptTitle')).toHaveTextContent('Taxi');
  });

  it('does not clear restored search query on initial mount', () => {
    savePersistedUiSession({
      currentTab: 'events',
      searchQuery: 'rozdelane',
      timelogFilter: 'draft',
      projectFilter: 'active',
      selectedContractorProfileId: null,
      selectedEventId: 12,
      selectedProjectIdForStats: null,
      selectedClientIdForStats: null,
      eventTab: 'crew',
      eventsViewMode: 'calendar',
      eventsCalendarMode: 'week',
      eventsFilter: 'all',
      eventsCalendarDate: '2026-04-23',
      editingTimelog: null,
      editingReceipt: { ...editingReceipt },
      editingProject: null,
      editingClient: null,
    });

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    expect(screen.getByTestId('searchQuery')).toHaveTextContent('rozdelane');
  });

  it('saves only persisted UI fields when context changes', async () => {
    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    fireEvent.click(screen.getByText('set-events-tab'));
    fireEvent.click(screen.getByText('set-search'));
    fireEvent.click(screen.getByText('set-event-id'));
    fireEvent.click(screen.getByText('set-event-tab'));
    fireEvent.click(screen.getByText('set-editing-receipt'));
    fireEvent.click(screen.getByText('set-delete-confirm'));

    await waitFor(() => {
      expect(loadPersistedUiSession()).toMatchObject({
        currentTab: 'events',
        searchQuery: 'rozdelana prace',
        selectedEventId: 55,
        eventTab: 'crew',
        editingReceipt: expect.objectContaining({
          id: 42,
          title: 'Taxi',
        }),
      });
    });

    const rawSnapshot = window.sessionStorage.getItem('crewflow.ui-session.v2');
    expect(rawSnapshot).not.toBeNull();

    const parsedSnapshot = JSON.parse(rawSnapshot!);
    expect(parsedSnapshot.state.deleteConfirm).toBeUndefined();
  });

  it('clears search query after a real tab change', async () => {
    savePersistedUiSession({
      currentTab: 'events',
      searchQuery: 'rozdelane',
      timelogFilter: 'draft',
      projectFilter: 'active',
      selectedContractorProfileId: null,
      selectedEventId: 12,
      selectedProjectIdForStats: null,
      selectedClientIdForStats: null,
      eventTab: 'crew',
      eventsViewMode: 'calendar',
      eventsCalendarMode: 'week',
      eventsFilter: 'all',
      eventsCalendarDate: '2026-04-23',
      editingTimelog: null,
      editingReceipt: { ...editingReceipt },
      editingProject: null,
      editingClient: null,
    });

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    fireEvent.click(screen.getByText('set-dashboard-tab'));

    await waitFor(() => {
      expect(screen.getByTestId('searchQuery')).toBeEmptyDOMElement();
    });
  });

  it('normalizes non-event persisted state before saving', async () => {
    savePersistedUiSession({
      currentTab: 'dashboard',
      searchQuery: 'rozdelane',
      timelogFilter: 'draft',
      projectFilter: 'active',
      selectedContractorProfileId: null,
      selectedEventId: 12,
      selectedProjectIdForStats: null,
      selectedClientIdForStats: null,
      eventTab: 'crew',
      eventsViewMode: 'calendar',
      eventsCalendarMode: 'week',
      eventsFilter: 'all',
      eventsCalendarDate: '2026-04-23',
      editingTimelog: null,
      editingReceipt: { ...editingReceipt },
      editingProject: null,
      editingClient: null,
    });

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    await waitFor(() => {
      expect(loadPersistedUiSession()).toMatchObject({
        currentTab: 'dashboard',
        selectedEventId: null,
        eventTab: 'overview',
      });
    });
  });

  it('normalizes persisted tab against the resolved auth role before saving', async () => {
    mockAuthState.role = 'crew';

    savePersistedUiSession({
      currentTab: 'clients',
      searchQuery: 'rozdelane',
      timelogFilter: 'draft',
      projectFilter: 'active',
      selectedContractorProfileId: null,
      selectedEventId: null,
      selectedProjectIdForStats: null,
      selectedClientIdForStats: 3,
      eventTab: 'overview',
      eventsViewMode: 'list',
      eventsCalendarMode: 'week',
      eventsFilter: 'all',
      eventsCalendarDate: '2026-04-23',
      editingTimelog: null,
      editingReceipt: null,
      editingProject: null,
      editingClient: null,
    });

    render(
      <AppProvider>
        <ContextProbe />
      </AppProvider>,
    );

    await waitFor(() => {
      expect(loadPersistedUiSession()).toMatchObject({
        currentTab: 'my-shifts',
        selectedClientIdForStats: null,
      });
    });
  });

  it('defers restoring persisted tab until auth role is resolved', async () => {
    mockAuthState.isLoading = true;
    mockAuthState.role = null;

    savePersistedUiSession({
      currentTab: 'clients',
      searchQuery: 'rozdelane',
      timelogFilter: 'draft',
      projectFilter: 'active',
      selectedContractorProfileId: null,
      selectedEventId: null,
      selectedProjectIdForStats: null,
      selectedClientIdForStats: 3,
      eventTab: 'overview',
      eventsViewMode: 'list',
      eventsCalendarMode: 'week',
      eventsFilter: 'all',
      eventsCalendarDate: '2026-04-23',
      editingTimelog: null,
      editingReceipt: null,
      editingProject: null,
      editingClient: null,
    });

    render(<AuthResolutionHarness />);

    expect(screen.getByTestId('currentTab')).not.toHaveTextContent('clients');

    await waitFor(() => {
      expect(screen.getByTestId('currentTab')).toHaveTextContent('my-shifts');
    });

    expect(loadPersistedUiSession()).toMatchObject({
      currentTab: 'my-shifts',
      selectedClientIdForStats: null,
    });
  });
});
