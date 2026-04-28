import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocalAppData, updateLocalAppState } from '../lib/app-data';
import WarehouseView from './WarehouseView';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('WarehouseView', () => {
  beforeEach(() => {
    updateLocalAppState(() => getLocalAppData());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders imported warehouse items as image cards', () => {
    render(<WarehouseView />);

    expect(screen.getByRole('heading', { name: 'Sklad' })).toBeInTheDocument();
    expect(screen.getByText('mix pult Pioneer DJM 900')).toBeInTheDocument();
    expect(screen.getByText('2 000 Kc')).toBeInTheDocument();
    expect(screen.getByAltText('mix pult Pioneer DJM 900')).toBeInTheDocument();
  });

  it('adds an item to cart', () => {
    render(<WarehouseView />);

    const card = screen.getByText('Makita DML 805 (venkovni led svetlo)').closest('article');
    expect(card).not.toBeNull();

    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Pridat do kosiku Makita DML 805 (venkovni led svetlo)' }));

    expect(screen.getByText('Kosik')).toBeInTheDocument();
    expect(screen.getByText('1 polozka')).toBeInTheDocument();
  });

  it('fills datetime-local defaults in local time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 28, 10, 20, 0, 0));

    render(<WarehouseView />);

    fireEvent.focus(screen.getByLabelText('Od'));

    expect(screen.getByLabelText('Od')).toHaveValue('2026-04-28T11:00');
    expect(screen.getByLabelText('Do')).toHaveValue('2026-04-28T19:00');
  });

  it('shows validation when confirming incomplete cart', async () => {
    render(<WarehouseView />);

    fireEvent.click(screen.getByRole('button', { name: 'Vytvorit rezervaci' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Vyberte projekt.');
  });
});
