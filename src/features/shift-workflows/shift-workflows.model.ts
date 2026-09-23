import { format, isValid, parseISO } from 'date-fns';
import type { Event, EventCrewAssignment, Timelog, TimelogType } from '../../types';
import { parseTimeToMinutes } from '../../utils';
import { assertTimelogComplete } from '../timelogs/services/timelog-validation';

export interface ShiftWorkflow {
  id: string;
  eventIds: string[];
  updatedAt: string;
}

export interface ShiftWorkflowRound {
  id: string;
  workflowId: string | null;
  contractorProfileId: string;
  status: 'pending_ch' | 'pending_crew_confirmation' | 'pending_coo' | 'approved' | 'rejected';
  /** Frozen event IDs from round items, retained even when a canonical report is unavailable. */
  eventIds: string[];
  /** Frozen submission membership, separate from each timelog's targeted approval round. */
  timelogIds: string[];
  note: string;
  updatedAt: string;
}

export interface ShiftWorkflowContext {
  workflowId: string | null;
  contractorProfileId: string;
  /** First assigned event in chronological order, independent of the opened event. */
  anchorEventId: string;
  /** All currently assigned parts; may include later drafts outside activeRound. */
  eventIds: string[];
  timelogs: Timelog[];
  activeRound: ShiftWorkflowRound | null;
}

interface ResolveShiftWorkflowInput {
  anchorEventId: string;
  contractorProfileId: string;
  workflows: ShiftWorkflow[];
  assignments: EventCrewAssignment[];
  events: Event[];
  timelogs: Timelog[];
  rounds: ShiftWorkflowRound[];
}

// Supabase emits canonical lowercase UUIDs. Local numeric identities need a separate adapter.
const isUuid = (value: string | null | undefined): value is string => (
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
);

const hasUniqueUuids = (ids: string[]): boolean => (
  ids.every(isUuid) && new Set(ids).size === ids.length
);

const countIds = <T,>(items: T[], getId: (item: T) => string | null | undefined): Map<string, number> => {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const id = getId(item);
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return counts;
};

const isActiveRound = (round: ShiftWorkflowRound): boolean => (
  round.status === 'pending_ch'
  || round.status === 'pending_crew_confirmation'
  || round.status === 'pending_coo'
);

/**
 * Returns null for inaccessible or ambiguous remote membership. Missing reports retain their
 * event section and are reported by submission validation; reports are never synthesized here.
 */
export const resolveShiftWorkflowContext = ({
  anchorEventId, contractorProfileId, workflows, assignments, events, timelogs, rounds,
}: ResolveShiftWorkflowInput): ShiftWorkflowContext | null => {
  if (!isUuid(anchorEventId) || !isUuid(contractorProfileId)) return null;

  const ownAssignments = assignments.filter((item) => item.contractorProfileId === contractorProfileId);
  const assignmentCounts = countIds(ownAssignments, (item) => item.eventSupabaseId);
  if (assignmentCounts.get(anchorEventId) !== 1) return null;

  const anchorWorkflows = workflows.filter((workflow) => workflow.eventIds.includes(anchorEventId));
  if (anchorWorkflows.length > 1) return null;
  const workflow = anchorWorkflows[0];
  if (workflow && (
    !isUuid(workflow.id)
    || !hasUniqueUuids(workflow.eventIds)
    || workflows.filter((item) => item.id === workflow.id).length !== 1
  )) return null;

  const eventIds = (workflow?.eventIds ?? [anchorEventId]).filter((id) => assignmentCounts.has(id));
  const eventCounts = countIds(events, (item) => item.supabaseId);
  if (eventIds.some((id) => (
    assignmentCounts.get(id) !== 1
    || eventCounts.get(id) !== 1
    || workflows.filter((item) => item.eventIds.includes(id)).length !== (workflow ? 1 : 0)
  ))) return null;

  const eventsById = new Map(events.map((item) => [item.supabaseId, item]));
  eventIds.sort((leftId, rightId) => {
    const left = eventsById.get(leftId)!;
    const right = eventsById.get(rightId)!;
    return left.startDate.localeCompare(right.startDate)
      || (parseTimeToMinutes(left.startTime ?? '') ?? 0) - (parseTimeToMinutes(right.startTime ?? '') ?? 0)
      || leftId.localeCompare(rightId);
  });

  const eventIdSet = new Set(eventIds);
  const ownTimelogs = timelogs.filter((item) => (
    item.contractorProfileId === contractorProfileId && eventIdSet.has(item.eventSupabaseId)
  ));
  const timelogIdCounts = countIds(timelogs, (item) => item.supabaseId);
  const timelogEventCounts = countIds(ownTimelogs, (item) => item.eventSupabaseId);
  if (ownTimelogs.some((item) => (
    !isUuid(item.supabaseId)
    || timelogIdCounts.get(item.supabaseId) !== 1
    || timelogEventCounts.get(item.eventSupabaseId) !== 1
  ))) return null;

  const timelogsByEvent = new Map(ownTimelogs.map((item) => [item.eventSupabaseId, item]));
  const orderedTimelogs = eventIds.flatMap((id) => {
    const report = timelogsByEvent.get(id);
    return report ? [report] : [];
  });
  const ownTimelogIds = new Set(orderedTimelogs.map((item) => item.supabaseId));
  const workflowId = workflow?.id ?? null;
  const activeRounds = rounds.filter((item) => (
    item.contractorProfileId === contractorProfileId
    && isActiveRound(item)
    && (
      (workflowId !== null && item.workflowId === workflowId)
      || item.eventIds.some((id) => eventIdSet.has(id))
      || item.timelogIds.some((id) => ownTimelogIds.has(id))
    )
  ));
  if (activeRounds.length > 1) return null;

  const activeRound = activeRounds[0] ?? null;
  if (activeRound && (
    !isUuid(activeRound.id)
    || activeRound.workflowId !== workflowId
    || rounds.filter((item) => item.id === activeRound.id).length !== 1
    || activeRound.timelogIds.length === 0
    || activeRound.eventIds.length !== activeRound.timelogIds.length
    || !hasUniqueUuids(activeRound.eventIds)
    || !hasUniqueUuids(activeRound.timelogIds)
    || activeRound.timelogIds.some((id) => !ownTimelogIds.has(id))
    || activeRound.eventIds.some((id) => {
      const report = timelogsByEvent.get(id);
      return !eventIdSet.has(id) || !report?.supabaseId || !activeRound.timelogIds.includes(report.supabaseId);
    })
  )) return null;

  return {
    workflowId,
    contractorProfileId,
    anchorEventId: eventIds[0],
    eventIds,
    timelogs: orderedTimelogs,
    activeRound,
  };
};

