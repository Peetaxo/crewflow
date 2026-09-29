import { format, isValid, parseISO } from 'date-fns';
import type { Timelog, TimelogMeal, TimelogStatus, TimelogType } from '../../types';
import { normalizeMealSelection, parseTimeToMinutes } from '../../utils';
import { assertTimelogComplete } from '../timelogs/services/timelog-validation';
import { canonicalUuid, shiftWorkflowTimestamp, ShiftWorkflowError } from './shift-workflows.contract';
import type { ShiftWorkflowContext } from './shift-workflows.model';

export interface ShiftDayPayload {
  id: string; date: string; time_from: string; time_to: string; day_type: TimelogType;
  note: string; meal: TimelogMeal | null; meals: TimelogMeal[];
}
export interface ShiftReportPayload {
  id: string; event_id: string; expected_updated_at: string; expected_status: TimelogStatus;
  km: number; note: string; days: ShiftDayPayload[];
}
export interface ShiftDraftCommand {
  kind: 'save' | 'submit'; requestId: string; roundId: string | null; workflowId: string | null;
  contractorProfileId: string; anchorEventId: string; timelogs: ShiftReportPayload[];
}
export type ShiftRoundAction = 'handoff' | 'approve' | 'return' | 'correct' | 'confirm';
export interface ShiftTransitionCommand {
  kind: 'transition'; requestId: string; roundId: string; workflowId: string | null; contractorProfileId: string;
  expectedRoundUpdatedAt: string; action: ShiftRoundAction; note: string; affectedEventId: string | null;
  targets: { id: string; expected_updated_at: string; expected_status: TimelogStatus }[];
  corrections: ShiftReportPayload[] | null;
}
export type ShiftBatchCommand = ShiftDraftCommand | ShiftTransitionCommand;
export type ShiftDraftCohort = 'drafts' | 'confirmation';

const invalid = (message = 'Části společné evidence nejsou jednoznačné. Obnovte data.'): never => {
  throw new ShiftWorkflowError('invalid', message);
};
const uuid = (value: unknown): value is string => canonicalUuid.safeParse(value).success;
const unique = (values: unknown[]) => new Set(values).size === values.length;
const pending: TimelogStatus[] = ['pending_ch', 'pending_coo', 'pending_crew_confirmation'];
const phases: TimelogType[] = ['pripravy', 'instal', 'provoz', 'deinstal'];

function checkedReports(context: ShiftWorkflowContext) {
  const { timelogs, eventIds, activeRound } = context;
  if (!uuid(context.contractorProfileId) || !uuid(context.anchorEventId)
    || (context.workflowId !== null && !uuid(context.workflowId))
    || !eventIds.length || !unique(eventIds) || eventIds.some((id) => !uuid(id))
    || !eventIds.includes(context.anchorEventId) || (context.workflowId === null && eventIds.length !== 1)
    || timelogs.length !== eventIds.length || !unique(timelogs.map((t) => t.supabaseId))
    || !unique(timelogs.map((t) => t.eventSupabaseId))
    || timelogs.some((t) => !uuid(t.supabaseId) || !uuid(t.eventSupabaseId) || !eventIds.includes(t.eventSupabaseId!)
      || t.contractorProfileId !== context.contractorProfileId || !shiftWorkflowTimestamp.safeParse(t.updatedAt).success)) invalid();
  if (activeRound && (!uuid(activeRound.id) || activeRound.workflowId !== context.workflowId
    || activeRound.contractorProfileId !== context.contractorProfileId || !pending.includes(activeRound.status)
    || !shiftWorkflowTimestamp.safeParse(activeRound.updatedAt).success || !activeRound.timelogIds.length
    || activeRound.timelogIds.length !== activeRound.eventIds.length || !unique(activeRound.timelogIds) || !unique(activeRound.eventIds)
    || activeRound.timelogIds.some((id, i) => !timelogs.some((t) => t.supabaseId === id && t.eventSupabaseId === activeRound.eventIds[i]
      && t.status === activeRound.status)))) invalid();
  if (timelogs.some((t) => pending.includes(t.status) && !activeRound?.timelogIds.includes(t.supabaseId!))) invalid();
  return timelogs;
}

export function selectShiftDrafts(context: ShiftWorkflowContext, cohort: ShiftDraftCohort = 'drafts'): Timelog[] {
  const reports = checkedReports(context);
  if (cohort === 'confirmation') {
    if (context.activeRound?.status !== 'pending_crew_confirmation') invalid();
    return reports.filter((t) => context.activeRound!.timelogIds.includes(t.supabaseId!));
  }
  return reports.filter((t) => (t.status === 'draft' || t.status === 'rejected')
    && !context.activeRound?.timelogIds.includes(t.supabaseId!));
}

