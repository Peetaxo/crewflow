import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { Contractor, Event, Timelog } from '../../types';
import { SharedApprovalCard } from './SharedApprovalCard';

describe('SharedApprovalCard', () => {
  it('shows the person, every frozen shift, complete totals, status and latest reason before opening a decision', () => {
    const reports = [1, 2].map((id) => ({ id, supabaseId: `t${id}`, eid: id, eventSupabaseId: `e${id}`, contractorProfileId: 'person',
      status: 'pending_ch', days: [{ d: `2026-09-0${id}`, f: '08:00', t: '10:00', type: 'provoz' }], km: id, note: '' } as Timelog));
    const events = [{ id: 1, supabaseId: 'other-event', name: 'Nesprávná směna', job: 'OTHER' } as Event,
      ...[1, 2].map((id) => ({ id: id + 10, supabaseId: `e${id}`, name: `Směna ${id}`, job: `JOB${id}`, startDate: `2026-09-0${id}` } as Event))];
    const open = vi.fn();
    render(<SharedApprovalCard group={{ round: { id: 'round', workflowId: 'w', contractorProfileId: 'person', status: 'pending_ch',
      eventIds: ['e1', 'e2'], timelogIds: ['t1', 't2'], note: 'Opravte cestovné', updatedAt: '' }, timelogs: reports, complete: true }}
      contractors={[{ profileId: 'person', name: 'Eva Crew', rate: 100 } as Contractor]} events={events} canAct
      history={[{ id: 'returned', roundId: 'old-round', action: 'return', label: 'Vráceno', note: 'Opravte cestovné', eventId: 'e1', createdAt: '2026-09-20T00:00:00Z' }]}
      onOpen={open} />);
    expect(screen.getByText('Eva Crew')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Směna 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Směna 2' })).toBeInTheDocument();
    expect(screen.queryByText('Nesprávná směna')).not.toBeInTheDocument();
    expect(screen.getByText(/2 části/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Souhrn výkazu' })).getByText('4 h')).toBeInTheDocument();
    expect(screen.getByText(/Poslední důvod vrácení: Opravte cestovné/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Zkontrolovat celý výkaz/ }));
    expect(open).toHaveBeenCalledWith(reports[0]);
  });
  it.each(['approved', 'rejected'] as const)('keeps the return reason prominent only while rejected (%s)', (status) => {
    const report = { id: 1, eid: 1, supabaseId: 't1', eventSupabaseId: 'e1', contractorProfileId: 'person',
      status, days: [{ d: '2026-10-19', f: '08:00', t: '16:00', type: 'provoz' }], km: 0, note: '' } as Timelog;
    render(<SharedApprovalCard group={{ round: { id: 'r1', workflowId: null, contractorProfileId: 'person',
      status, eventIds: ['e1'], timelogIds: ['t1'], note: '', updatedAt: '' }, timelogs: [report], complete: true }}
      contractors={[{ profileId: 'person', name: 'Eva Crew', rate: 250 } as Contractor]}
      events={[{ id: 1, supabaseId: 'e1', name: 'Festival', job: 'JOB1' } as Event]} canAct={false} onOpen={vi.fn()}
      history={[{ id: 'returned', roundId: 'r1', action: 'return', label: 'Vráceno', note: 'Opravte první den', eventId: 'e1', createdAt: '2026-10-20T00:00:00Z' }]} />);
    const reason = screen.getByText(/Poslední důvod vrácení: Opravte první den/);
    if (status === 'rejected') expect(reason).toBeVisible();
    else {
      expect(reason).not.toBeVisible();
      fireEvent.click(screen.getByText('Historie schvalování'));
      expect(reason).toBeVisible();
    }
    expect(screen.getByRole('button', { name: 'Otevřít celý výkaz' })).toBeEnabled();
  });

  it('does not mislabel a correction note as a return when the round was never returned', () => {
    render(<SharedApprovalCard group={{ round: { id: 'round', workflowId: null, contractorProfileId: 'person',
      status: 'pending_crew_confirmation', eventIds: ['e1'], timelogIds: ['t1'], note: 'Upřesněn čas směny', updatedAt: '2026-09-20T00:00:00Z' }, timelogs: [], complete: false }}
      contractors={[]} events={[]} canAct={false} onOpen={vi.fn()}
      history={[
        { id: 'submitted', roundId: 'round', action: 'submitted', label: 'Odesláno', note: '', eventId: null, createdAt: '2026-09-19T00:00:00Z' },
        { id: 'corrected', roundId: 'round', action: 'correct', label: 'Opraveno CrewHead', note: 'Upřesněn čas směny', eventId: 'e1', createdAt: '2026-09-20T00:00:00Z' },
      ]} />);
    expect(screen.queryByText(/Poslední důvod vrácení/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Otevřít celý výkaz' })).toBeDisabled();
    expect(screen.getByText('Opraveno CrewHead').closest('li')).toHaveTextContent('Upřesněn čas směny');
  });
});