const isCalendarDate = (value: string): boolean => {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseISO(value);
  return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === value;
};

export const formatShiftWorkflowLabel = (context: ShiftWorkflowContext, events: Event[]): string => {
  const sections = context.eventIds.flatMap((id) => {
    const matches = events.filter((item) => item.supabaseId === id);
    return matches.length === 1 ? matches : [];
  });
  const names = [...new Set(sections.map((item) => item.name.trim()).filter(Boolean))];
  const jobs = [...new Set(sections.map((item) => item.job.trim()).filter(Boolean))]
    .filter((job) => !names.includes(job));
  const dates = sections.flatMap((item) => [item.startDate, item.endDate]).filter(isCalendarDate).sort();
  const parts = [names.join(' / '), jobs.join(' / ')].filter(Boolean);
  if (dates.length) {
    const start = dates[0];
    const end = dates[dates.length - 1];
    const endLabel = format(parseISO(end), 'd. M. yyyy');
    const startFormat = start.slice(0, 4) === end.slice(0, 4) ? 'd. M.' : 'd. M. yyyy';
    parts.push(start === end ? endLabel : `${format(parseISO(start), startFormat)} – ${endLabel}`);
  }
  return parts.join(' · ') || 'Směna';
};

const DAY_TYPES: TimelogType[] = ['pripravy', 'instal', 'provoz', 'deinstal'];

/** Validate a new submission only; review actions must use activeRound's frozen timelogIds. */
export const validateShiftWorkflowSubmission = (context: ShiftWorkflowContext): { eventId: string; message: string }[] => {
  const errors: { eventId: string; message: string }[] = [];
  const addError = (eventId: string, message: string) => errors.push({ eventId, message });
  if (
    !isUuid(context.contractorProfileId)
    || (context.workflowId !== null && !isUuid(context.workflowId))
    || !isUuid(context.anchorEventId)
    || context.eventIds.length === 0
    || !hasUniqueUuids(context.eventIds)
    || !context.eventIds.includes(context.anchorEventId)
  ) {
    return [{ eventId: context.anchorEventId, message: 'Části směny nemají jednoznačnou identitu.' }];
  }

  if (context.activeRound) {
    addError(context.anchorEventId, 'Pro tuto směnu již probíhá schvalování.');
  }

  const timelogIdCounts = countIds(context.timelogs, (item) => item.supabaseId);
  const invalidTimelogs = new Set<Timelog>();
  context.timelogs.forEach((item) => {
    if (
      !isUuid(item.supabaseId)
      || !isUuid(item.eventSupabaseId)
      || item.contractorProfileId !== context.contractorProfileId
      || !context.eventIds.includes(item.eventSupabaseId)
      || timelogIdCounts.get(item.supabaseId) !== 1
    ) {
      invalidTimelogs.add(item);
      addError(item.eventSupabaseId ?? context.anchorEventId, 'Výkaz nemá jednoznačnou identitu nebo nepatří do této směny.');
    }
  });

  context.eventIds.forEach((eventId) => {
    const reports = context.timelogs.filter((item) => item.eventSupabaseId === eventId);
    if (reports.length === 0) {
      addError(eventId, 'Chybí výkaz pro tuto část směny.');
      return;
    }
    if (reports.length > 1) {
      addError(eventId, 'Pro tuto část směny existuje více výkazů.');
      return;
    }
    const report = reports[0];
    if (invalidTimelogs.has(report)) return;

    if (!Number.isFinite(report.km) || report.km < 0) {
      addError(eventId, 'Kilometry musí být konečné nezáporné číslo.');
    }
    try {
      assertTimelogComplete(report);
    } catch (error) {
      addError(eventId, (error as Error).message);
    }
    report.days.forEach((day, index) => {
      if (!isCalendarDate(day.d)) addError(eventId, `Doplňte platné datum: záznam ${index + 1}.`);
      if (!DAY_TYPES.includes(day.type)) addError(eventId, `Vyberte platný typ práce: záznam ${index + 1}.`);
    });
  });

  return errors;
};
