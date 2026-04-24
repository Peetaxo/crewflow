import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

const signOutMock = vi.fn(async () => ({ error: null }));
const getSessionMock = vi.fn();
const onAuthStateChangeMock = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));
const clearPersistedUiSessionMock = vi.fn();
const fromMock = vi.fn((table: string) => ({
  select: () => ({
    eq: () => (table === 'profiles'
      ? { maybeSingle: async () => ({ data: null, error: null }) }
      : Promise.resolve({ data: [], error: null })),
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
  getContractors: () => [],
  subscribeToCrewChanges: () => () => {},
}));

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    auth: {
      getSession: () => getSessionMock(),
      onAuthStateChange: (...args: unknown[]) => onAuthStateChangeMock(...args),
      signOut: () => signOutMock(),
    },
  },
}));

vi.mock('../../context/ui-session-storage', () => ({
  clearPersistedUiSession: () => clearPersistedUiSessionMock(),
}));

const Probe = () => {
  const { signOut } = useAuth();

  return <button onClick={() => { void signOut(); }}>Sign out</button>;
};

describe('AuthProvider signOut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });
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
});
