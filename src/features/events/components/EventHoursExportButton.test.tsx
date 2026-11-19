import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventHoursExportButton } from './EventHoursExportButton';
import { createEventHoursFile } from '../services/event-hours-workbook';
import { saveEventHoursFile } from '../services/save-event-hours-file';
import { hasRemoteEventHours, loadRemoteEventHours } from '../services/load-event-hours';
import type { Timelog } from '../../../types';

const config = vi.hoisted(() => ({ appDataSource: 'local' }));
vi.mock('../../../lib/app-config', () => config);
vi.mock('../services/load-event-hours', () => ({ hasRemoteEventHours: vi.fn(), loadRemoteEventHours: vi.fn() }));
vi.mock('../services/event-hours-workbook', () => ({ createEventHoursFile: vi.fn() }));
vi.mock('../services/save-event-hours-file', () => ({ saveEventHoursFile: vi.fn() }));
const event = { name: 'Test', job: 'Z1' };
const log: Timelog = { id: 1, eid: 1, status: 'approved', contractorProfileId: 'p1', km: 0, note: '',
  days: [{ d: '2026-11-15', f: '08:00', t: '10:30', type: 'instal' }] };
const detail = { event, receipts: [], crewAssignments: [], contractors: [{ profileId: 'p1', name: 'Alex', rate: 250 }], timelogs: [log] };

describe('event hours export action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    config.appDataSource = 'local';
  });
  it('enables export on approval and saves the file for the current event', async () => {
    const file = new File(['workbook'], 'Hodiny.xlsx');
    vi.mocked(createEventHoursFile).mockResolvedValue(file);
    const { rerender } = render(<EventHoursExportButton detail={{ ...detail, timelogs: [{ ...log, status: 'pending_coo' }] }} />);
    const button = screen.getByRole('button', { name: 'Stáhnout rozpis hodin' });
    expect(button).toBeDisabled();
    rerender(<EventHoursExportButton detail={detail} />);
    fireEvent.click(button);
    await waitFor(() => expect(saveEventHoursFile).toHaveBeenCalledWith(file));
    expect(createEventHoursFile).toHaveBeenCalledWith(expect.objectContaining({ event, partial: false }));
  });

  it('keeps the download disabled if checking for an approval fails and allows a retry', async () => {
    config.appDataSource = 'supabase';
    vi.mocked(hasRemoteEventHours).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(false);
    render(<EventHoursExportButton detail={{ ...detail, event: { ...event, supabaseId: 'event-a' }, timelogs: [] }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Znovu ověřit schválení' }));
    await waitFor(() => expect(hasRemoteEventHours).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Stáhnout rozpis hodin' })).toBeDisabled();
    expect(loadRemoteEventHours).not.toHaveBeenCalled();
    expect(saveEventHoursFile).not.toHaveBeenCalled();
  });

  it('reads current hours on click and skips a cached approval that has since been withdrawn', async () => {
    config.appDataSource = 'supabase';
    vi.mocked(hasRemoteEventHours).mockResolvedValueOnce(true);
    vi.mocked(loadRemoteEventHours).mockResolvedValueOnce({ event, people: [], partial: true });
    render(<EventHoursExportButton detail={{ ...detail, event: { ...event, supabaseId: 'event-b' } }} />);
    const button = screen.getByRole('button', { name: 'Stáhnout rozpis hodin' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(loadRemoteEventHours).toHaveBeenCalledWith({ ...event, supabaseId: 'event-b' });
    expect(createEventHoursFile).not.toHaveBeenCalled();
  });
});
