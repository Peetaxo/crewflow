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

    render(<MobileCrewNav badgeCounts={{ 'my-timelogs': 2, 'my-invoices': 1 }} />);

    expect(screen.getByRole('navigation', { name: 'Mobilní navigace Crew' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Akce' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Směny')).toBeInTheDocument();
    expect(screen.getByText('Výkazy')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('Moje směny')).not.toBeInTheDocument();
  });

  it('switches tabs and clears selected detail state', () => {
    render(<MobileCrewNav badgeCounts={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Moje faktury' }));

    expect(setCurrentTab).toHaveBeenCalledWith('my-invoices');
    expect(setSelectedContractorProfileId).toHaveBeenCalledWith(null);
    expect(setSelectedEventId).toHaveBeenCalledWith(null);
    expect(setSelectedProjectIdForStats).toHaveBeenCalledWith(null);
    expect(setSelectedClientIdForStats).toHaveBeenCalledWith(null);
  });
});
