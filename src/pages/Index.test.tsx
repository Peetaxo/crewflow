import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('../app/providers/AppDataBootstrap', () => ({
  default: () => null,
}));

vi.mock('../components/layout/AppLayout', () => ({
  default: () => <div>App layout</div>,
}));

describe('Index unauthenticated routing', () => {
  beforeEach(() => {
    Object.assign(mockAuthState, {
      hasKnownSession: false,
      isAuthRequired: true,
      isAuthenticated: false,
      isLoading: false,
    });
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

    expect(screen.getByText('App layout')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Cely provoz od akce po fakturu/i })).not.toBeInTheDocument();
  });
});
