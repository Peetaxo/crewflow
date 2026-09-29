import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Contractor, Event, Timelog } from '../../types';
import TimelogEvidenceSection from './TimelogEvidenceSection';

vi.mock('../../context/useAppContext', () => ({ useAppContext: () => { throw new Error('No ambient editor in a section'); } }));
vi.mock('../timelogs/services/timelogs.service', () => ({ saveTimelog: () => { throw new Error('No persistence in a section'); } }));

const contractor = { profileId: 'person', name: 'Petr', rate: 300 } as Contractor;
const event = {
  id: 1, name: 'Instalace', startDate: '2026-07-13', endDate: '2026-07-15',
  job: 'JOB-1', city: 'Praha', needed: 2, filled: 1, status: 'upcoming', client: 'NEXTLEVEL',
  startTime: '08:00', endTime: '17:00', scheduleVersion: 2, showDayTypes: true, freeDays: ['2026-07-14'],
  dayTypes: { '2026-07-13': 'instal', '2026-07-15': 'deinstal' }, mealAllowanceEnabled: true,
} as Event;
const report = (id = 1): Timelog => ({
  id, eid: id, contractorProfileId: 'person', status: 'draft', km: 12, note: `Crew ${id}`, reviewNote: 'Review',
  days: [{ id: '11111111-1111-4111-8111-111111111111', d: '2026-07-13', f: '22:00', t: '02:00', type: 'instal', meals: ['obed'], meal: 'obed', note: 'Day note' }],
});

function Controlled({ initial = report(), name = 'First', readOnly = false, role = 'crew', onChange = vi.fn() }: {
  initial?: Timelog; name?: string; readOnly?: boolean; role?: 'crew' | 'crewhead' | 'coo'; onChange?: (next: Timelog) => void;
}) {
  const [timelog, setTimelog] = React.useState(initial);
  return <section aria-label={name}>
    <TimelogEvidenceSection timelog={timelog} event={{ ...event, id: initial.eid as number }} contractor={contractor}
      role={role} readOnly={readOnly} busy={false} editorSessionKey="session" onChange={(next) => { onChange(next); setTimelog(next); }} />
  </section>;
}

