import React, { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SharedTimelogEntry from './SharedTimelogEntry';
import type { ShiftEvidenceData } from './shift-evidence-loader';
import type { ShiftWorkflowScope } from './shift-workflows.contract';
const mocks = vi.hoisted(() => ({ load: vi.fn(), write: vi.fn(), refresh: vi.fn(), close: vi.fn(), reload: vi.fn(), ready: true,
  scope: { source: 'supabase', role: 'crew', profileId: '00000000-0000-4000-8000-000000000003', userId: '00000000-0000-4000-8000-000000000004' } as ShiftWorkflowScope,
  opened: null as ShiftEvidenceData['context']['timelogs'][number] | null }));
vi.mock('../../context/useAppContext', () => ({ useAppContext: () => ({ editingTimelog: mocks.opened, setEditingTimelog: mocks.close }) }));
vi.mock('./useShiftWorkflows', () => ({ useShiftWorkflows: () => ({ ready: mocks.ready, scope: mocks.scope, scopeKey: JSON.stringify(mocks.scope), reload: mocks.reload }) }));
vi.mock('./shift-evidence-loader', () => ({ loadShiftEvidenceData: mocks.load }));
vi.mock('./shift-evidence-write', () => ({ writeShiftEvidenceBatch: mocks.write, refreshShiftEvidence: mocks.refresh }));
vi.mock('./TimelogEvidenceSection', () => ({ default: ({ timelog, readOnly, onChange }: { timelog: { note: string }; readOnly: boolean; onChange: (v: unknown) => void }) => <input aria-label="Hours" value={timelog.note} disabled={readOnly} onChange={(e) => onChange({ ...timelog, note: e.target.value })} /> }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const value = (): ShiftEvidenceData => ({ legacy: false, contractor: { name: 'Current crew', profileId: id(3) } as ShiftEvidenceData['contractor'],
  events: [{ id: 31, supabaseId: id(31), name: 'Own shift', job: 'JOB', startDate: '2026-09-29', endDate: '2026-09-29' }] as ShiftEvidenceData['events'],
  context: { workflowId: null, contractorProfileId: id(3), anchorEventId: id(31), eventIds: [id(31)], activeRound: null,
    timelogs: [{ id: 21, supabaseId: id(21), eid: 31, eventSupabaseId: id(31), contractorProfileId: id(3), status: 'draft', note: '', km: 0,
      updatedAt: '2026-09-29T10:00:00Z', days: [{ id: id(121), d: '2026-09-29', f: '08:00', t: '10:00', type: 'pripravy' }] }] } });
describe('global shared evidence entry', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.ready = true; mocks.scope = { source: 'supabase', role: 'crew', profileId: id(3), userId: id(4) };
    mocks.opened = value().context.timelogs[0]; mocks.load.mockResolvedValue(value()); mocks.write.mockRejectedValue(new Error('offline')); mocks.refresh.mockResolvedValue(undefined); });
  it('creates a live editable session in StrictMode rather than retaining a disposed probe', async () => {
    render(<StrictMode><SharedTimelogEntry legacy={<div>Old editor</div>} /></StrictMode>);
    const input = await screen.findByLabelText('Hours'); fireEvent.change(input, { target: { value: 'new hours' } });
    expect(screen.getByLabelText('Hours')).toHaveValue('new hours'); expect(screen.queryByText('Old editor')).not.toBeInTheDocument();
  });
  it('masks immediately while identity is switching and rejects its old load result', async () => {
    let finish!: (value: ShiftEvidenceData) => void; mocks.load.mockReturnValueOnce(new Promise((r) => { finish = r; }));
    const view = render(<SharedTimelogEntry legacy={<div>Old editor</div>} />);
    await waitFor(() => expect(finish).toBeTypeOf('function'));
    mocks.ready = false; view.rerender(<SharedTimelogEntry legacy={<div>Old editor</div>} />);
    await act(async () => { finish(value()); });
    expect(screen.queryByLabelText('Hours')).not.toBeInTheDocument(); expect(screen.queryByText('Old editor')).not.toBeInTheDocument();
  });
  it('does not accept a late load from a previously closed editor session', async () => {
    let finish!: (value: ShiftEvidenceData) => void; mocks.load.mockReturnValueOnce(new Promise((r) => { finish = r; }));
    const view = render(<SharedTimelogEntry legacy={<div>Old editor</div>} />);
    await waitFor(() => expect(finish).toBeTypeOf('function')); mocks.opened = null;
    view.rerender(<SharedTimelogEntry legacy={<div>Old editor</div>} />);
    await act(async () => { finish(value()); }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('only uses legacy UI after an authoritative compatible legacy determination', async () => {
    mocks.load.mockResolvedValueOnce({ ...value(), legacy: true });
    render(<SharedTimelogEntry legacy={<div>Old editor</div>} />);
    expect(await screen.findByText('Old editor')).toBeInTheDocument(); expect(screen.queryByLabelText('Hours')).not.toBeInTheDocument();
  });
  it('keeps failed reads explicit and does not fall back to old writes', async () => {
    mocks.load.mockRejectedValueOnce(new Error('private database detail'));
    render(<SharedTimelogEntry legacy={<div>Old editor</div>} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Evidenci se nepodařilo načíst. Zkuste to znovu.');
    expect(screen.queryByText('private database detail')).not.toBeInTheDocument(); expect(screen.queryByText('Old editor')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit načíst znovu' }));
    expect(await screen.findByLabelText('Hours')).toBeInTheDocument();
  });
});