export function serializeShiftReports(reports: Timelog[], complete = false): ShiftReportPayload[] {
  if (!reports.length || reports.length > 200) invalid('Není k dispozici žádná část evidence k uložení.');
  if (!unique(reports.map((t) => t.supabaseId)) || !unique(reports.map((t) => t.eventSupabaseId))
    || reports.some((t) => !uuid(t.supabaseId) || !uuid(t.eventSupabaseId))) invalid();
  const dayIds = new Set<string>();
  return [...reports].sort((a, b) => a.supabaseId!.localeCompare(b.supabaseId!)).map((t) => {
    if (!uuid(t.supabaseId) || !uuid(t.eventSupabaseId) || !shiftWorkflowTimestamp.safeParse(t.updatedAt).success
      || !Number.isFinite(t.km) || t.km < 0 || typeof t.note !== 'string') invalid();
    if (!t.days.length && t.status !== 'draft') invalid('Doplňte alespoň jeden záznam hodin.');
    if (complete) {
      try { assertTimelogComplete(t); } catch (error) { invalid((error as Error).message); }
    }
    return { id: t.supabaseId!, event_id: t.eventSupabaseId!, expected_updated_at: t.updatedAt!, expected_status: t.status,
      km: t.km, note: t.note, days: t.days.map((d) => {
        const parsed = parseISO(d.d);
        if (!uuid(d.id) || dayIds.has(d.id) || !/^\d{4}-\d{2}-\d{2}$/.test(d.d) || !isValid(parsed) || format(parsed, 'yyyy-MM-dd') !== d.d
          || !phases.includes(d.type) || (d.f !== '' && parseTimeToMinutes(d.f) === null)
          || (d.t !== '' && parseTimeToMinutes(d.t) === null) || (d.note != null && typeof d.note !== 'string')) invalid('Některý záznam dne není platný. Obnovte evidenci.');
        dayIds.add(d.id!);
        const meals = normalizeMealSelection(d);
        return { id: d.id!, date: d.d, time_from: d.f, time_to: d.t, day_type: d.type,
          note: d.note ?? '', meals, meal: meals[0] ?? null };
      }) };
  });
}

export function prepareShiftDraftSave(context: ShiftWorkflowContext, requestId: string, cohort: ShiftDraftCohort = 'drafts'): ShiftDraftCommand {
  if (!uuid(requestId)) invalid();
  const reports = selectShiftDrafts(context, cohort);
  return { kind: 'save', requestId, workflowId: context.workflowId, contractorProfileId: context.contractorProfileId,
    anchorEventId: cohort === 'confirmation' ? context.activeRound!.eventIds[0] : context.anchorEventId,
    roundId: cohort === 'confirmation' ? context.activeRound!.id : null, timelogs: serializeShiftReports(reports) };
}

export function prepareShiftSubmission(context: ShiftWorkflowContext, requestId: string, roundId: string): ShiftDraftCommand {
  if (!uuid(requestId) || !uuid(roundId)) invalid();
  if (context.activeRound) invalid('Pro tyto směny už probíhá schvalování. Nové části zatím uložte rozpracované.');
  const reports = selectShiftDrafts(context);
  return { kind: 'submit', requestId, roundId, workflowId: context.workflowId, contractorProfileId: context.contractorProfileId,
    anchorEventId: context.anchorEventId, timelogs: serializeShiftReports(reports, true) };
}

export function prepareShiftTransition(context: ShiftWorkflowContext, requestId: string, action: ShiftRoundAction,
  options: { note?: string; affectedEventId?: string } = {},
): ShiftTransitionCommand {
  const reports = checkedReports(context);
  const round = context.activeRound;
  if (!uuid(requestId) || !round) invalid();
  const allowed: Record<string, ShiftRoundAction[]> = {
    pending_ch: ['handoff', 'return', 'correct'], pending_coo: ['approve', 'return'], pending_crew_confirmation: ['confirm'],
  };
  if (!allowed[round!.status]?.includes(action)) invalid('Tento krok není v aktuálním stavu dostupný.');
  const frozen = reports.filter((t) => round!.timelogIds.includes(t.supabaseId!)).sort((a, b) => a.supabaseId!.localeCompare(b.supabaseId!));
  const note = options.note?.trim() ?? '';
  const affectedEventId = options.affectedEventId ?? null;
  if (action === 'correct' || action === 'return') {
    if (!note || !affectedEventId || !round!.eventIds.includes(affectedEventId)) invalid('Doplňte důvod a vyberte dotčenou směnu.');
  } else if (note || affectedEventId) invalid();
  if (action === 'confirm') serializeShiftReports(frozen, true);
  return { kind: 'transition', requestId, roundId: round!.id, workflowId: context.workflowId, contractorProfileId: context.contractorProfileId,
    expectedRoundUpdatedAt: round!.updatedAt, action, note, affectedEventId,
    targets: frozen.map((t) => ({ id: t.supabaseId!, expected_updated_at: t.updatedAt!, expected_status: t.status })),
    corrections: action === 'correct' ? serializeShiftReports(frozen) : null };
}
