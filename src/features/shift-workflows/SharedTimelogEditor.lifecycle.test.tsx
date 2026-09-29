import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Contractor, Event, Timelog } from '../../types';
import { canonicalizeLocalShiftData, createLocalShiftWorkflowStore, localShiftWorkflowId, type LocalShiftData } from './shift-workflows.local';
import { resolveShiftWorkflowContext } from './shift-workflows.model';
import { createShiftBatchWriter } from './shift-workflows.batch-gateway';
import { createShiftEvidenceSession } from './shift-evidence-session';
import type { ShiftWorkflowScope } from './shift-workflows.contract';
import SharedTimelogEditor from './SharedTimelogEditor';

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

it('completes the real shared crew → CH correction → crew confirmation → CH handoff → COO approval UI without invoicing', async () => {
  const crew: ShiftWorkflowScope = { source: 'local', role: 'crew', profileId: id(1), userId: id(11) };
  const ch: ShiftWorkflowScope = { source: 'local', role: 'crewhead', profileId: id(2), userId: id(12) };
  const coo: ShiftWorkflowScope = { source: 'local', role: 'coo', profileId: id(3), userId: id(13) };
  const data: LocalShiftData = {
    events: [1, 2, 3].map((n) => ({ id: n, name: ['Přípravy', 'Instalace', 'Nepřiřazený deinstal'][n - 1], job: 'JOB',
      startDate: '2026-09-29', endDate: '2026-09-29', contactProfileId: coo.profileId, showDayTypes: true, mealAllowanceEnabled: true }) as Event),
    timelogs: [1, 2, 3].map((n) => ({ id: n, eid: n, contractorProfileId: crew.profileId!, status: 'draft', km: 0, note: '',
      days: [{ id: id(100 + n), d: '2026-09-29', f: '08:00', t: '16:00', type: 'pripravy', note: '', meals: ['obed'], meal: 'obed' }] }) as Timelog),
    eventCrewAssignments: [1, 2].map((n) => ({ eventId: n, contractorProfileId: crew.profileId!, name: 'Test Crew' })),
    invoices: [], contractors: [crew, ch, coo].map((actor, n) => ({ id: n, profileId: actor.profileId, userId: actor.userId, name: 'Test Crew', rate: 300 }) as Contractor),
  };
  const store = createLocalShiftWorkflowStore(() => data, { workflows: [{ id: id(20),
    eventIds: [1, 2, 3].map((n) => localShiftWorkflowId('event', n)), updatedAt: '2026-09-29T08:00:00Z' }] },
  { commitTimelogs: (reports) => { data.timelogs = reports; } });
  const writer = createShiftBatchWriter({ client: null, localWrite: (scope, command) => store.executeBatch(scope, command) });
  const open = (scope: ShiftWorkflowScope, anchor: number) => {
    const canonical = canonicalizeLocalShiftData(data);
    const snapshot = store.read(scope);
    const context = resolveShiftWorkflowContext({ anchorEventId: localShiftWorkflowId('event', anchor), contractorProfileId: crew.profileId!,
      workflows: snapshot.workflows, rounds: snapshot.rounds, assignments: canonical.eventCrewAssignments,
      events: canonical.events, timelogs: canonical.timelogs });
    if (!context) throw new Error('Expected an assigned shared context');
    const session = createShiftEvidenceSession({ context, role: scope.role, assertCurrent: () => {}, write: (command, current) => writer(scope, command, current) });
    const view = render(<SharedTimelogEditor data={{ context, legacy: false, contractor: data.contractors![0], events: canonical.events.filter((event) => context.eventIds.includes(event.supabaseId)) }}
      role={scope.role} session={session} editorSessionKey={`${scope.role}:${anchor}`} actorProfileId={scope.profileId} actorUserId={scope.userId}
      onClose={() => {}} onReload={() => {}} />);
    return { session, close: () => { view.unmount(); session.dispose(); } };
  };
  const currentStatus = () => data.timelogs.slice(0, 2).map((report) => report.status);
  let editor = open(crew, 2);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.queryByText('Nepřiřazený deinstal')).not.toBeInTheDocument();
  fireEvent.change(within(screen.getByRole('region', { name: 'Přípravy' })).getByLabelText('Cestovné celkem (km)'), { target: { value: '30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Odeslat vše ke kontrole' }));
  await waitFor(() => expect(currentStatus()).toEqual(['pending_ch', 'pending_ch']));
  const roundId = store.read(crew).rounds[0].id;
  editor.close();

  editor = open(ch, 1);
  fireEvent.change(within(screen.getByRole('region', { name: 'Instalace' })).getByLabelText('Cestovné celkem (km)'), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText('Důvod vrácení nebo úpravy'), { target: { value: 'Doplněno cestovné instalace' } });
  fireEvent.change(screen.getByLabelText('Dotčená směna'), { target: { value: localShiftWorkflowId('event', 2) } });
  fireEvent.click(screen.getByRole('button', { name: 'Odeslat úpravy crew k potvrzení' }));
  await waitFor(() => expect(currentStatus()).toEqual(['pending_crew_confirmation', 'pending_crew_confirmation']));
  editor.close();

  editor = open(crew, 1);
  fireEvent.click(screen.getByRole('button', { name: 'Potvrdit a odeslat celé kolo' }));
  await waitFor(() => expect(currentStatus()).toEqual(['pending_ch', 'pending_ch']));
  expect(store.read(crew).rounds[0].id).toBe(roundId);
  editor.close();

  editor = open(ch, 2);
  fireEvent.click(screen.getByRole('button', { name: 'Předat celé kolo ke schválení' }));
  await waitFor(() => expect(currentStatus()).toEqual(['pending_coo', 'pending_coo']));
  editor.close();

  editor = open(coo, 1);
  expect(screen.queryByLabelText('Cestovné celkem (km)')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Schválit celé kolo' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Schválit celé kolo' }));
  await waitFor(() => expect(currentStatus()).toEqual(['approved', 'approved']));
  expect(data.timelogs[2].status).toBe('draft');
  expect(data.invoices).toEqual([]);
  editor.close();
});
