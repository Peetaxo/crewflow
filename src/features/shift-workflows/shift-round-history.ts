import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { canonicalUuid, shiftWorkflowTimestamp, ShiftWorkflowError, type ShiftWorkflowScope } from './shift-workflows.contract';

export interface ShiftRoundAction {
  id: string; roundId: string; action: string; label: string; note: string; eventId: string | null; createdAt: string;
}
const labels: Record<string, string> = {
  submit: 'Odesláno', resubmit: 'Znovu odesláno', handoff: 'Předáno COO', approve: 'Schváleno',
  return: 'Vráceno', return_to_crew: 'Vráceno crew', return_to_ch: 'Vráceno CrewHead',
  correct: 'Opraveno CrewHead', confirm: 'Potvrzeno crew',
};
const schema = z.array(z.object({ id: canonicalUuid, round_id: canonicalUuid, action: z.string().min(1),
  note: z.string(), event_id: canonicalUuid.nullable(), created_at: shiftWorkflowTimestamp }).strict());
type HistoryClient = { from: (table: 'shift_workflow_round_actions') => {
  select: (columns: string) => { in: (column: 'round_id', ids: string[]) => {
    order: (column: 'created_at') => { abortSignal: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }> };
  } };
} };

export async function readShiftRoundHistory(scope: ShiftWorkflowScope, ids: string[], signal: AbortSignal): Promise<ShiftRoundAction[]> {
  if (signal.aborted) throw new DOMException('Čtení bylo přerušeno.', 'AbortError');
  if (scope.source === 'local' || ids.length === 0) return [];
  if (!scope.userId || !scope.profileId || !supabase) throw new ShiftWorkflowError('denied', 'Přihlaste se znovu.');
  const result = await (supabase as unknown as HistoryClient).from('shift_workflow_round_actions')
    .select('id,round_id,action,note,event_id,created_at').in('round_id', ids).order('created_at').abortSignal(signal);
  if (signal.aborted) throw new DOMException('Čtení bylo přerušeno.', 'AbortError');
  const parsed = schema.safeParse(result.data);
  if (result.error || !parsed.success || parsed.data.some((row) => !ids.includes(row.round_id))) {
    throw new ShiftWorkflowError('invalid', 'Historii schvalování se nepodařilo načíst.');
  }
  return parsed.data.map((row) => ({ id: row.id, roundId: row.round_id, action: row.action,
    label: labels[row.action] ?? row.action, note: row.note, eventId: row.event_id, createdAt: row.created_at }));
}
