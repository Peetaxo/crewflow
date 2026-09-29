import { describe, expect, it } from 'vitest';
import { assertShiftBatchCommand, parseShiftBatchResult } from './shift-workflows.batch-contract';
import type { ShiftDraftCommand, ShiftTransitionCommand } from './shift-workflows.batch-commands';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-09-23T11:00:00Z';
const next = '2026-09-23T11:00:01Z';
const command = (): ShiftDraftCommand => ({ kind: 'submit', requestId: id(50), roundId: id(40), workflowId: id(10),
  contractorProfileId: id(3), anchorEventId: id(31), timelogs: [21, 22].map((n) => ({ id: id(n), event_id: id(n + 10),
    expected_updated_at: time, expected_status: 'draft', km: 2, note: '', days: [{ id: id(n + 100), date: '2026-09-23',
      time_from: '22:00', time_to: '02:00', day_type: 'pripravy', note: '', meal: 'obed', meals: ['obed', 'vecere'] }] })) });
const result = () => ({ request_id: id(50), workflow_id: id(10), round: { id: id(40), workflow_id: id(10),
  contractor_id: id(3), status: 'pending_ch', event_ids: [id(31), id(32)], timelog_ids: [id(21), id(22)], note: '', updated_at: next },
  timelogs: command().timelogs.map((t) => ({ id: t.id, event_id: t.event_id, contractor_id: id(3), status: 'pending_ch',
    updated_at: next, km: t.km, note: t.note, review_note: null, crew_confirmation_snapshot: null,
    submitted_at: next, approved_at: null, days: t.days, approval: null })) });
const transition = (action: ShiftTransitionCommand['action'] = 'handoff'): ShiftTransitionCommand => ({
  kind: 'transition', requestId: id(50), roundId: id(40), workflowId: id(10), contractorProfileId: id(3),
  expectedRoundUpdatedAt: time, action, note: '', affectedEventId: null, corrections: null,
  targets: command().timelogs.map((t) => ({ id: t.id, expected_updated_at: time, expected_status: 'pending_ch' })),
});

