import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FleetView from './FleetView';

vi.mock('../app/providers/useAuth', () => ({
  useAuth: () => ({
    currentProfileId: 'profile-local-1',
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('FleetView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-28T12:00:00+02:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the operational fleet overview table', () => {
    render(<FleetView />);

    expect(screen.getByRole('heading', { name: 'Flotila' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Auto' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'SPZ' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Typ' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nejbližší rezervace' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Stav' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Detail' })).not.toBeInTheDocument();
  });

  it('shows STK and conflict alerts without a standalone STK column', () => {
    render(<FleetView />);

    expect(screen.queryByRole('columnheader', { name: 'STK' })).not.toBeInTheDocument();
    expect(screen.getByText('STK za 13 dní')).toBeInTheDocument();
    expect(screen.getByText('Konflikt')).toBeInTheDocument();
  });

  it('opens the vehicle detail with calendar and reservation action', async () => {
    render(<FleetView />);

    fireEvent.click(screen.getByRole('row', { name: /Crafter 1/i }));

    expect(screen.getByRole('heading', { name: 'Crafter 1' })).toBeInTheDocument();
    expect(screen.getByText('Kalendář dostupnosti')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nová rezervace/i })).toBeInTheDocument();
    expect(screen.getAllByText(/BTL Mattoni/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('AKV104').length).toBeGreaterThan(0);
  });

  it('allows switching the detail calendar between months', () => {
    render(<FleetView />);

    fireEvent.click(screen.getByRole('row', { name: /Crafter 1/i }));

    expect(screen.getByText('květen 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Další měsíc' }));
    expect(screen.getByText('červen 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Předchozí měsíc' }));
    expect(screen.getByText('květen 2026')).toBeInTheDocument();
  });

  it('keeps the detail calendar at a stable height', () => {
    render(<FleetView />);

    fireEvent.click(screen.getByRole('row', { name: /Crafter 1/i }));

    expect(screen.getAllByTestId('fleet-detail-calendar-day')).toHaveLength(42);
  });

  it('highlights today in detail and fleet calendars', () => {
    render(<FleetView />);

    const todayOverviewDay = screen
      .getAllByTestId('fleet-overview-calendar-day')
      .find((day) => day.getAttribute('data-date') === '2026-04-28');

    expect(todayOverviewDay).toHaveAttribute('data-today', 'true');

    fireEvent.click(screen.getByRole('row', { name: /Crafter 1/i }));

    const todayDetailDay = screen
      .getAllByTestId('fleet-detail-calendar-day')
      .find((day) => day.getAttribute('data-date') === '2026-04-28');

    expect(todayDetailDay).toHaveAttribute('data-today', 'true');
  });

  it('shows reservation history and vehicle documents in detail', () => {
    render(<FleetView />);

    fireEvent.click(screen.getByRole('row', { name: /Crafter 1/i }));

    expect(screen.getByRole('heading', { name: 'Historie rezervací' })).toBeInTheDocument();
    expect(screen.getByText('TEST001')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dokumenty auta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Přidat dokument')).toBeInTheDocument();
  });

  it('shows the reservation detail after clicking a detail-calendar reservation', () => {
    render(<FleetView />);

    fireEvent.click(screen.getByRole('row', { name: /Crafter 1/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /BTL Mattoni/i })[0]);

    expect(screen.getByRole('dialog', { name: 'Vybraná rezervace' })).toBeInTheDocument();
    expect(screen.getByTestId('fleet-selected-reservation-detail')).toHaveTextContent('AKV104');
    expect(screen.getByTestId('fleet-selected-reservation-detail')).toHaveTextContent('Odpovědná osoba: Petr Heitzer');

    fireEvent.click(screen.getByRole('button', { name: 'Zavřít detail rezervace' }));
    expect(screen.queryByRole('dialog', { name: 'Vybraná rezervace' })).not.toBeInTheDocument();
  });

  it('shows a fleet-wide monthly calendar on overview', () => {
    render(<FleetView />);

    expect(screen.getByRole('heading', { name: 'Kalendář celé flotily' })).toBeInTheDocument();
    expect(screen.getAllByText(/Crafter 1 · AKV104/i).length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('fleet-overview-calendar-day')).toHaveLength(42);
  });

  it('keeps each vehicle in the same colored fleet-calendar row', () => {
    render(<FleetView />);

    const crafterReservations = screen.getAllByTestId('fleet-calendar-reservation-crafter-1');
    const transitReservations = screen.getAllByTestId('fleet-calendar-reservation-transit-1');

    expect(transitReservations.length).toBeGreaterThan(1);
    expect(new Set(crafterReservations.map((item) => item.getAttribute('data-fleet-slot')))).toEqual(new Set(['0']));
    expect(new Set(transitReservations.map((item) => item.getAttribute('data-fleet-slot')))).toEqual(new Set(['1']));
    expect(crafterReservations[0].style.backgroundColor).not.toBe(transitReservations[0].style.backgroundColor);
  });

  it('only reserves fleet-calendar rows for vehicles active in the shown month', () => {
    render(<FleetView />);

    expect(screen.getAllByTestId('fleet-calendar-slot-crafter-1').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('fleet-calendar-slot-transit-1').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('fleet-calendar-slot-van-crew')).not.toBeInTheDocument();
  });

  it('shows the reservation detail after clicking a fleet-calendar reservation', () => {
    render(<FleetView />);

    fireEvent.click(screen.getAllByRole('button', { name: /Crafter 1 · AKV104/i })[0]);

    expect(screen.getByRole('dialog', { name: 'Vybraná rezervace' })).toBeInTheDocument();
    expect(screen.getByTestId('fleet-selected-reservation-detail')).toHaveTextContent('Auto: Crafter 1');
    expect(screen.getByTestId('fleet-selected-reservation-detail')).toHaveTextContent('Odpovědná osoba: Petr Heitzer');

    fireEvent.click(screen.getByTestId('fleet-reservation-overlay'));
    expect(screen.queryByRole('dialog', { name: 'Vybraná rezervace' })).not.toBeInTheDocument();
  });
});
