import { describe, expect, it } from 'vitest';
import type { Timelog } from '../../types';
import type { ShiftWorkflowContext } from './shift-workflows.model';
import { prepareShiftDraftSave, prepareShiftSubmission, prepareShiftTransition, selectShiftDrafts, serializeShiftReports } from './shift-workflows.batch-commands';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-23T11:00:00Z';
const reports = (): Timelog[] => [21, 22].map((n) => ({
  id: n, supabaseId: id(n), eid: n + 10, eventSupabaseId: id(n + 10), contractorProfileId: id(3),
  updatedAt: time, status: 'draft', km: n, note: `Poznámka ${n}`, reviewNote: 'Nesmí přepsat hodnotící poznámku',
  days: [{ id: id(n + 100), d: '2026-09-23', f: '22:00', t: '02:00', type: 'pripravy',
    meals: ['obed', 'vecere'], meal: 'obed', note: 'Poznámka dne' }],
}));
const context = (): ShiftWorkflowContext => ({ workflowId: id(10), contractorProfileId: id(3), anchorEventId: id(31),
  eventIds: [id(31), id(32)], timelogs: reports(), activeRound: null });
const frozen = (status: NonNullable<ShiftWorkflowContext['activeRound']>['status']) => {
  const value = context(); value.timelogs.forEach((t) => { t.status = status; });
  value.activeRound = { id: id(40), workflowId: id(10), contractorProfileId: id(3), status,
    eventIds: [id(31), id(32)], timelogIds: [id(21), id(22)], note: '', updatedAt: time };
  return value;
};