describe('shared evidence wire contract', () => {
  it('rejects partial or altered saved evidence even when the receipt headers match', () => {
    const omitted = result(); omitted.timelogs[0].days = [];
    const km = result(); km.timelogs[0].km = 999;
    const note = result(); note.timelogs[0].note = 'unexpected';
    const changedDay = result(); changedDay.timelogs[0].days[0].time_to = '05:00';
    for (const raw of [omitted, km, note, changedDay]) expect(() => parseShiftBatchResult(raw, command())).toThrow();
  });
  it('compares microseconds and timestamp instants rather than millisecond truncation or spelling', () => {
    const cmd = command(); cmd.timelogs[0].expected_updated_at = '2026-09-23T11:00:00.123456Z';
    for (const version of ['2026-09-23T11:00:00.123455Z', '2026-09-23T11:00:00.123456+00:00']) {
      const raw = result(); raw.timelogs[0].updated_at = version;
      expect(() => parseShiftBatchResult(raw, cmd)).toThrow();
    }
    const raw = result(); raw.timelogs[0].updated_at = '2026-09-23T13:00:00.123457+02:00';
    expect(() => parseShiftBatchResult(raw, cmd)).not.toThrow();
  });
  it('accepts SQL nullable day notes in an unchanged return receipt', () => {
    const cmd = transition('return'); cmd.note = 'Opravte'; cmd.affectedEventId = id(31);
    const raw = result(); raw.round.status = 'rejected'; raw.round.note = cmd.note;
    raw.timelogs.forEach((t) => { t.status = 'rejected'; t.review_note = cmd.note as never; t.days[0].note = null as never; });
    expect(parseShiftBatchResult(raw, cmd).timelogs[0].days[0].note).toBe('');
  });
  it('accepts detached complete receipt without inventing missing approval history', () => {
    const raw = result(); const parsed = parseShiftBatchResult(raw, command());
    expect(parsed.requestId).toBe(id(50)); expect(parsed.round?.timelogIds).toEqual([id(21), id(22)]);
    expect(parsed.timelogs[0].days[0].meals).toEqual(['obed', 'vecere']);
    raw.timelogs[0].note = 'late'; expect(parsed.timelogs[0].note).toBe('');
    expect(parsed.timelogs[0].approval).toBeNull();
  });
  it.each(['request_id', 'workflow_id'] as const)('rejects wrong receipt %s as ambiguous', (key) => {
    const raw = result(); raw[key] = id(99);
    expect(() => parseShiftBatchResult(raw, command())).toThrow(/není potvrzen/);
  });
  it('rejects omitted, additional, duplicate, swapped or foreign report identities', () => {
    const missing = result(); missing.timelogs.pop();
    const extra = result(); extra.timelogs.push({ ...extra.timelogs[0], id: id(99) });
    const duplicate = result(); duplicate.timelogs[1] = duplicate.timelogs[0];
    const swapped = result(); swapped.timelogs[0].event_id = id(32);
    const foreign = result(); foreign.timelogs[0].contractor_id = id(4);
    for (const raw of [missing, extra, duplicate, swapped, foreign]) expect(() => parseShiftBatchResult(raw, command())).toThrow();
  });
  it('rejects partial, mismatched and wrong-status frozen round receipts', () => {
    const raws = [result(), result(), result(), result(), result()];
    raws[0].round.timelog_ids.pop(); raws[1].round.event_ids.reverse(); raws[2].round.id = id(41);
    raws[3].round.status = 'approved'; raws[4].timelogs[1].status = 'draft';
    raws.forEach((raw) => expect(() => parseShiftBatchResult(raw, command())).toThrow());
  });
  it('accepts incomplete draft saves with no round, but forbids a fabricated round', () => {
    const cmd = command(); cmd.kind = 'save'; cmd.roundId = null; cmd.timelogs.forEach((t) => { t.days = []; });
    const raw = { ...result(), round: null }; raw.timelogs.forEach((t) => { t.status = 'draft'; t.days = []; t.submitted_at = null as unknown as string; });
    expect(parseShiftBatchResult(raw, cmd).round).toBeNull();
    expect(() => parseShiftBatchResult({ ...raw, round: result().round }, cmd)).toThrow();
  });
  it('requires the correct targeted approval per report on handoff', () => {
    const raw = result(); raw.round.status = 'pending_coo'; raw.timelogs.forEach((t) => { t.status = 'pending_coo'; });
    expect(() => parseShiftBatchResult(raw, transition())).toThrow();
    const approved = { ...raw, timelogs: raw.timelogs.map((t, i) => ({ ...t, approval: { id: id(200 + i), approval_round_id: id(210 + i),
      approver_profile_id: id(5), approver_user_id: id(6), status: 'pending', updated_at: next } })) };
    expect(parseShiftBatchResult(approved, transition()).round?.status).toBe('pending_coo');
    approved.timelogs[1].approval.id = approved.timelogs[0].approval.id;
    expect(() => parseShiftBatchResult(approved, transition())).toThrow();
  });
  it('rejects foreign and malformed before images in correction receipts', () => {
    const cmd = transition('correct'); cmd.note = 'Opraveno'; cmd.affectedEventId = id(31);
    cmd.corrections = command().timelogs.map((t) => ({ ...t, expected_status: 'pending_ch' }));
    const raw = result(); raw.round.status = 'pending_crew_confirmation'; raw.round.note = cmd.note;
    const corrected = { ...raw, timelogs: raw.timelogs.map((t) => ({ ...t, status: 'pending_crew_confirmation', review_note: cmd.note,
      crew_confirmation_snapshot: { ...t, contractor_id: id(99) } })) };
    expect(() => parseShiftBatchResult(corrected, cmd)).toThrow();
  });
  it('validates commands before any write: exact keys, unique ids, coherent cohorts and UUIDs', () => {
    expect(() => assertShiftBatchCommand(command())).not.toThrow();
    const invalids: unknown[] = [ { ...command(), extra: true }, { ...command(), roundId: null }, { ...command(), requestId: 'draft-x' } ];
    const duplicate = command(); duplicate.timelogs[1].id = duplicate.timelogs[0].id; invalids.push(duplicate);
    const invalidStatus = command(); invalidStatus.timelogs[1].expected_status = 'approved'; invalids.push(invalidStatus);
    const duplicateDay = command(); duplicateDay.timelogs[1].days[0].id = duplicateDay.timelogs[0].days[0].id; invalids.push(duplicateDay);
    invalids.forEach((cmd) => expect(() => assertShiftBatchCommand(cmd)).toThrow());
  });
  it('rejects correction target/version mismatch and role-incompatible state/action pairs', () => {
    const cmd = transition('correct'); cmd.note = 'Opraveno'; cmd.affectedEventId = id(31);
    cmd.corrections = command().timelogs.map((t) => ({ ...t, expected_status: 'pending_ch' }));
    expect(() => assertShiftBatchCommand(cmd)).not.toThrow();
    cmd.corrections[0].expected_updated_at = next;
    expect(() => assertShiftBatchCommand(cmd)).toThrow();
    expect(() => assertShiftBatchCommand(transition('approve'))).toThrow();
  });
});
