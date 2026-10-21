import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const mocks = vi.hoisted(() => ({ gate: vi.fn(), auth: vi.fn() }));
vi.mock('./pages/Index.tsx', () => ({ default: () => { mocks.gate(); return <div>Operational gate</div>; } }));
vi.mock('./app/providers/AuthProvider', () => ({ AuthProvider: ({ children }: { children: ReactNode }) => { mocks.auth(); return children; } }));
vi.mock('./features/onboarding/ActivationView', () => ({ default: () => <div>Public activation form</div> }));
vi.mock('./features/onboarding/NativeActivationLinks', () => ({ default: ({ children }: { children: ReactNode }) => children }));

describe('activation routing', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('VITE_ONBOARDING_ENABLED', 'true'); window.history.replaceState(null, '', '/activate'); });

  it('reaches activation with normal auth support before any operational gate/bootstrap', () => {
    render(<App />);
    expect(screen.getByText('Public activation form')).toBeInTheDocument();
    expect(mocks.auth).toHaveBeenCalled();
    expect(mocks.gate).not.toHaveBeenCalled();
  });

  it('does not initialize auth or operational data when activation is disabled', () => {
    vi.stubEnv('VITE_ONBOARDING_ENABLED', 'false');
    render(<App />);
    expect(screen.getByText('Public activation form')).toBeInTheDocument();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.gate).not.toHaveBeenCalled();
  });
});
