import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import AppDataBootstrap from './AppDataBootstrap';

type SignOutResult = { error: { message: string } | null };

const bootstrapMock = vi.fn(async (_isActive?: () => boolean) => undefined);
const signInWithPasswordMock = vi.fn(async (_credentials?: { email: string; password: string }) => ({ error: null as { message: string } | null }));
const disconnectNativePushMock = vi.fn(async () => undefined);
const signOutMock = vi.fn(async (_options?: { scope?: string }): Promise<SignOutResult> => ({ error: null }));
const getSessionMock = vi.fn();
const rpcMock = vi.fn(async (_name?: string, _args?: Record<string, unknown>) => ({ data: null, error: null }));
const onAuthStateChangeMock = vi.fn((_listener?: (event: string, session: typeof mockSession | null) => void) => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));
const clearPersistedUiSessionMock = vi.fn();
const getContractorsMock = vi.fn(() => []);
const resetSupabaseDataScopeMock = vi.fn(async () => undefined);
let rolesData: Array<{ role: string }> = [];
const defaultFromImplementation = (table: string) => ({
  select: () => ({
    eq: () => (table === 'profiles'
      ? { maybeSingle: async () => ({ data: null, error: null }) }
      : Promise.resolve({ data: rolesData, error: null })),
  }),
});
const fromMock = vi.fn(defaultFromImplementation);
const mockSession = {
  user: {
    id: 'user-1',
    email: 'peetax@example.com',
  },
};

vi.mock('./initial-app-data-bootstrap', () => ({ bootstrapInitialAppData: (isActive?: () => boolean) => bootstrapMock(isActive) }));

vi.mock('../../features/notifications/native-push', () => ({ disconnectNativePush: () => disconnectNativePushMock() }));

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
    from: (...args: Parameters<typeof fromMock>) => fromMock(...args),
    rpc: (...args: Parameters<typeof rpcMock>) => rpcMock(...args),
    auth: {
      getSession: () => getSessionMock(),
      onAuthStateChange: (listener: Parameters<typeof onAuthStateChangeMock>[0]) => onAuthStateChangeMock(listener),
      signInWithPassword: (credentials: { email: string; password: string }) => signInWithPasswordMock(credentials),
      signOut: (options?: { scope?: string }) => signOutMock(options),
    },
  },
}));

vi.mock('../../context/ui-session-storage', () => ({
  clearPersistedUiSession: () => clearPersistedUiSessionMock(),
}));

