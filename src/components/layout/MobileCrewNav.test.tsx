import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MobileCrewNav from './MobileCrewNav';

const setCurrentTab = vi.fn();
const setSelectedContractorProfileId = vi.fn();
const setSelectedEventId = vi.fn();
const setSelectedProjectIdForStats = vi.fn();
const setSelectedClientIdForStats = vi.fn();

let currentTab = 'my-shifts';

vi.mock('../../context/useAppContext', () => ({
  useAppContext: () => ({
    currentTab,
    setCurrentTab,
    setSelectedContractorProfileId,
    setSelectedEventId,
    setSelectedProjectIdForStats,
    setSelectedClientIdForStats,
  }),
}));

describe('MobileCrewNav', () => {
  beforeEach(() => {
    currentTab = 'my-shifts';
    vi.clearAllMocks();
  });

  it('renders compact Crew navigation labels with badges', () => {
    currentTab = 'events';

    render(<MobileCrewNav role="crew" badgeCounts={{ 'my-timelogs': 2, 'my-invoices': 1 }} />);

    expect(screen.getByRole('navigation', { name: 'Mobilní navigace Crew' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Akce' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Přehled')).toBeInTheDocument();
    expect(screen.getByText('Výkazy')).toBeInTheDocument();
    expect(screen.getByText('Faktury')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('Účtenky')).not.toBeInTheDocument();
    expect(screen.queryByText('Moje směny')).not.toBeInTheDocument();
  });

  it('switches tabs and clears selected detail state', () => {
    render(<MobileCrewNav role="crew" badgeCounts={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Moje faktury' }));

    expect(setCurrentTab).toHaveBeenCalledWith('my-invoices');
    expect(setSelectedContractorProfileId).toHaveBeenCalledWith(null);
    expect(setSelectedEventId).toHaveBeenCalledWith(null);
    expect(setSelectedProjectIdForStats).toHaveBeenCalledWith(null);
    expect(setSelectedClientIdForStats).toHaveBeenCalledWith(null);
  });

  it('renders compact management navigation for CH and COO roles', () => {
    currentTab = 'timelogs';

    render(<MobileCrewNav role="crewhead" badgeCounts={{ timelogs: 4 }} />);

    expect(screen.getByRole('navigation', { name: 'Mobilní navigace Management' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Přehled' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Akce' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schvalování' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Projekty' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crew' })).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('switches management approval navigation to all timelogs', () => {
    render(<MobileCrewNav role="coo" badgeCounts={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Schvalování' }));

    expect(setCurrentTab).toHaveBeenCalledWith('timelogs');
    expect(setSelectedEventId).toHaveBeenCalledWith(null);
  });
});