describe('TimelogEvidenceSection', () => {
  it('edits two controlled sections independently and emits full values immediately without shell, footer or ambient writes', () => {
    const first = vi.fn(); const second = vi.fn();
    const listeners = vi.spyOn(window, 'addEventListener');
    const view = render(<><Controlled onChange={first} /><Controlled initial={report(2)} name="Second" onChange={second} /></>);
    const one = within(screen.getByRole('region', { name: 'First' }));
    const two = within(screen.getByRole('region', { name: 'Second' }));
    fireEvent.change(one.getByLabelText('Cestovné celkem (km)'), { target: { value: '41' } });
    fireEvent.change(one.getByLabelText('Poznámka k výkazu'), { target: { value: 'Changed' } });
    fireEvent.change(one.getByLabelText('Poznámka k záznamu'), { target: { value: 'Day changed' } });
    fireEvent.click(within(one.getByRole('group', { name: 'Jídlo' })).getByRole('button', { name: 'Večeře' }));
    expect(first.mock.calls.at(-1)?.[0]).toEqual({ ...report(), km: 41, note: 'Changed', days: [{ ...report().days[0], note: 'Day changed', meals: ['obed', 'vecere'] }] });
    expect(second).not.toHaveBeenCalled();
    expect(two.getByLabelText('Poznámka k výkazu')).toHaveValue('Crew 2');
    expect(view.container.querySelector('.fixed, .nodu-mobile-timelog-modal, footer')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(listeners.mock.calls.some(([type]) => type.startsWith('touch'))).toBe(false);
    listeners.mockRestore();
  });

  it('does not invent work from planned times or free days, and keeps UUIDs of repeated records stable', () => {
    const changed = vi.fn();
    render(<Controlled initial={{ ...report(), days: [] }} onChange={changed} />);
    expect(screen.queryByRole('button', { name: '14.07.2026' })).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Od' })).getByText('--:--')).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Přidat Záznam' }));
    const first = changed.mock.calls.at(-1)![0].days[0];
    expect(first).toMatchObject({ f: '', t: '', d: '2026-07-13' });
    expect(first.id).toMatch(/^[a-f0-9-]{36}$/);
    fireEvent.click(screen.getByRole('button', { name: 'Přidat Záznam' }));
    const days = changed.mock.calls.at(-1)![0].days;
    expect(days).toHaveLength(2);
    expect(days).toContainEqual(first);
    expect(new Set(days.map((day: { id: string }) => day.id)).size).toBe(2);
    fireEvent.change(screen.getByLabelText('Cestovné celkem (km)'), { target: { value: '50' } });
    expect(changed.mock.calls.at(-1)![0].days.map((day: { id: string }) => day.id)).toEqual(days.map((day: { id: string }) => day.id));
  });

  it('keeps CH review notes separate and emits corrections without a persistence operation', () => {
    const changed = vi.fn();
    render(<Controlled role="crewhead" initial={{ ...report(), status: 'pending_ch' }} onChange={changed} />);
    fireEvent.change(screen.getByLabelText('Poznámka pro Crew'), { target: { value: 'Please check' } });
    expect(changed).toHaveBeenLastCalledWith({ ...report(), status: 'pending_ch', reviewNote: 'Please check' });
    expect(screen.getByLabelText('Poznámka Crew')).toHaveTextContent('Crew 1');
  });

  it('uses the shared review reason without hiding the editable day note', () => {
    const changed = vi.fn();
    render(<TimelogEvidenceSection timelog={{ ...report(), status: 'pending_ch' }} event={event} contractor={contractor}
      role="crewhead" editorSessionKey="shared" showReviewNoteEditor={false} onChange={changed} />);
    expect(screen.queryByLabelText('Poznámka pro Crew')).toBeNull();
    fireEvent.change(screen.getByLabelText('Poznámka k záznamu'), { target: { value: 'Opravená poznámka dne' } });
    expect(changed.mock.calls.at(-1)?.[0].days[0].note).toBe('Opravená poznámka dne');
    expect(screen.getByLabelText('Poznámka Crew')).toHaveTextContent('Crew 1');
  });

  it.each(['coo', 'crew'] as const)('keeps read-only %s values uneditable', (role) => {
    const changed = vi.fn();
    render(<Controlled role={role} readOnly onChange={changed} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByRole('region', { name: 'Souhrn hodin' })).toHaveTextContent('22:00 - 02:00');
    expect(changed).not.toHaveBeenCalled();
  });

  it('resets transient selection on editor-session change and accepts new authoritative values without emitting an edit', () => {
    const changed = vi.fn();
    const props = { timelog: report(), event, contractor, role: 'crew' as const, onChange: changed, editorSessionKey: 'A' };
    const view = render(<TimelogEvidenceSection {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Přidat den' }));
    view.rerender(<TimelogEvidenceSection {...props} editorSessionKey="B" timelog={{ ...report(), note: 'Restored', reviewNote: 'New review', km: 99 }} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('Poznámka k výkazu')).toHaveValue('Restored');
    expect(screen.getByLabelText('Cestovné celkem (km)')).toHaveValue(99);
    expect(changed).not.toHaveBeenCalled();
  });

  it('leaves scrolling to the outer editor while retaining the rich body styling', () => {
    const view = render(<Controlled />);
    expect(view.container.querySelector('.nodu-mobile-timelog-body')).toHaveStyle({ overflowY: 'visible', flex: 'none' });
  });

  it('displays authoritative field updates without emitting an edit or closing the current picker', () => {
    const changed = vi.fn();
    const props = { timelog: report(), event, contractor, role: 'crew' as const, onChange: changed, editorSessionKey: 'A' };
    const view = render(<TimelogEvidenceSection {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /^Otevřít výběr času Od/ }));
    view.rerender(<TimelogEvidenceSection {...props} timelog={{ ...report(), km: 99, note: 'Loaded', updatedAt: '2026-09-23T12:00:00Z' }} />);
    expect(screen.getByLabelText('Poznámka k výkazu')).toHaveValue('Loaded');
    expect(screen.getByLabelText('Cestovné celkem (km)')).toHaveValue(99);
    expect(screen.getByRole('group', { name: 'Výběr času Od' })).toBeInTheDocument();
    expect(changed).not.toHaveBeenCalled();
  });

  it('does not allow COO edits even if the caller does not explicitly request read-only mode', () => {
    render(<Controlled role="coo" initial={{ ...report(), status: 'pending_coo' }} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText('Crew 1')).toBeNull();
  });

  it('rejects edits while busy and does not insert a blank record when changing only a report note', () => {
    const changed = vi.fn();
    const props = { timelog: { ...report(), days: [] }, event, contractor, role: 'crew' as const, onChange: changed, editorSessionKey: 'A' };
    const view = render(<TimelogEvidenceSection {...props} busy />);
    expect(screen.getByLabelText('Poznámka k výkazu')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Poznámka k výkazu'), { target: { value: 'Ignored' } });
    expect(changed).not.toHaveBeenCalled();
    view.rerender(<TimelogEvidenceSection {...props} />);
    fireEvent.change(screen.getByLabelText('Poznámka k výkazu'), { target: { value: 'Note only' } });
    expect(changed).toHaveBeenLastCalledWith({ ...props.timelog, note: 'Note only' });
  });
});
