import type { Role, Timelog } from '../../types';
import { createStableDraftUuid } from '../stable-draft-identity';
import { mapTimelogConfirmationSnapshot } from '../timelogs/services/timelog-confirmation-snapshot';
import { canonicalUuid, ShiftWorkflowError } from './shift-workflows.contract';
import type { ShiftWorkflowContext } from './shift-workflows.model';
import { prepareShiftDraftSave, prepareShiftSubmission, prepareShiftTransition,
  type ShiftBatchCommand, type ShiftDraftCohort, type ShiftRoundAction } from './shift-workflows.batch-commands';
import type { ShiftBatchResult } from './shift-workflows.batch-contract';

export interface ShiftEvidenceState {
  context: ShiftWorkflowContext; cohort: ShiftDraftCohort; dirty: boolean;
  busy: boolean; busyKind: ShiftBatchCommand['kind'] | null;
  error: Error | null; refreshError: Error | null; canRetry: boolean; needsReload: boolean;
}
type Attempt = { command: ShiftBatchCommand; revisions: Map<string, number> };
export function createShiftEvidenceSession(options: {
  context: ShiftWorkflowContext; role: Role;
  write: (command: ShiftBatchCommand, assertCurrent: () => void) => Promise<ShiftBatchResult>;
  assertCurrent: () => void;
  onSaved?: (result: ShiftBatchResult) => void | Promise<void>;
}) {
  const context = structuredClone(options.context);
  const revisions = new Map<string, number>();
  const savedRevisions = new Map<string, number>();
  for (const report of context.timelogs) {
    report.days = report.days.map((d) => ({ ...d, id: canonicalUuid.safeParse(d.id).success ? d.id : createStableDraftUuid() }));
    revisions.set(report.supabaseId!, 0); savedRevisions.set(report.supabaseId!, 0);
  }
  let state: ShiftEvidenceState = { context, cohort: context.activeRound?.status === 'pending_crew_confirmation' ? 'confirmation' : 'drafts',
    dirty: false, busy: false, busyKind: null, error: null, refreshError: null, canRetry: false, needsReload: false };
  const listeners = new Set<() => void>();
  let active = true;
  let inFlight: Promise<ShiftBatchResult> | null = null;
  let pending: Attempt | null = null;
  const assertCurrent = () => {
    if (!active) throw new ShiftWorkflowError('denied', 'Evidence už byla uzavřena.');
    options.assertCurrent();
  };
  const publish = (patch: Partial<ShiftEvidenceState>) => {
    assertCurrent();
    state = { ...state, ...patch, dirty: [...revisions].some(([id, revision]) => revision !== savedRevisions.get(id)) };
    listeners.forEach((listener) => listener());
  };
  const assertAvailable = () => {
    assertCurrent();
    if (state.needsReload) throw new ShiftWorkflowError('conflict', 'Obnovte evidenci před dalším krokem.');
    if (pending) throw new ShiftWorkflowError('ambiguous', 'Nejdříve zopakujte původní požadavek.');
  };
  const canEdit = (report: Timelog) => {
    const frozen = state.context.activeRound?.timelogIds.includes(report.supabaseId!);
    if (options.role === 'crewhead') return Boolean(frozen && report.status === 'pending_ch');
    if (options.role !== 'crew') return false;
    return state.cohort === 'confirmation' ? Boolean(frozen && report.status === 'pending_crew_confirmation')
      : !frozen && (report.status === 'draft' || report.status === 'rejected');
  };
  const merge = (result: ShiftBatchResult, attempt: Attempt) => {
    const timelogs = state.context.timelogs.map((report) => {
      const raw = result.timelogs.find((t) => t.id === report.supabaseId);
      if (!raw) return report;
      const changedSince = revisions.get(raw.id) !== attempt.revisions.get(raw.id);
      savedRevisions.set(raw.id, attempt.revisions.get(raw.id)!);
      return { ...report, status: raw.status, updatedAt: raw.updated_at, reviewNote: raw.review_note ?? '',
        crewConfirmationSnapshot: mapTimelogConfirmationSnapshot(raw.crew_confirmation_snapshot, raw),
        ...(changedSince ? {} : { km: raw.km, note: raw.note, days: raw.days.map((d) => ({
          id: d.id, d: d.date, f: d.time_from, t: d.time_to, type: d.day_type, note: d.note, meal: d.meal, meals: [...d.meals],
        })) }) };
    });
    const round = result.round;
    const activeRound = round ? ['approved', 'rejected'].includes(round.status) ? null : round : state.context.activeRound;
    publish({ context: { ...state.context, timelogs, activeRound }, error: null, canRetry: false });
  };
  const perform = (attempt: Attempt): Promise<ShiftBatchResult> => {
    assertCurrent();
    publish({ busy: true, busyKind: attempt.command.kind, error: null });
    const running = (async () => {
      try {
        const result = await options.write(structuredClone(attempt.command), assertCurrent);
        assertCurrent();
        pending = null;
        merge(result, attempt);
        // A failed refresh cannot turn a known committed write into a retry.
        try {
          await options.onSaved?.(result);
          publish({ refreshError: null });
        } catch {
          publish({ refreshError: new Error('Změny jsou uložené, ale přehled se nepodařilo obnovit. Znovu načtěte data.') });
        }
        assertCurrent();
        return result;
      } catch (cause) {
        assertCurrent();
        const error = cause instanceof ShiftWorkflowError ? cause : new ShiftWorkflowError('ambiguous', 'Výsledek uložení není potvrzen. Opakujte stejný požadavek.');
        if (error.kind === 'ambiguous') pending = attempt;
        publish({ error, canRetry: error.kind === 'ambiguous', needsReload: ['conflict', 'denied', 'blocked'].includes(error.kind) });
        throw error;
      } finally {
        inFlight = null;
        if (active) {
          try { publish({ busy: false, busyKind: null }); } catch { /* Retired auth scope cannot publish. */ }
        }
      }
    })();
    inFlight = running;
    return running;
  };
  const execute = async (build: () => ShiftBatchCommand) => {
    assertCurrent();
    while (inFlight) await inFlight;
    assertAvailable();
    const command = build();
    return perform({ command, revisions: new Map(revisions) });
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { active = false; listeners.clear(); },
    isEditable: (report: Timelog) => active && !state.needsReload && !pending && (!state.busy || state.busyKind === 'save') && canEdit(report),
    edit: (next: Timelog) => {
      assertAvailable();
      const original = state.context.timelogs.find((t) => t.supabaseId === next.supabaseId);
      if (!original || !canEdit(original) || (state.busy && state.busyKind !== 'save')) throw new ShiftWorkflowError('denied', 'Tuto část evidence nyní nelze upravit.');
      revisions.set(original.supabaseId!, revisions.get(original.supabaseId!)! + 1);
      publish({ context: { ...state.context, timelogs: state.context.timelogs.map((t) => t !== original ? t : {
        ...original, days: structuredClone(next.days), km: next.km, note: next.note,
      }) }, error: null });
    },
    setCohort: (cohort: ShiftDraftCohort) => {
      assertAvailable();
      if (state.dirty || state.busy) throw new ShiftWorkflowError('blocked', 'Nejdříve uložte rozpracované údaje.');
      if (cohort === 'confirmation' && state.context.activeRound?.status !== 'pending_crew_confirmation') throw new ShiftWorkflowError('invalid', 'Potvrzované kolo není dostupné.');
      publish({ cohort });
    },
    save: () => execute(() => {
      if (options.role !== 'crew') throw new ShiftWorkflowError('denied', 'Produkce odesílá úpravy s důvodem k potvrzení crew.');
      return prepareShiftDraftSave(state.context, createStableDraftUuid(), state.cohort);
    }),
    submit: () => execute(() => {
      if (options.role !== 'crew') throw new ShiftWorkflowError('denied', 'Evidenci odesílá člen crew.');
      return prepareShiftSubmission(state.context, createStableDraftUuid(), createStableDraftUuid());
    }),
    transition: (action: ShiftRoundAction, detail: { note?: string; affectedEventId?: string } = {}) => execute(() => {
      if (state.dirty && action !== 'correct') throw new ShiftWorkflowError('blocked', 'Nejdříve uložte úpravy nebo je odešlete crew k potvrzení.');
      return prepareShiftTransition(state.context, createStableDraftUuid(), action, detail);
    }),
    retry: async () => {
      assertCurrent();
      if (inFlight) return inFlight;
      if (!pending || state.needsReload) throw new ShiftWorkflowError('invalid', 'Není co opakovat.');
      return perform(pending);
    },
  };
}
export type ShiftEvidenceSession = ReturnType<typeof createShiftEvidenceSession>;
