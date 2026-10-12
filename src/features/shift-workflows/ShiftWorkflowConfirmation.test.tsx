import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShiftWorkflowError, type SaveShiftWorkflow, type ShiftWorkflowScope } from './shift-workflows.contract';
import type { ShiftWorkflowManagementData } from './shift-workflows.management';
import { ShiftWorkflowConfirmation } from './ShiftWorkflowConfirmation';
import { useShiftWorkflowDraft, type ShiftWorkflowDraftInput } from './useShiftWorkflowDraft';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope: ShiftWorkflowScope = { source: 'supabase', userId: id(1), profileId: id(2), role: 'crewhead' };
const time = '2026-10-12T11:00:00Z';
const makeData = (): ShiftWorkflowManagementData => ({
  snapshot: { revision: 4, assignedEventIds: [], workflows: [], rounds: [] },
  events: ['Přípravy', 'Instalace'].map((name, index) => ({ id: index + 21, supabaseId: id(index + 21), updatedAt: time,
    name, job: 'JOB', rawJobNumber: 'JOB', projectId: 'P', startDate: '2026-10-12', endDate: '2026-10-13', city: 'Praha', needed: 2, filled: 0, status: 'upcoming', client: 'Klient' })),
  timelogs: [], invoices: [], eventCrewAssignments: [],
});
function Harness({ input, selection, onBack }: { input: ShiftWorkflowDraftInput; selection: string[]; onBack: () => void }) {
  const draft = useShiftWorkflowDraft(input);
  const [summary, setSummary] = useState(false);
  return summary ? <ShiftWorkflowConfirmation draft={draft} scope={input.scope} workflowId={null} onBack={onBack} />
    : <button onClick={() => { draft.changeSelection(selection); setSummary(true); }}>Vybrat směny</button>;
}
function setup(selection = [id(21), id(22)]) {
  const input = { scope, workflowId: null, data: makeData(), onSave: vi.fn<(command: SaveShiftWorkflow) => Promise<unknown>>().mockResolvedValue(undefined), onReload: vi.fn<() => Promise<ShiftWorkflowManagementData>>().mockResolvedValue(makeData()), onClose: vi.fn() };
  const onBack = vi.fn(); render(<Harness input={input} selection={selection} onBack={onBack} />);
  fireEvent.click(screen.getByRole('button', { name: 'Vybrat směny' })); return { input, onBack };
}
describe('ShiftWorkflowConfirmation', () => {
  it('renders the full selected summary without a picker and saves only on the final action', async () => {
    const { input, onBack } = setup(); expect(screen.getByText('Přípravy · JOB')).toBeInTheDocument(); expect(screen.getByText('Instalace · JOB')).toBeInTheDocument();
    expect(screen.getAllByText('2026-10-12 – 2026-10-13')).toHaveLength(2); expect(screen.queryByRole('searchbox')).not.toBeInTheDocument(); expect(screen.queryByRole('checkbox')).not.toBeInTheDocument(); expect(input.onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Zpět k výběru' })); expect(onBack).toHaveBeenCalledOnce(); expect(input.onClose).not.toHaveBeenCalled(); expect(input.onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' })); await waitFor(() => expect(input.onSave).toHaveBeenCalledOnce());
    expect(input.onSave.mock.calls[0][0]).toMatchObject({ eventIds: [id(21), id(22)], expectedRevision: 4 });
  });
  it('keeps missing identities in the summary and prevents an incomplete save', () => {
    const { input } = setup([id(21), id(22), id(23)]);
    expect(screen.getByText('Vybráno směn: 3')).toBeInTheDocument(); expect(screen.getByText('Nedostupná vybraná směna')).toBeInTheDocument(); expect(screen.getByRole('alert')).toHaveTextContent(/není dostupná/);
    expect(screen.getByRole('button', { name: 'Propojit směny' })).toBeDisabled(); expect(input.onSave).not.toHaveBeenCalled();
  });
  it('guards back on a pending result, retries the same command, and keeps close separate from back', async () => {
    const { input, onBack } = setup(); input.onSave.mockRejectedValueOnce(new ShiftWorkflowError('ambiguous', 'Neověřeno'));
    fireEvent.click(screen.getByRole('button', { name: 'Propojit směny' }));
    const retry = await screen.findByRole('button', { name: 'Zopakovat stejný požadavek' }); const back = screen.getByRole('button', { name: 'Zpět k výběru' }); expect(back).toBeDisabled();
    fireEvent.click(back); expect(onBack).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Zavřít' })).toBeEnabled();
    fireEvent.click(retry); await waitFor(() => expect(input.onSave).toHaveBeenCalledTimes(2)); expect(input.onSave.mock.calls[1][0]).toBe(input.onSave.mock.calls[0][0]); expect(input.onClose).toHaveBeenCalledOnce();
  });
});