const Probe = () => {
  const { role, signIn, signOut, switchRole, currentProfileId, isLoading } = useAuth();

  return (
    <>
      <div data-testid="role">{role ?? 'none'}</div><div data-testid="identity">{isLoading ? 'loading' : currentProfileId ?? 'none'}</div>
      <button onClick={() => { void switchRole('crewhead').catch(() => undefined); }}>Switch to CrewHead</button>
      <button onClick={() => { void switchRole('coo').catch(() => undefined); }}>Switch to COO</button>
      <button onClick={() => { void signIn('b@example.com', 'password').catch(() => undefined); }}>Sign in B</button>
      <button onClick={() => { void signOut().catch(() => undefined); }}>Sign out</button>
    </>
  );
};

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bootstrapMock.mockReset().mockResolvedValue(undefined);
    signInWithPasswordMock.mockReset().mockResolvedValue({ error: null });
    disconnectNativePushMock.mockReset().mockResolvedValue(undefined);
    resetSupabaseDataScopeMock.mockReset().mockResolvedValue(undefined);
    signOutMock.mockReset().mockResolvedValue({ error: null });
    rolesData = [{ role: 'coo' }];
    getSessionMock.mockResolvedValue({ data: { session: mockSession } });
    fromMock.mockReset().mockImplementation(defaultFromImplementation);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((finish) => { resolve = finish; });
    return { promise, resolve };
  };
  type ProfileResult = { data: { id: string; first_name: string; last_name: string; email: string } | null; error: { message: string } | null };
  type RolesResult = { data: Array<{ role: string }> | null; error: { message: string } | null };
  const readyProfile = (userId = 'user-1'): ProfileResult => ({
    data: { id: `profile-${userId}`, first_name: 'Ready', last_name: 'User', email: `${userId}@example.com` }, error: null,
  });
  const readyRoles: RolesResult = { data: [{ role: 'coo' }], error: null };
  const trustedView = (auth: ReturnType<typeof useAuth>) => ({
    isLoading: auth.isLoading, role: auth.role, profile: auth.profile,
    currentProfileId: auth.currentProfileId, currentUserId: auth.currentUserId, currentContractorId: auth.currentContractorId,
  });
  const mountAuthDraft = (initialFailure?: 'returned error' | 'rejection') => {
    let listener!: (event: string, session: typeof mockSession | null) => void;
    onAuthStateChangeMock.mockImplementationOnce((next) => { listener = next!; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    const profileRead = vi.fn<(userId: string) => Promise<ProfileResult>>().mockImplementation(async (userId) => readyProfile(userId));
    const roleRead = vi.fn<(userId: string) => Promise<RolesResult>>().mockResolvedValue(readyRoles);
    if (initialFailure === 'returned error') profileRead.mockResolvedValueOnce({ ...readyProfile(), error: { message: 'offline' } });
    if (initialFailure === 'rejection') profileRead.mockRejectedValueOnce(new Error('offline'));
    fromMock.mockImplementation((table) => ({ select: () => ({ eq: (_field: string, userId: string) => table === 'profiles'
      ? { maybeSingle: () => profileRead(userId) }
      : roleRead(userId) }) }) as ReturnType<typeof fromMock>);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)', media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    let auth!: ReturnType<typeof useAuth>;
    function Metadata() { auth = useAuth(); return <Probe />; }
    function OperationalDraft() {
      const [draft, setDraft] = React.useState('');
      return <input aria-label="Operational draft" value={draft} onChange={(event) => setDraft(event.target.value)} />;
    }
    render(<AuthProvider><Metadata /><AppDataBootstrap><OperationalDraft /></AppDataBootstrap></AuthProvider>);
    return { listener, profileRead, roleRead, auth: () => auth };
  };
  const mountReadyDraft = async () => {
    const test = mountAuthDraft();
    const input = await screen.findByLabelText('Operational draft');
    fireEvent.change(input, { target: { value: 'private unsaved hours' } });
    return { ...test, input };
  };

  it.each([
    ['initial', 'returned error'], ['initial', 'rejection'],
    ['new identity', 'returned error'], ['new identity', 'rejection'],
  ] as const)('keeps %s metadata %s masked and retries without another password sign-in', async (stage, failure) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const test = stage === 'initial' ? mountAuthDraft(failure) : await mountReadyDraft();
    const userId = stage === 'initial' ? 'user-1' : 'user-B';
    if (stage === 'new identity') {
      if (failure === 'returned error') test.profileRead.mockResolvedValueOnce({ ...readyProfile(userId), error: { message: 'offline' } });
      else test.profileRead.mockRejectedValueOnce(new Error('offline'));
      await act(async () => { test.listener('SIGNED_IN', { user: { id: userId, email: 'b@example.com' } }); });
    }
    expect(await screen.findByRole('alert')).toHaveTextContent('Data aplikace se nepodařilo načíst.');
    expect(screen.queryByLabelText('Operational draft')).not.toBeInTheDocument();
    expect(test.auth().role).toBeNull();
    expect(test.auth().currentProfileId).toBeNull();
    expect(bootstrapMock).toHaveBeenCalledTimes(stage === 'initial' ? 0 : 1);
    const profile = deferred<ProfileResult>(); const roles = deferred<RolesResult>();
    test.profileRead.mockReturnValueOnce(profile.promise); test.roleRead.mockReturnValueOnce(roles.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
    await waitFor(() => expect(test.profileRead).toHaveBeenLastCalledWith(userId));
    expect(test.auth().isLoading).toBe(true);
    expect(screen.queryByLabelText('Operational draft')).not.toBeInTheDocument();
    await act(async () => { profile.resolve(readyProfile(userId)); roles.resolve({ data: [{ role: 'crew' }], error: null }); });
    expect(await screen.findByLabelText('Operational draft')).toHaveValue('');
    expect(test.auth().currentProfileId).toBe(`profile-${userId}`);
    expect(test.auth().role).toBe('crew');
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('ignores a late A metadata retry after B is authenticated', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const test = mountAuthDraft('rejection');
    await screen.findByRole('alert');
    const profile = deferred<ProfileResult>(); const roles = deferred<RolesResult>();
    test.profileRead.mockReturnValueOnce(profile.promise); test.roleRead.mockReturnValueOnce(roles.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
    await act(async () => { test.listener('SIGNED_IN', { user: { id: 'user-B', email: 'b@example.com' } }); });
    const input = await screen.findByLabelText('Operational draft');
    fireEvent.change(input, { target: { value: 'B draft' } });
    await act(async () => { profile.resolve(readyProfile()); roles.resolve({ data: [{ role: 'crew' }], error: null }); });
    expect(test.auth().currentUserId).toBe('user-B');
    expect(test.auth().currentProfileId).toBe('profile-user-B');
    expect(input).toHaveValue('B draft');
  });

  it('keeps a genuine sign-out from a metadata error signed out during a captured retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const test = mountAuthDraft('rejection');
    await screen.findByRole('alert');
    const retry = test.auth().retryAuthMetadata;
    const reads = test.profileRead.mock.calls.length;
    await act(async () => { test.listener('SIGNED_OUT', null); });
    await act(async () => { await retry(); });
    expect(test.auth().isAuthenticated).toBe(false);
    expect(test.auth().role).toBeNull();
    expect(test.profileRead).toHaveBeenCalledTimes(reads);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Operational draft')).not.toBeInTheDocument();
  });

  it.each(['SIGNED_IN', 'TOKEN_REFRESHED'])('preserves the ready view and dirty child during same-user %s metadata refresh', async (event) => {
    const test = await mountReadyDraft();
    const trusted = trustedView(test.auth());
    const profile = deferred<ProfileResult>(); const roles = deferred<RolesResult>();
    test.profileRead.mockReturnValueOnce(profile.promise); test.roleRead.mockReturnValueOnce(roles.promise);
    await act(async () => { test.listener(event, mockSession); });
    expect(trustedView(test.auth())).toEqual(trusted);
    expect(screen.getByLabelText('Operational draft')).toBe(test.input);
    expect(test.input).toHaveValue('private unsaved hours');
    await act(async () => {
      profile.resolve({ ...readyProfile(), data: { ...readyProfile().data!, first_name: 'Updated' } });
      roles.resolve(readyRoles);
    });
    expect(test.auth().profile?.firstName).toBe('Updated');
    expect(screen.getByLabelText('Operational draft')).toBe(test.input);
    expect(test.input).toHaveValue('private unsaved hours');
    expect(bootstrapMock).toHaveBeenCalledTimes(1);
    expect(resetSupabaseDataScopeMock).not.toHaveBeenCalled();
  });

  it.each(['returned error', 'rejection'])('retains the trusted same-user draft when background metadata reads fail with %s', async (failure) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const test = await mountReadyDraft();
    const trusted = trustedView(test.auth());
    if (failure === 'returned error') {
      test.profileRead.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
      test.roleRead.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    } else {
      test.profileRead.mockRejectedValueOnce(new Error('offline'));
      test.roleRead.mockRejectedValueOnce(new Error('offline'));
    }
    await act(async () => { test.listener('TOKEN_REFRESHED', mockSession); });
    expect(trustedView(test.auth())).toEqual(trusted);
    expect(screen.getByLabelText('Operational draft')).toBe(test.input);
    expect(test.input).toHaveValue('private unsaved hours');
    expect(bootstrapMock).toHaveBeenCalledTimes(1);
  });

  it('ignores older background metadata while retaining the newest ready draft', async () => {
    const test = await mountReadyDraft();
    const oldProfile = deferred<ProfileResult>(); const oldRoles = deferred<RolesResult>();
    test.profileRead.mockReturnValueOnce(oldProfile.promise); test.roleRead.mockReturnValueOnce(oldRoles.promise);
    await act(async () => { test.listener('TOKEN_REFRESHED', mockSession); });
    test.profileRead.mockResolvedValueOnce({ ...readyProfile(), data: { ...readyProfile().data!, first_name: 'Newest' } });
    await act(async () => { test.listener('SIGNED_IN', mockSession); });
    await act(async () => { oldProfile.resolve(readyProfile()); oldRoles.resolve({ data: [{ role: 'crew' }], error: null }); });
    expect(test.auth().profile?.firstName).toBe('Newest');
    expect(test.auth().role).toBe('coo');
    expect(screen.getByLabelText('Operational draft')).toBe(test.input);
    expect(test.input).toHaveValue('private unsaved hours');
    expect(bootstrapMock).toHaveBeenCalledTimes(1);
  });

  it.each(['role', 'profile identity'] as const)('retires the dirty child when a background read resolves a changed %s', async (change) => {
    const test = await mountReadyDraft();
    const profile = deferred<ProfileResult>(); const roles = deferred<RolesResult>();
    const bootstrap = deferred<void>();
    test.profileRead.mockReturnValueOnce(profile.promise); test.roleRead.mockReturnValueOnce(roles.promise);
    await act(async () => { test.listener('TOKEN_REFRESHED', mockSession); });
    expect(screen.getByLabelText('Operational draft')).toBe(test.input);
    bootstrapMock.mockReturnValueOnce(bootstrap.promise);
    await act(async () => {
      profile.resolve(change === 'profile identity' ? { ...readyProfile(), data: { ...readyProfile().data!, id: 'new-profile-identity' } } : readyProfile());
      roles.resolve(change === 'role' ? { data: [{ role: 'crewhead' }], error: null } : readyRoles);
    });
    await waitFor(() => expect(bootstrapMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText('Operational draft')).not.toBeInTheDocument();
    await act(async () => { bootstrap.resolve(); });
    expect(await screen.findByLabelText('Operational draft')).toHaveValue('');
  });

  it('masks a ready A draft immediately while metadata for a new B identity is pending', async () => {
    const test = await mountReadyDraft();
    const profile = deferred<ProfileResult>(); const roles = deferred<RolesResult>();
    test.profileRead.mockReturnValueOnce(profile.promise); test.roleRead.mockReturnValueOnce(roles.promise);
    await act(async () => { test.listener('SIGNED_IN', { user: { id: 'user-B', email: 'b@example.com' } }); });
    expect(test.auth().isLoading).toBe(true);
    expect(test.auth().role).toBeNull();
    expect(test.auth().profile).toBeNull();
    expect(test.auth().currentProfileId).toBeNull();
    expect(screen.queryByLabelText('Operational draft')).not.toBeInTheDocument();
    await act(async () => { profile.resolve(readyProfile('user-B')); roles.resolve(readyRoles); });
    expect(await screen.findByLabelText('Operational draft')).toHaveValue('');
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

  it.each(['crew', 'crewhead', 'coo'])('does not let a real %s session change its server role', async (initialRole) => {
    rolesData = [{ role: initialRole }];
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent(initialRole));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: initialRole === 'crewhead' ? 'Switch to COO' : 'Switch to CrewHead' }));
    });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('role')).toHaveTextContent(initialRole);
    expect(resetSupabaseDataScopeMock).not.toHaveBeenCalled();
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
    expect(clearPersistedUiSessionMock).toHaveBeenCalled();
    expect(clearPersistedUiSessionMock.mock.invocationCallOrder[0]).toBeLessThan(resetSupabaseDataScopeMock.mock.invocationCallOrder[0]);
    await act(async () => finishA({ data: { id: 'private-A', first_name: 'Private A' }, error: null }));
    expect(screen.getByTestId('identity')).toHaveTextContent('profile-B');
  });

  it.each(['push disconnect', 'auth signout', 'scope reset'] as const)('does not retire B when A logout resumes after %s', async (pauseAt) => {
    let listener!: (event: string, session: typeof mockSession | null) => void;
    onAuthStateChangeMock.mockImplementationOnce((next) => { listener = next!; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    fromMock.mockImplementation((table) => ({ select: () => ({ eq: (_field: string, userId: string) => table === 'profiles'
      ? { maybeSingle: async () => ({ data: { id: `profile-${userId}`, first_name: userId }, error: null }) }
      : Promise.resolve({ data: [{ role: 'crew' }], error: null }) }) }) as ReturnType<typeof fromMock>);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('identity')).toHaveTextContent('profile-user-1'));
    let finish!: () => void;
    const paused = new Promise<void>((resolve) => { finish = resolve; });
    if (pauseAt === 'push disconnect') disconnectNativePushMock.mockReturnValueOnce(paused);
    else if (pauseAt === 'auth signout') signOutMock.mockReturnValueOnce(paused.then(() => ({ error: null })));
    else resetSupabaseDataScopeMock.mockReturnValueOnce(paused);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(pauseAt === 'push disconnect' ? disconnectNativePushMock : pauseAt === 'auth signout' ? signOutMock : resetSupabaseDataScopeMock).toHaveBeenCalled());
    await act(async () => { listener('SIGNED_IN', { user: { id: 'user-B', email: 'b@example.com' } }); });
    await waitFor(() => expect(screen.getByTestId('identity')).toHaveTextContent('profile-user-B'));
    clearPersistedUiSessionMock.mockClear();
    resetSupabaseDataScopeMock.mockClear();
    await act(async () => { finish(); await Promise.resolve(); });
    expect(screen.getByTestId('identity')).toHaveTextContent('profile-user-B');
    expect(screen.getByTestId('role')).toHaveTextContent('crew');
    expect(clearPersistedUiSessionMock).not.toHaveBeenCalled();
    expect(resetSupabaseDataScopeMock).not.toHaveBeenCalled();
    if (pauseAt === 'push disconnect') expect(signOutMock).not.toHaveBeenCalled();
  });

  it('uses a public app Web Lock for same-origin account transitions when available', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'locks');
    const request = vi.fn(async (_name: string, transition: () => Promise<void>) => transition());
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
    try {
      render(<AuthProvider><Probe /></AuthProvider>);
      fireEvent.click(screen.getByRole('button', { name: 'Sign in B' }));
      await waitFor(() => expect(signInWithPasswordMock).toHaveBeenCalled());
      expect(request).toHaveBeenCalledWith('crewflow.auth-transition', expect.any(Function));
    } finally {
      if (original) Object.defineProperty(navigator, 'locks', original);
      else Reflect.deleteProperty(navigator, 'locks');
    }
  });

  it('queues B sign-in until the SDK finishes A logout and its late SIGNED_OUT event', async () => {
    let listener!: (event: string, session: typeof mockSession | null) => void;
    onAuthStateChangeMock.mockImplementationOnce((next) => { listener = next!; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    fromMock.mockImplementation((table) => ({ select: () => ({ eq: (_field: string, userId: string) => table === 'profiles'
      ? { maybeSingle: async () => ({ data: { id: `profile-${userId}` }, error: null }) }
      : Promise.resolve({ data: [{ role: 'crew' }], error: null }) }) }) as ReturnType<typeof fromMock>);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('identity')).toHaveTextContent('profile-user-1'));
    let completeSDKLogout!: () => void;
    const order: string[] = [];
    signOutMock.mockImplementationOnce(() => new Promise((resolve) => {
      order.push('logout-start');
      completeSDKLogout = () => {
        order.push('logout-signed-out');
        listener('SIGNED_OUT', null);
        resolve({ error: null });
      };
    }));
    signInWithPasswordMock.mockImplementationOnce(async () => {
      order.push('signin-B');
      listener('SIGNED_IN', { user: { id: 'user-B', email: 'b@example.com' } });
      return { error: null };
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(completeSDKLogout).toBeTypeOf('function'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in B' }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { completeSDKLogout(); });
    await waitFor(() => expect(signInWithPasswordMock).toHaveBeenCalled());
    expect(screen.getByTestId('identity')).toHaveTextContent('profile-user-B');
    expect(order).toEqual(['logout-start', 'logout-signed-out', 'signin-B']);
    await act(async () => { listener('SIGNED_OUT', null); });
    expect(screen.getByTestId('identity')).toHaveTextContent('none');
    expect(screen.getByTestId('role')).toHaveTextContent('none');
  });

  it('does not start a queued sign-in after its provider unmounts', async () => {
    let finish!: (result: SignOutResult) => void;
    signOutMock.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const view = render(<AuthProvider><Probe /></AuthProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Sign in B' }));
    view.unmount();
    await act(async () => { finish({ error: null }); });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
  });

  it('completes logout when its own SIGNED_OUT event retires the session metadata', async () => {
    let listener!: (event: string, session: typeof mockSession | null) => void;
    onAuthStateChangeMock.mockImplementationOnce((next) => { listener = next!; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    fromMock.mockImplementation((table) => ({ select: () => ({ eq: () => table === 'profiles'
      ? { maybeSingle: async () => ({ data: { id: 'profile-A' }, error: null }) }
      : Promise.resolve({ data: [{ role: 'crew' }], error: null }) }) }) as ReturnType<typeof fromMock>);
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('identity')).toHaveTextContent('profile-A'));
    signOutMock.mockImplementationOnce(async () => { listener('SIGNED_OUT', null); return { error: null }; });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getByTestId('role')).toHaveTextContent('none'));
    expect(screen.getByTestId('identity')).toHaveTextContent('none');
    expect(clearPersistedUiSessionMock).toHaveBeenCalled();
  });

  it.each(['new identity', 'logout'] as const)('ignores an initial session result that finishes after %s', async (newerAction) => {
    let finishInitial!: (result: { data: { session: typeof mockSession } }) => void;
    getSessionMock.mockReturnValueOnce(new Promise((resolve) => { finishInitial = resolve; }));
    let listener!: (event: string, session: typeof mockSession | null) => void;
    onAuthStateChangeMock.mockImplementationOnce((next) => { listener = next!; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    fromMock.mockImplementation((table) => ({ select: () => ({ eq: (_field: string, userId: string) => table === 'profiles'
      ? { maybeSingle: async () => ({ data: { id: `profile-${userId}` }, error: null }) }
      : Promise.resolve({ data: [{ role: 'crew' }], error: null }) }) }) as ReturnType<typeof fromMock>);
    render(<AuthProvider><Probe /></AuthProvider>);
    if (newerAction === 'new identity') {
      await act(async () => { listener('SIGNED_IN', { user: { id: 'user-B', email: 'b@example.com' } }); });
      await waitFor(() => expect(screen.getByTestId('identity')).toHaveTextContent('profile-user-B'));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      await waitFor(() => expect(clearPersistedUiSessionMock).toHaveBeenCalled());
    }
    await act(async () => { finishInitial({ data: { session: mockSession } }); });
    expect(screen.getByTestId('identity')).toHaveTextContent(newerAction === 'new identity' ? 'profile-user-B' : 'none');
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
