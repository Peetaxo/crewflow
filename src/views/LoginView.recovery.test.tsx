import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginView from './LoginView';
const api = vi.hoisted(() => ({ enabled: true }));
vi.mock('../app/providers/useAuth', () => ({ useAuth: () => ({ signIn: vi.fn(), isLoading: false }) }));
vi.mock('../features/onboarding/services/password-recovery.service', () => ({ isPasswordRecoveryEnabled: () => api.enabled }));
const showLogin = () => render(<MemoryRouter initialEntries={['/login']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/login" element={<LoginView />} /><Route path="/forgot-password" element={<div>Request recovery</div>} /></Routes></MemoryRouter>);
describe('pilot login password recovery', () => {
  beforeEach(() => { api.enabled = true; });
  it('opens the recovery request from pilot login', () => {
    showLogin(); fireEvent.click(screen.getByRole('link', { name: 'Zapomenuté heslo' })); expect(screen.getByText('Request recovery')).toBeInTheDocument();
  });
  it('does not advertise disabled recovery', () => {
    api.enabled = false; showLogin(); expect(screen.queryByRole('link', { name: 'Zapomenuté heslo' })).not.toBeInTheDocument();
  });
});
