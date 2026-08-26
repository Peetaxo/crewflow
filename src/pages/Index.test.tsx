import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './Index';

const mockAuthState = {
  hasKnownSession: false,
  isAuthRequired: true,
  isAuthenticated: false,
  isLoading: false,
  devLoginOptions: [],
  signIn: vi.fn(),
  signInAsDevUser: vi.fn(),
};

const runtimeConfig = vi.hoisted(() => ({
  appDataSource: 'supabase' as 'local' | 'supabase',
  isNativePlatform: false,
  isSupabaseConfigured: true,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => runtimeConfig.isNativePlatform,
  },
}));

vi.mock('../lib/app-config', () => ({
  get appDataSource() {
    return runtimeConfig.appDataSource;
  },
  get isLocalDataEnabled() {
    return runtimeConfig.appDataSource === 'local';
  },
}));

vi.mock('../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return runtimeConfig.isSupabaseConfigured;
  },
}));

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../app/providers/AppDataBootstrap', () => ({
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-data-bootstrap">
      {mockAuthState.isLoading
        ? <div role="status" aria-label="Připravuji aplikaci" />
        : children}
    </div>
  ),
}));

vi.mock('../components/layout/AppLayout', () => ({
  default: () => <div>App layout</div>,
}));

const CurrentPath = () => {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}</div>;
};

describe('Index unauthenticated routing', () => {
  beforeEach(() => {
    Object.assign(mockAuthState, {
      hasKnownSession: false,
      isAuthRequired: true,
      isAuthenticated: false,
      isLoading: false,
    });
    runtimeConfig.appDataSource = 'supabase';
    runtimeConfig.isNativePlatform = false;
    runtimeConfig.isSupabaseConfigured = true;
  });

  it('shows the auth loader instead of the public page during native session discovery', () => {
    runtimeConfig.isNativePlatform = true;
    Object.assign(mockAuthState, {
      hasKnownSession: false,
      isAuthRequired: true,
      isAuthenticated: false,
      isLoading: true,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Cely provoz od akce po fakturu/i })).not.toBeInTheDocument();
  });

  it('shows login and replaces native root with the app route when no session exists', async () => {
    runtimeConfig.isNativePlatform = true;
    Object.assign(mockAuthState, {
      hasKnownSession: false,
      isAuthRequired: true,
      isAuthenticated: false,
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppShell />
        <CurrentPath />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Prihlaseni' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Cely provoz od akce po fakturu/i })).not.toBeInTheDocument();
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/app');
  });

  it('enters the authenticated bootstrap from native root without the public page', () => {
    runtimeConfig.isNativePlatform = true;
    Object.assign(mockAuthState, {
      hasKnownSession: true,
      isAuthRequired: true,
      isAuthenticated: true,
      isLoading: false,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('app-data-bootstrap')).toContainElement(screen.getByText('App layout'));
    expect(screen.queryByRole('heading', { name: /Cely provoz od akce po fakturu/i })).not.toBeInTheDocument();
  });

  it('shows the public Nodu welcome page before login on the homepage', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Cely provoz od akce po fakturu/i })).toBeInTheDocument();
    expect(screen.getByText('Job Number jako spojovaci bod')).toBeInTheDocument();
    expect(screen.getByText('Role vidi jen to, co potrebuji')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prihlasit' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Prihlaseni' })).not.toBeInTheDocument();
  });

  it('shows the login form on the login route', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Prihlaseni' })).toBeInTheDocument();
  });

  it('keeps the public Nodu welcome page on the homepage for signed-in users', () => {
    Object.assign(mockAuthState, {
      hasKnownSession: true,
      isAuthenticated: true,
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Cely provoz od akce po fakturu/i })).toBeInTheDocument();
    expect(screen.queryByText('App layout')).not.toBeInTheDocument();
  });

  it('shows the authenticated app on the app route', () => {
    Object.assign(mockAuthState, {
      hasKnownSession: true,
      isAuthenticated: true,
    });

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('app-data-bootstrap')).toContainElement(screen.getByText('App layout'));
    expect(screen.queryByRole('heading', { name: /Cely provoz od akce po fakturu/i })).not.toBeInTheDocument();
  });

  it('routes an accepted session through the persistent bootstrap gate while metadata loads', () => {
    Object.assign(mockAuthState, {
      hasKnownSession: true,
      isAuthRequired: true,
      isAuthenticated: true,
      isLoading: true,
    });

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('app-data-bootstrap')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
    expect(screen.queryByText('App layout')).not.toBeInTheDocument();
  });

  it('keeps an unknown unauthenticated session outside the data bootstrap gate', () => {
    Object.assign(mockAuthState, {
      hasKnownSession: false,
      isAuthRequired: true,
      isAuthenticated: false,
      isLoading: true,
    });

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole('status', { name: 'Připravuji aplikaci' })).toBeInTheDocument();
    expect(screen.queryByTestId('app-data-bootstrap')).not.toBeInTheDocument();
    expect(screen.queryByText('App layout')).not.toBeInTheDocument();
  });

  it('shows a configuration error instead of loading local data when Supabase env is missing', () => {
    runtimeConfig.isSupabaseConfigured = false;
    Object.assign(mockAuthState, {
      hasKnownSession: true,
      isAuthenticated: true,
      isAuthRequired: false,
    });

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByText('Chybi Supabase konfigurace')).toBeInTheDocument();
    expect(screen.queryByText('App layout')).not.toBeInTheDocument();
  });
});
