import { useContext, useLayoutEffect, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextType } from '../../app/providers/auth-context';
import CrewGettingStartedGate from './CrewGettingStartedGate';
import { CrewGettingStartedContext } from './CrewGettingStartedContext';

const state = vi.hoisted(() => ({
  auth: {} as AuthContextType,
  role: 'crew',
  dataSource: 'supabase',
  setCurrentTab: vi.fn(),
  mutation: vi.fn(),
}));
const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
vi.mock('../../app/providers/useAuth', () => ({ useAuth: () => state.auth }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ role: state.role, darkMode: false, setCurrentTab: state.setCurrentTab }) }));
vi.mock('../../lib/app-config', () => ({ get appDataSource() { return state.dataSource; } }));

const genuineCrew = (id = firstId) => ({
  isAuthenticated: true, isAuthRequired: true, isLoading: false, isDevSession: false, isRoleSwitching: false,
  currentUserId: id, role: 'crew', user: { id, is_anonymous: false },
  session: { user: { id, is_anonymous: false }, access_token: 'private-test-session' },
  signIn: state.mutation, signOut: state.mutation, switchRole: state.mutation,
}) as unknown as AuthContextType;
const subject = () => <CrewGettingStartedGate><div>Obsah aplikace</div></CrewGettingStartedGate>;
function StatefulAppContent() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((value) => value + 1)}>Rozpracováno {count}</button>;
}
function GuideControlProbe({ capture }: { capture: (open: (() => void) | null) => void }) {
  const controls = useContext(CrewGettingStartedContext);
  useLayoutEffect(() => { capture(controls?.openGuide ?? null); }, [capture, controls]);
  return <StatefulAppContent />;
}
const guide = () => screen.queryByRole('heading', { name: 'Jak používat nodu' });

