import { describe, expect, it } from 'vitest';
import type { Event } from '../../types';
import type { ShiftWorkflowScope, ShiftWorkflowSnapshot } from './shift-workflows.contract';
import { buildShiftWorkflowCommand } from './shift-workflows.selection';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-23T11:00:00Z';
const scope: ShiftWorkflowScope = { source: 'supabase', userId: id(1), profileId: id(2), role: 'crewhead' };
const snapshot: ShiftWorkflowSnapshot = {
  revision: 7, rounds: [], assignedEventIds: [],
  workflows: [
    { id: id(10), eventIds: [id(21), id(22)], updatedAt: time },
    { id: id(11), eventIds: [id(23), id(24)], updatedAt: time },
  ],
};
const events = [21, 22, 23, 24].map((n) => ({ id: n, supabaseId: id(n), updatedAt: time,
  name: 'Shift', job: 'J001', projectId: 'P001' } as Event));
const input = () => ({ scope, snapshot, workflowId: id(10), eventIds: [id(21), id(23)], events,
  requestId: id(30), confirmMoves: true, confirmCrossProject: false, deleteWorkflow: false });

describe('shared workflow command preparation', () => {
  it('includes removed members and remaining source members in exact optimistic versions', () => {
    expect(buildShiftWorkflowCommand(input())).toEqual({
      requestId: id(30), workflowId: id(10), eventIds: [id(21), id(23)], expectedRevision: 7,
      eventVersions: Object.fromEntries(events.map((e) => [e.supabaseId, time])),
      confirmMoves: true, confirmCrossProject: false, deleteWorkflow: false,
    });
  });

  it('prepares a delete with versions for every old member', () => {
    const command = buildShiftWorkflowCommand({ ...input(), eventIds: [], deleteWorkflow: true });
    expect(Object.keys(command.eventVersions)).toEqual([id(21), id(22)]);
  });

  it.each([
    ['missing version', events.map((e) => e.id === 24 ? { ...e, updatedAt: undefined } : e)],
    ['missing source member', events.filter((e) => e.id !== 24)],
    ['duplicate canonical event', [...events, { ...events[0], id: 121 }]],
  ])('rejects %s instead of submitting a partial command', (_name, changed) => {
    expect(() => buildShiftWorkflowCommand({ ...input(), events: changed })).toThrow();
  });

  it('does not accept a numeric local fallback for a remote event', () => {
    expect(() => buildShiftWorkflowCommand({ ...input(), events: events.map((e) => ({ ...e, supabaseId: undefined })) })).toThrow();
  });

  it('requires production role, revision and cross-project/move acknowledgements', () => {
    expect(() => buildShiftWorkflowCommand({ ...input(), scope: { ...scope, role: 'crew' } })).toThrow();
    expect(() => buildShiftWorkflowCommand({ ...input(), snapshot: { ...snapshot, revision: null } })).toThrow();
    expect(() => buildShiftWorkflowCommand({ ...input(), confirmMoves: false })).toThrow(/přesun/);
    expect(() => buildShiftWorkflowCommand({ ...input(), events: events.map((e) => e.id === 23 ? { ...e, job: 'OTHER' } : e) })).toThrow(/jobnumber/);
  });

  it('sorts a detached selection so retry payload does not depend on click order', () => {
    const selected = [id(23), id(21)];
    expect(buildShiftWorkflowCommand({ ...input(), eventIds: selected }).eventIds).toEqual([id(21), id(23)]);
    expect(selected).toEqual([id(23), id(21)]);
  });
});
