import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from './Index';

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({
    hasKnownSession: false,
    isAuthRequired: true,
    isAuthenticated: false,
    isLoading: false,
    devLoginOptions: [],
    signIn: vi.fn(),
    signInAsDevUser: vi.fn(),
  }),
}));

vi.mock('../app/providers/AppDataBootstrap', () => ({
  default: () => null,
}));

vi.mock('../components/layout/AppLayout', () => ({
  default: () => <div>App layout</div>,
}));

describe('Index unauthenticated routing', () => {
  it('shows the public Nodu welcome page before login on the homepage', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppShell />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /Cely provoz od akce po fakturu/i })).toBeInTheDocument();
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
});
