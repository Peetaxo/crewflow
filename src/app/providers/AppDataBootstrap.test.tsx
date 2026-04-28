import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppDataBootstrap from './AppDataBootstrap';

const mockAuthState = {
  isAuthRequired: true,
  isAuthenticated: true,
};

const mocks = vi.hoisted(() => ({
  resetSupabaseClientsHydration: vi.fn(),
  resetSupabaseProjectsHydration: vi.fn(),
  resetSupabaseEventsHydration: vi.fn(),
  resetSupabaseCrewHydration: vi.fn(),
  resetSupabaseReceiptsHydration: vi.fn(),
  resetSupabaseTimelogsHydration: vi.fn(),
  resetSupabaseInvoicesHydration: vi.fn(),
  resetSupabaseCandidatesHydration: vi.fn(),
  resetSupabaseFleetHydration: vi.fn(),
  updateLocalAppState: vi.fn(),
}));

vi.mock('../../lib/app-config', () => ({
  appDataSource: 'supabase',
}));

vi.mock('../../lib/app-data', () => ({
  getLocalAppData: () => ({ marker: 'local-data' }),
  updateLocalAppState: mocks.updateLocalAppState,
}));

vi.mock('../../features/clients/services/clients.service', () => ({ resetSupabaseClientsHydration: mocks.resetSupabaseClientsHydration }));
vi.mock('../../features/projects/services/projects.service', () => ({ resetSupabaseProjectsHydration: mocks.resetSupabaseProjectsHydration }));
vi.mock('../../features/events/services/events.service', () => ({ resetSupabaseEventsHydration: mocks.resetSupabaseEventsHydration }));
vi.mock('../../features/crew/services/crew.service', () => ({ resetSupabaseCrewHydration: mocks.resetSupabaseCrewHydration }));
vi.mock('../../features/receipts/services/receipts.service', () => ({ resetSupabaseReceiptsHydration: mocks.resetSupabaseReceiptsHydration }));
vi.mock('../../features/timelogs/services/timelogs.service', () => ({ resetSupabaseTimelogsHydration: mocks.resetSupabaseTimelogsHydration }));
vi.mock('../../features/invoices/services/invoices.service', () => ({ resetSupabaseInvoicesHydration: mocks.resetSupabaseInvoicesHydration }));
vi.mock('../../features/recruitment/services/candidates.service', () => ({ resetSupabaseCandidatesHydration: mocks.resetSupabaseCandidatesHydration }));
vi.mock('../../features/fleet/services/fleet.service', () => ({ resetSupabaseFleetHydration: mocks.resetSupabaseFleetHydration }));

vi.mock('./useAuth', () => ({
  useAuth: () => mockAuthState,
}));

describe('AppDataBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.isAuthRequired = true;
    mockAuthState.isAuthenticated = true;
  });

  it('resets Supabase hydration state after authentication so pre-login empty loads cannot stick', () => {
    render(<AppDataBootstrap />);

    expect(mocks.resetSupabaseClientsHydration).toHaveBeenCalledTimes(1);
    expect(mocks.resetSupabaseProjectsHydration).toHaveBeenCalledTimes(1);
    expect(mocks.resetSupabaseEventsHydration).toHaveBeenCalledTimes(1);
    expect(mocks.resetSupabaseCrewHydration).toHaveBeenCalledTimes(1);
    expect(mocks.resetSupabaseReceiptsHydration).toHaveBeenCalledTimes(1);
    expect(mocks.resetSupabaseTimelogsHydration).toHaveBeenCalledTimes(1);
    expect(mocks.resetSupabaseInvoicesHydration).toHaveBeenCalledTimes(1);
    expect(mocks.resetSupabaseCandidatesHydration).toHaveBeenCalledTimes(1);
    expect(mocks.resetSupabaseFleetHydration).toHaveBeenCalledTimes(1);
    expect(mocks.updateLocalAppState).not.toHaveBeenCalled();
  });

  it('resets local app data while waiting for authentication', () => {
    mockAuthState.isAuthenticated = false;

    render(<AppDataBootstrap />);

    expect(mocks.resetSupabaseCrewHydration).toHaveBeenCalledTimes(1);
    expect(mocks.updateLocalAppState).toHaveBeenCalledTimes(1);
  });
});
