import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

type SignOutResult = { error: { message: string } | null };

const signOutMock = vi.fn(async (_options?: { scope?: string }): Promise<SignOutResult> => ({ error: null }));
const getSessionMock = vi.fn();
const rpcMock = vi.fn(async () => ({ data: null, error: null }));
const onAuthStateChangeMock = vi.fn((_listener?: (event: string, session: typeof mockSession | null) => void) => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));
const clearPersistedUiSessionMock = vi.fn();
const getContractorsMock = vi.fn(() => []);
const resetSupabaseDataScopeMock = vi.fn(async () => undefined);
let rolesData: Array<{ role: string }> = [];
const fromMock = vi.fn((table: string) => ({
  select: () => ({
    eq: () => (table === 'profiles'
      ? { maybeSingle: async () => ({ data: null, error: null }) }
      : Promise.resolve({ data: rolesData, error: null })),
  }),
}));
const mockSession = {
  user: {
    id: 'user-1',
    email: 'peetax@example.com',
  },
};

vi.mock('../../lib/app-config', () => ({
  appDataSource: 'supabase',
}));

vi.mock('../../features/crew/services/crew.service', () => ({
  getContractors: () => getContractorsMock(),
  resetSupabaseCrewHydration: vi.fn(),
  subscribeToCrewChanges: () => () => {},
}));

vi.mock('./reset-supabase-data-scope', () => ({
  resetSupabaseDataScope: () => resetSupabaseDataScopeMock(),
}));

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
    auth: {
      getSession: () => getSessionMock(),
      onAuthStateChange: (listener: Parameters<typeof onAuthStateChangeMock>[0]) => onAuthStateChangeMock(listener),
      signOut: (options?: { scope?: string }) => signOutMock(options),
    },
  },
}));

vi.mock('../../context/ui-session-storage', () => ({
  clearPersistedUiSession: () => clearPersistedUiSessionMock(),
}));

const Probe = () => {
  const { role, signOut, switchRole, currentProfileId, isLoading } = useAuth();

  return (
    <>
      <div data-testid="role">{role ?? 'none'}</div><div data-testid="identity">{isLoading ? 'loading' : currentProfileId ?? 'none'}</div>
      <button onClick={() => { void switchRole('crewhead').catch(() => undefined); }}>Switch to CrewHead</button>
      <button onClick={() => { void signOut().catch(() => undefined); }}>Sign out</button>
    </>
  );
};

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rolesData = [{ role: 'coo' }];
    getSessionMock.mockResolvedValue({ data: { session: mockSession } });
    fromMock.mockClear();
  });

  it('clears persisted UI session before signing out', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(clearPersistedUiSessionMock).toHaveBeenCalledTimes(1);
      expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    });
  });

  it('keeps persisted UI session when Supabase rejects sign out', async () => {
    signOutMock.mockResolvedValueOnce({ error: { message: 'network unavailable' } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('coo');
    });
    clearPersistedUiSessionMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    });
    expect(clearPersistedUiSessionMock).not.toHaveBeenCalled();
  });

  it('clears persisted UI session when there is no active session', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(clearPersistedUiSessionMock).toHaveBeenCalledTimes(1);
    });
  });

  it('persists role switches through the authenticated role RPC', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('coo');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch to CrewHead' }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('set_current_user_role', { p_role: 'crewhead' });
      expect(screen.getByTestId('role')).toHaveTextContent('crewhead');
      expect(resetSupabaseDataScopeMock).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps the previous role and data scope when the role RPC fails', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'role conflict' } });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('coo');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch to CrewHead' }));

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('set_current_user_role', { p_role: 'crewhead' });
      expect(screen.getByTestId('role')).toHaveTextContent('coo');
      expect(resetSupabaseDataScopeMock).not.toHaveBeenCalled();
    });
  });
  it('retires owner scope synchronously and discards a late old-session profile', async () => {
    let listener!: (event: string, session: typeof mockSession | null) => void;
    let finishA!: (value: unknown) => void;
    onAuthStateChangeMock.mockImplementationOnce((next) => { listener = next!; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    fromMock.mockImplementation((table) => ({ select: () => ({ eq: (_field: string, userId: string) => table === 'profiles'
      ? { maybeSingle: () => userId === 'user-1' ? new Promise((resolve) => { finishA = resolve; }) : Promise.resolve({ data: { id: 'profile-B', first_name: 'B' }, error: null }) }
      : Promise.resolve({ data: [{ role: 'crew' }], error: null }) }) }) as ReturnType<typeof fromMock>);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(finishA).toBeTypeOf('function'));
    await act(async () => { listener('SIGNED_IN', { user: { id: 'user-B', email: 'b@example.com' } }); });
    await waitFor(() => expect(screen.getByTestId('identity')).toHaveTextContent('profile-B'));
    expect(resetSupabaseDataScopeMock).toHaveBeenCalled();
    await act(async () => finishA({ data: { id: 'private-A', first_name: 'Private A' }, error: null }));
    expect(screen.getByTestId('identity')).toHaveTextContent('profile-B');
  });

  it('does not restore a late loading owner after successful explicit sign out', async () => {
    let finish!: (value: unknown) => void;
    fromMock.mockImplementation((table) => ({ select: () => ({ eq: () => table === 'profiles'
      ? { maybeSingle: () => new Promise((resolve) => { finish = resolve; }) }
      : Promise.resolve({ data: [{ role: 'crew' }], error: null }) }) }) as ReturnType<typeof fromMock>);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(clearPersistedUiSessionMock).toHaveBeenCalled());
    await act(async () => finish({ data: { id: 'old-private-profile' }, error: null }));
    expect(screen.getByTestId('role')).toHaveTextContent('none');
    expect(screen.getByTestId('identity')).not.toHaveTextContent('old-private-profile');
  });

});