describe('Crew first-use guide boundary', () => {
  beforeEach(() => {
    state.auth = genuineCrew();
    state.role = 'crew';
    state.dataSource = 'supabase';
    state.setCurrentTab.mockReset();
    state.mutation.mockReset();
    window.localStorage.clear();
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true');
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('explains all three steps and leaves profile and billing optional', () => {
    render(subject());
    expect(guide()).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText(/Přihláška ještě není potvrzená směna/)).toBeInTheDocument();
    expect(screen.getByText(/odpracované hodiny a účtenky/)).toBeInTheDocument();
    expect(screen.getByText(/Profil a fakturační údaje můžeš doplnit později/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Přeskočit' })).toHaveClass('min-h-11');
    expect(screen.getByRole('button', { name: 'Zobrazit směny' })).toHaveClass('min-h-11');
  });

  it.each(['http://127.0.0.1:55431', 'http://localhost:55431/', 'http://[::1]:55431'])('allows the dedicated loopback API %s', (url) => {
    vi.stubEnv('VITE_SUPABASE_URL', url);
    render(subject());
    expect(guide()).toBeInTheDocument();
  });

  it.each([
    ['flag off', () => vi.stubEnv('VITE_ONBOARDING_ENABLED', 'false')],
    ['local data', () => { state.dataSource = 'local'; }],
    ['shared API', () => vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')],
    ['ordinary local API', () => vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')],
    ['API path', () => vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431/rest/v1')],
    ['API query', () => vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431?x=1')],
    ['API trailing newline', () => vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431\n')],
    ['API credentials', () => vi.stubEnv('VITE_SUPABASE_URL', 'http://user@127.0.0.1:55431')],
    ['API fragment', () => vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55431#x')],
    ['unauthenticated', () => { state.auth.isAuthenticated = false; }],
    ['preview', () => { state.auth.isAuthRequired = false; }],
    ['dev session', () => { state.auth.isDevSession = true; }],
    ['loading', () => { state.auth.isLoading = true; }],
    ['role switching', () => { state.auth.isRoleSwitching = true; }],
    ['manager', () => { state.auth.role = 'coo'; state.role = 'coo'; }],
    ['crewhead', () => { state.auth.role = 'crewhead'; state.role = 'crewhead'; }],
    ['app role mismatch', () => { state.role = 'coo'; }],
    ['no UUID', () => { state.auth.currentUserId = 'preview-user'; }],
    ['user mismatch', () => { state.auth.user = { ...state.auth.user!, id: secondId }; }],
    ['session mismatch', () => { state.auth.session = { ...state.auth.session!, user: { ...state.auth.session!.user, id: secondId } }; }],
    ['no session', () => { state.auth.session = null; }],
    ['no access token', () => { state.auth.session = { ...state.auth.session!, access_token: '' }; }],
    ['anonymous user', () => { state.auth.user = { ...state.auth.user!, is_anonymous: true }; }],
    ['anonymous session', () => { state.auth.session = { ...state.auth.session!, user: { ...state.auth.session!.user, is_anonymous: true } }; }],
  ] as const)('leaves the application accessible for %s', (_name, change) => {
    change();
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    render(subject());
    expect(guide()).not.toBeInTheDocument();
    expect(screen.getByText('Obsah aplikace')).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['disabled', 'management'] as const)('preserves existing app state across role changes when the guide is %s', (mode) => {
    if (mode === 'disabled') vi.stubEnv('VITE_ONBOARDING_ENABLED', 'false');
    else { state.auth.role = 'coo'; state.role = 'coo'; }
    const view = render(<CrewGettingStartedGate><StatefulAppContent /></CrewGettingStartedGate>);
    fireEvent.click(screen.getByRole('button', { name: 'Rozpracováno 0' }));
    state.auth.role = 'crewhead'; state.role = 'crewhead';
    view.rerender(<CrewGettingStartedGate><StatefulAppContent /></CrewGettingStartedGate>);
    expect(screen.getByRole('button', { name: 'Rozpracováno 1' })).toBeInTheDocument();
  });

  it.each(['loading', 'role switching'] as const)('preserves a dismissed crew app draft through a same-account %s cycle', (change) => {
    const app = () => <CrewGettingStartedGate><StatefulAppContent /></CrewGettingStartedGate>;
    const view = render(app());
    fireEvent.click(screen.getByRole('button', { name: 'Přeskočit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rozpracováno 0' }));
    if (change === 'loading') { state.auth.isLoading = true; state.auth.role = null; }
    else state.auth.isRoleSwitching = true;
    view.rerender(app());
    expect(screen.getByRole('button', { name: 'Rozpracováno 1' })).toBeInTheDocument();
    state.auth = genuineCrew();
    view.rerender(app());
    expect(screen.getByRole('button', { name: 'Rozpracováno 1' })).toBeInTheDocument();
    expect(guide()).not.toBeInTheDocument();
  });

  it('preserves an operational draft when the same guide is reopened and closed', () => {
    window.localStorage.setItem(`nodu:crew-getting-started:v1:${firstId}`, 'dismissed');
    let openGuide: (() => void) | null = null;
    render(<CrewGettingStartedGate><GuideControlProbe capture={(open) => { openGuide = open; }} /></CrewGettingStartedGate>);
    fireEvent.click(screen.getByRole('button', { name: 'Rozpracováno 0' }));
    act(() => openGuide?.());
    expect(guide()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rozpracováno 1' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zpět do nastavení' }));
    expect(screen.getByRole('button', { name: 'Rozpracováno 1' })).toBeInTheDocument();
  });

  it.each(['loading', 'role switching', 'account change'] as const)('invalidates captured reopen controls through %s', (change) => {
    window.localStorage.setItem(`nodu:crew-getting-started:v1:${firstId}`, 'dismissed');
    window.localStorage.setItem(`nodu:crew-getting-started:v1:${secondId}`, 'dismissed');
    let openGuide: (() => void) | null = null;
    const capture = (open: (() => void) | null) => { openGuide = open; };
    const app = () => <CrewGettingStartedGate><GuideControlProbe capture={capture} /></CrewGettingStartedGate>;
    const view = render(app());
    const staleOpenGuide = openGuide;
    if (change === 'loading') { state.auth.isLoading = true; state.auth.role = null; }
    if (change === 'role switching') state.auth.isRoleSwitching = true;
    if (change === 'account change') state.auth = genuineCrew(secondId);
    view.rerender(app());
    act(() => staleOpenGuide?.());
    expect(guide()).not.toBeInTheDocument();
    if (change !== 'account change') { state.auth = genuineCrew(); view.rerender(app()); }
    act(() => staleOpenGuide?.());
    expect(guide()).not.toBeInTheDocument();
    act(() => openGuide?.());
    expect(guide()).toBeInTheDocument();
    expect(state.setCurrentTab).not.toHaveBeenCalled();
    expect(state.mutation).not.toHaveBeenCalled();
  });

  it('skips without navigation and persists only an account-scoped versioned preference', () => {
    const first = render(subject());
    fireEvent.click(screen.getByRole('button', { name: 'Přeskočit' }));
    expect(screen.getByText('Obsah aplikace')).toBeInTheDocument();
    expect(state.setCurrentTab).not.toHaveBeenCalled();
    expect(state.mutation).not.toHaveBeenCalled();
    expect(Object.entries(window.localStorage)).toEqual([[`nodu:crew-getting-started:v1:${firstId}`, 'dismissed']]);
    first.unmount();
    render(subject());
    expect(guide()).not.toBeInTheDocument();
  });

  it('continues to My Shifts without an Auth or data mutation', () => {
    render(subject());
    fireEvent.click(screen.getByRole('button', { name: 'Zobrazit směny' }));
    expect(state.setCurrentTab).toHaveBeenCalledExactlyOnceWith('my-shifts');
    expect(screen.getByText('Obsah aplikace')).toBeInTheDocument();
    expect(state.mutation).not.toHaveBeenCalled();
  });

  it('resets on account changes and never marks the previous or next account through a stale control', () => {
    const view = render(subject());
    const previousSkip = screen.getByRole('button', { name: 'Přeskočit' });
    state.auth = genuineCrew(secondId);
    view.rerender(subject());
    expect(guide()).toBeInTheDocument();
    fireEvent.click(previousSkip);
    expect(window.localStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Přeskočit' }));
    expect(window.localStorage.getItem(`nodu:crew-getting-started:v1:${firstId}`)).toBeNull();
    expect(window.localStorage.getItem(`nodu:crew-getting-started:v1:${secondId}`)).toBe('dismissed');
    state.auth = genuineCrew(firstId);
    view.rerender(subject());
    expect(guide()).toBeInTheDocument();
  });

  it.each(['loading', 'role switching', 'manager'] as const)('drops an open guide during %s and restores only eligible identity state', (change) => {
    const view = render(subject());
    if (change === 'loading') state.auth.isLoading = true;
    if (change === 'role switching') state.auth.isRoleSwitching = true;
    if (change === 'manager') { state.auth.role = 'coo'; state.role = 'coo'; }
    view.rerender(subject());
    expect(guide()).not.toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    state.auth = genuineCrew(); state.role = 'crew';
    view.rerender(subject());
    expect(guide()).toBeInTheDocument();
  });

  it('enters the app if localStorage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('unavailable'); });
    render(subject());
    expect(guide()).not.toBeInTheDocument();
    expect(screen.getByText('Obsah aplikace')).toBeInTheDocument();
  });

  it('enters the app if dismissal cannot be saved', () => {
    render(subject());
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    fireEvent.click(screen.getByRole('button', { name: 'Přeskočit' }));
    expect(guide()).not.toBeInTheDocument();
    expect(screen.getByText('Obsah aplikace')).toBeInTheDocument();
  });
});
