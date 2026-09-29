import { format, isValid, parseISO } from 'date-fns';
import { z } from 'zod';
import { mapTimelogConfirmationSnapshot } from '../timelogs/services/timelog-confirmation-snapshot';
import { normalizeMealSelection, parseTimeToMinutes } from '../../utils';
import { assertTimelogComplete } from '../timelogs/services/timelog-validation';
import type { ShiftWorkflowRound } from './shift-workflows.model';
import type { ShiftBatchCommand } from './shift-workflows.batch-commands';
import { canonicalUuid as uuid, shiftWorkflowTimestamp as timestamp, ShiftWorkflowError, shiftWorkflowAmbiguous } from './shift-workflows.contract';

const unique = (values: readonly string[]) => new Set(values).size === values.length;
const status = z.enum(['draft', 'pending_ch', 'pending_crew_confirmation', 'pending_coo', 'approved', 'rejected', 'invoiced', 'paid']);
const meal = z.enum(['obed', 'vecere']);
const dayFields = z.object({
  id: uuid, date: z.string().refine((value) => {
    const parsed = parseISO(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
  }),
  time_from: z.string().refine((v) => v === '' || parseTimeToMinutes(v) !== null),
  time_to: z.string().refine((v) => v === '' || parseTimeToMinutes(v) !== null),
  day_type: z.enum(['pripravy', 'instal', 'provoz', 'deinstal']), note: z.string(),
  meal: meal.nullable(), meals: z.array(meal).max(2).refine(unique),
}).strict();
const day = dayFields.refine((d) => d.meal === (d.meals[0] ?? null));
const receiptDay = dayFields.extend({
  note: z.string().nullable().transform((v) => v ?? ''),
  time_from: dayFields.shape.time_from.nullable().transform((v) => v ?? ''),
  time_to: dayFields.shape.time_to.nullable().transform((v) => v ?? ''),
  meals: z.array(meal),
}).transform((d) => {
  const meals = normalizeMealSelection(d);
  return { ...d, meals, meal: meals[0] ?? null };
});
const report = z.object({ id: uuid, event_id: uuid, expected_updated_at: timestamp, expected_status: status,
  km: z.number().finite().nonnegative(), note: z.string(), days: z.array(day).max(500) }).strict();
const targets = z.array(z.object({ id: uuid, expected_updated_at: timestamp, expected_status: status }).strict()).min(1).max(200);
const common = { requestId: uuid, workflowId: uuid.nullable(), contractorProfileId: uuid };
const commandSchema = z.union([
  z.object({ ...common, kind: z.enum(['save', 'submit']), roundId: uuid.nullable(), anchorEventId: uuid,
    timelogs: z.array(report).min(1).max(200) }).strict(),
  z.object({ ...common, kind: z.literal('transition'), roundId: uuid, expectedRoundUpdatedAt: timestamp,
    action: z.enum(['handoff', 'approve', 'return', 'correct', 'confirm']), note: z.string(), affectedEventId: uuid.nullable(),
    targets, corrections: z.array(report).min(1).max(200).nullable() }).strict(),
]);
const complete = (rows: z.infer<typeof report>[]) => rows.every((t) => {
  try {
    assertTimelogComplete({ days: t.days.map((d) => ({ d: d.date!, f: d.time_from!, t: d.time_to!, type: d.day_type! })) });
    return true;
  } catch { return false; }
});
const validReports = (rows: z.infer<typeof report>[]) => unique(rows.map((t) => t.id)) && unique(rows.map((t) => t.event_id))
  && unique(rows.flatMap((t) => t.days.map((d) => d.id))) && rows.every((t) => t.expected_status === 'draft' || t.days.length > 0);

/** Runtime validation is repeated at the writer boundary, not just in UI builders. */
export function assertShiftBatchCommand(value: unknown): asserts value is ShiftBatchCommand {
  const parsed = commandSchema.safeParse(value);
  const invalid = (): never => { throw new ShiftWorkflowError('invalid', 'Společná evidence obsahuje neplatný požadavek. Obnovte data.'); };
  if (!parsed.success) invalid();
  const c = parsed.data!;
  if (c.kind !== 'transition') {
    if (!validReports(c.timelogs) || (c.workflowId === null && (c.timelogs.length !== 1 || c.timelogs[0].event_id !== c.anchorEventId))) invalid();
    const expected = c.kind === 'save' && c.roundId !== null ? ['pending_crew_confirmation'] : ['draft', 'rejected'];
    if (c.timelogs.some((t) => !expected.includes(t.expected_status)) || (c.kind === 'submit' && (!c.roundId || !complete(c.timelogs)))) invalid();
  } else {
    if (!unique(c.targets.map((t) => t.id))) invalid();
    const expected = c.action === 'approve' ? ['pending_coo'] : c.action === 'confirm' ? ['pending_crew_confirmation']
      : c.action === 'return' ? ['pending_ch', 'pending_coo'] : ['pending_ch'];
    if (new Set(c.targets.map((t) => t.expected_status)).size !== 1 || c.targets.some((t) => !expected.includes(t.expected_status))) invalid();
    const annotated = c.action === 'return' || c.action === 'correct';
    if (annotated ? !c.note.trim() || !c.affectedEventId : c.note !== '' || c.affectedEventId !== null) invalid();
    if (c.action === 'correct') {
      const corrections = c.corrections;
      if (!corrections || !validReports(corrections) || corrections.length !== c.targets.length
        || !corrections.some((t) => t.event_id === c.affectedEventId)
        || corrections.some((t) => !c.targets.some((target) => target.id === t.id
          && target.expected_status === t.expected_status && target.expected_updated_at === t.expected_updated_at))) invalid();
    } else if (c.corrections !== null) invalid();
  }
}

const round = z.object({ id: uuid, workflow_id: uuid.nullable(), contractor_id: uuid,
  status: z.enum(['pending_ch', 'pending_crew_confirmation', 'pending_coo', 'approved', 'rejected']),
  event_ids: z.array(uuid).min(1).refine(unique), timelog_ids: z.array(uuid).min(1).refine(unique),
  note: z.string(), updated_at: timestamp }).strict();
const receiptReport = z.object({ id: uuid, event_id: uuid, contractor_id: uuid, status, updated_at: timestamp,
  km: z.number().finite().nonnegative(), note: z.string(), review_note: z.string().nullable(),
  crew_confirmation_snapshot: z.unknown().refine((v) => v !== undefined), submitted_at: timestamp.nullable(), approved_at: timestamp.nullable(),
  days: z.array(receiptDay).max(500), approval: z.object({ id: uuid, approval_round_id: uuid, status: z.enum(['pending', 'approved', 'returned']),
    updated_at: timestamp, approver_profile_id: uuid, approver_user_id: uuid }).strict().nullable(),
}).strict();
const receipt = z.object({ request_id: uuid, workflow_id: uuid.nullable(), round: round.nullable(),
  timelogs: z.array(receiptReport).min(1).max(200) }).strict();
// The app predates strictNullChecks; make successfully validated keys required
// at this boundary rather than spreading Zod's optional inferred keys downstream.
export type ShiftReceiptTimelog = Required<z.infer<typeof receiptReport>> & {
  days: Required<z.infer<typeof day>>[];
  approval: Required<NonNullable<z.infer<typeof receiptReport>['approval']>> | null;
};
export interface ShiftBatchResult {
  requestId: string; workflowId: string | null; round: ShiftWorkflowRound | null; timelogs: ShiftReceiptTimelog[];
}

function isLater(next: string, previous: string): boolean {
  const fraction = /\.(\d+)(?=Z$|[+-]\d{2}:\d{2}$)/;
  const parts = [next, previous].map((value) => ({
    seconds: BigInt(Date.parse(value.replace(fraction, '')) / 1000), fraction: value.match(fraction)?.[1] ?? '',
  }));
  const precision = Math.max(...parts.map((part) => part.fraction.length));
  const values = parts.map((part) => part.seconds * (10n ** BigInt(precision)) + BigInt(part.fraction.padEnd(precision, '0') || '0'));
  return values[0] > values[1];
}

function matchesWrittenValues(saved: ShiftReceiptTimelog, input: { km: number; note: string; days: z.infer<typeof day>[] }): boolean {
  if (saved.km !== input.km || saved.note !== input.note || saved.days.length !== input.days.length) return false;
  return input.days.every((d) => {
    const actual = saved.days.find((v) => v.id === d.id);
    return actual && actual.date === d.date && actual.time_from === d.time_from && actual.time_to === d.time_to
      && actual.day_type === d.day_type && actual.note === d.note && actual.meal === d.meal
      && JSON.stringify(actual.meals) === JSON.stringify(d.meals);
  });
}

export function parseShiftBatchResult(value: unknown, command: ShiftBatchCommand): ShiftBatchResult {
  assertShiftBatchCommand(command);
  const parsed = receipt.safeParse(value);
  if (!parsed.success) throw shiftWorkflowAmbiguous();
  const data = parsed.data as { request_id: string; workflow_id: string | null;
    round: Required<z.infer<typeof round>> | null; timelogs: ShiftReceiptTimelog[] };
  const inputs = command.kind === 'transition' ? command.targets : command.timelogs;
  const inputIds = new Set(inputs.map((t) => t.id));
  const expectedStatus = command.kind === 'transition'
    ? ({ handoff: 'pending_coo', approve: 'approved', return: 'rejected', correct: 'pending_crew_confirmation', confirm: 'pending_ch' } as const)[command.action]
    : command.kind === 'submit' ? 'pending_ch' : null;
  if (data.request_id !== command.requestId || data.workflow_id !== command.workflowId
    || data.timelogs.length !== inputIds.size || !unique(data.timelogs.map((t) => t.id))
    || !unique(data.timelogs.map((t) => t.event_id)) || !unique(data.timelogs.flatMap((t) => t.days.map((d) => d.id)))) throw shiftWorkflowAmbiguous();
  for (const t of data.timelogs) {
    const input = inputs.find((v) => v.id === t.id);
    if (!input || t.contractor_id !== command.contractorProfileId || t.status !== (expectedStatus ?? input.expected_status)
      || ('event_id' in input && t.event_id !== input.event_id)
      || !isLater(t.updated_at, input.expected_updated_at)) throw shiftWorkflowAmbiguous();
    const written = command.kind === 'transition' ? command.corrections?.find((v) => v.id === t.id)
      : command.timelogs.find((v) => v.id === t.id);
    if (written && !matchesWrittenValues(t, written)) throw shiftWorkflowAmbiguous();
    try { mapTimelogConfirmationSnapshot(t.crew_confirmation_snapshot, t); } catch { throw shiftWorkflowAmbiguous(); }
    if (command.kind === 'transition' && command.action === 'correct' && t.crew_confirmation_snapshot === null) throw shiftWorkflowAmbiguous();
  }
  if (command.roundId === null) {
    if (data.round !== null) throw shiftWorkflowAmbiguous();
  } else {
    const r = data.round;
    if (!r || r.id !== command.roundId || r.workflow_id !== command.workflowId || r.contractor_id !== command.contractorProfileId
      || r.status !== (expectedStatus ?? 'pending_crew_confirmation') || r.timelog_ids.length !== inputIds.size || r.event_ids.length !== inputIds.size
      || r.timelog_ids.some((id, i) => !data.timelogs.some((t) => t.id === id && t.event_id === r.event_ids[i]))
      || (command.kind === 'transition' && !isLater(r.updated_at, command.expectedRoundUpdatedAt))) throw shiftWorkflowAmbiguous();
  }
  const approvals = data.timelogs.flatMap((t) => t.approval ? [t.approval] : []);
  if (!unique(approvals.map((a) => a.id)) || !unique(approvals.map((a) => a.approval_round_id))) throw shiftWorkflowAmbiguous();
  const approvalStatus = expectedStatus === 'pending_coo' ? 'pending' : command.kind === 'transition' && inputs[0].expected_status === 'pending_coo'
    ? command.action === 'approve' ? 'approved' : 'returned' : null;
  if (approvalStatus && (approvals.length !== inputIds.size || approvals.some((a) => a.status !== approvalStatus)
    || new Set(approvals.map((a) => a.approver_profile_id)).size !== 1 || new Set(approvals.map((a) => a.approver_user_id)).size !== 1)) throw shiftWorkflowAmbiguous();
  const r = data.round;
  return { requestId: data.request_id, workflowId: data.workflow_id, timelogs: data.timelogs,
    round: r ? { id: r.id, workflowId: r.workflow_id, contractorProfileId: r.contractor_id, status: r.status,
      eventIds: r.event_ids, timelogIds: r.timelog_ids, note: r.note, updatedAt: r.updated_at } : null };
}