describe('atomic shared evidence commands', () => {
  it('explains unsupported kilometre precision before creating a write command', () => {
    const value = context(); value.timelogs[0].km = 12.345;
    expect(() => prepareShiftDraftSave(value, id(50))).toThrow(/desetinn/);
  });
  it('validates identities before sorting and disallows empty non-draft sections', () => {
    const rows = reports(); rows[1].supabaseId = undefined;
    expect(() => serializeShiftReports(rows)).toThrow(/jednoznačné/);
    const value = frozen('pending_ch'); value.timelogs[0].days = [];
    expect(() => prepareShiftTransition(value, id(50), 'correct', { note: 'Doplňte', affectedEventId: id(31) })).toThrow(/záznam/);
  });
  it('serializes every exact field, preserves UUID rows and meals, and excludes private review fields from draft writes', () => {
    const command = prepareShiftDraftSave(context(), id(50));
    expect(command).toMatchObject({ kind: 'save', requestId: id(50), workflowId: id(10), contractorProfileId: id(3), anchorEventId: id(31), roundId: null });
    expect(command.timelogs[0]).toEqual({ id: id(21), event_id: id(31), expected_updated_at: time, expected_status: 'draft', km: 21,
      note: 'Poznámka 21', days: [{ id: id(121), date: '2026-09-23', time_from: '22:00', time_to: '02:00', day_type: 'pripravy',
        meals: ['obed', 'vecere'], meal: 'obed', note: 'Poznámka dne' }] });
    expect(command.timelogs).toHaveLength(2);
  });
  it('allows incomplete future sections to save, but never silently omits them from submission', () => {
    const value = context(); value.timelogs[1].days = [];
    expect(prepareShiftDraftSave(value, id(50)).timelogs).toHaveLength(2);
    expect(() => prepareShiftSubmission(value, id(50), id(40))).toThrow(/záznam/);
    value.timelogs[1].days = [{ ...reports()[1].days[0], f: '', t: '' }];
    expect(prepareShiftDraftSave(value, id(50)).timelogs[1].days[0].time_from).toBe('');
    expect(() => prepareShiftSubmission(value, id(50), id(40))).toThrow(/čas/);
  });
  it('allocates no retry identities during serialization and returns detached payloads', () => {
    const value = context(); const command = prepareShiftSubmission(value, id(50), id(40));
    value.timelogs[0].days[0].meals!.push('obed'); value.timelogs[0].note = 'Pozdější změna';
    expect(command.roundId).toBe(id(40)); expect(command.requestId).toBe(id(50));
    expect(command.timelogs[0].note).toBe('Poznámka 21'); expect(command.timelogs[0].days[0].meals).toEqual(['obed', 'vecere']);
  });
  it.each(['supabaseId', 'eventSupabaseId', 'updatedAt'] as const)('rejects a missing canonical %s rather than using numeric fallback', (field) => {
    const value = context(); value.timelogs[0][field] = undefined;
    expect(() => prepareShiftDraftSave(value, id(50))).toThrow();
  });
  it('rejects missing reports, duplicate canonical rows, foreign owners and legacy temporary day ids', () => {
    const missing = context(); missing.timelogs.pop(); expect(() => selectShiftDrafts(missing)).toThrow();
    const duplicate = context(); duplicate.timelogs.push(duplicate.timelogs[0]); expect(() => selectShiftDrafts(duplicate)).toThrow();
    const foreign = context(); foreign.timelogs[0].contractorProfileId = id(4); expect(() => prepareShiftDraftSave(foreign, id(50))).toThrow();
    const legacy = context(); legacy.timelogs[0].days[0].id = 'draft-legacy'; expect(() => prepareShiftDraftSave(legacy, id(50))).toThrow();
  });
  it('preserves duplicate dates with distinct ids but refuses duplicate day ids across parts', () => {
    const value = context(); value.timelogs[0].days.push({ ...value.timelogs[0].days[0], id: id(199) });
    expect(prepareShiftDraftSave(value, id(50)).timelogs[0].days).toHaveLength(2);
    value.timelogs[1].days[0].id = id(121); expect(() => prepareShiftDraftSave(value, id(50))).toThrow();
  });
  it.each(['approved', 'invoiced', 'paid'] as const)('excludes completed %s history from the next submission without changing the opened anchor', (status) => {
    const value = context(); value.timelogs[0].status = status;
    const command = prepareShiftSubmission(value, id(50), id(40));
    expect(command.anchorEventId).toBe(id(31)); expect(command.timelogs.map((t) => t.id)).toEqual([id(22)]);
  });
  it('allows later draft saves outside an active round but blocks another submission', () => {
    const value = frozen('pending_ch'); value.eventIds.push(id(33));
    value.timelogs.push({ ...reports()[0], id: 23, supabaseId: id(23), eventSupabaseId: id(33), days: [{ ...reports()[0].days[0], id: id(123) }] });
    expect(prepareShiftDraftSave(value, id(50)).timelogs.map((t) => t.id)).toEqual([id(23)]);
    expect(() => prepareShiftSubmission(value, id(50), id(41))).toThrow(/schvalování/);
  });
  it('uses an explicit frozen round for confirmation saves, excluding later drafts', () => {
    const value = frozen('pending_crew_confirmation'); value.eventIds.push(id(33));
    value.timelogs.push({ ...reports()[0], supabaseId: id(23), eventSupabaseId: id(33), days: [] });
    const command = prepareShiftDraftSave(value, id(50), 'confirmation');
    expect(command.roundId).toBe(id(40)); expect(command.timelogs.map((t) => t.id)).toEqual([id(21), id(22)]);
  });
  it('prepares exact frozen handoff targets, not the later assigned parts', () => {
    const value = frozen('pending_ch');
    expect(prepareShiftTransition(value, id(50), 'handoff')).toEqual({ kind: 'transition', requestId: id(50), roundId: id(40),
      workflowId: id(10), contractorProfileId: id(3), expectedRoundUpdatedAt: time, action: 'handoff', note: '', affectedEventId: null, corrections: null,
      targets: [21, 22].map((n) => ({ id: id(n), expected_updated_at: time, expected_status: 'pending_ch' })) });
  });
  it('requires a reason and an included affected section for a return or CH correction', () => {
    const value = frozen('pending_ch');
    expect(() => prepareShiftTransition(value, id(50), 'return')).toThrow(/důvod/);
    expect(() => prepareShiftTransition(value, id(50), 'return', { note: 'Čas nesedí', affectedEventId: id(39) })).toThrow();
    expect(prepareShiftTransition(value, id(50), 'return', { note: 'Čas nesedí', affectedEventId: id(31) }).corrections).toBeNull();
    expect(prepareShiftTransition(value, id(50), 'correct', { note: 'Upraveno', affectedEventId: id(31) }).corrections).toHaveLength(2);
  });
  it('validates complete crew confirmation but allows incomplete CH correction drafts', () => {
    const confirmation = frozen('pending_crew_confirmation'); confirmation.timelogs[1].days = [];
    expect(() => prepareShiftTransition(confirmation, id(50), 'confirm')).toThrow();
    const correction = frozen('pending_ch'); correction.timelogs[1].days[0].f = '';
    expect(prepareShiftTransition(correction, id(50), 'correct', { note: 'Doplňte čas', affectedEventId: id(32) }).corrections![1].days[0].time_from).toBe('');
  });
  it('rejects stale or incomplete frozen round membership and invalid step actions', () => {
    const value = frozen('pending_ch'); value.timelogs[1].status = 'draft';
    expect(() => prepareShiftTransition(value, id(50), 'handoff')).toThrow();
    expect(() => prepareShiftTransition(frozen('pending_coo'), id(50), 'correct', { note: 'Změna', affectedEventId: id(31) })).toThrow();
    expect(() => prepareShiftTransition(frozen('pending_ch'), id(50), 'confirm')).toThrow();
  });
});
