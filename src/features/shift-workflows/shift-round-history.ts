import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { canonicalUuid, shiftWorkflowTimestamp, ShiftWorkflowError, type ShiftWorkflowScope } from './shift-workflows.contract';
import { readLocalShiftRoundHistory } from './shift-workflows.local';
import { compareShiftWorkflowTimestamps } from './shift-workflow-time';

export interface ShiftRoundAction {
  id: string; roundId: string; action: string; label: string; note: string; eventId: string | null; createdAt: string;
}
const labels: Record<string, string> = {
  submitted: 'Odesláno', resubmitted: 'Znovu odesláno', handoff: 'Předáno COO', approve: 'Schváleno',
  return: 'Vráceno', return_to_crew: 'Vráceno crew', return_to_ch: 'Vráceno CrewHead',
  correct: 'Opraveno CrewHead', confirm: 'Potvrzeno crew',
};
const schema = z.array(z.object({ id: canonicalUuid, round_id: canonicalUuid, action: z.string().min(1),
  note: z.string(), event_id: canonicalUuid.nullable(), created_at: shiftWorkflowTimestamp }).strict());
type HistoryQuery = {
  order: (column: 'created_at' | 'id') => HistoryQuery;
  range: (from: number, to: number) => { abortSignal: (signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown; count: number | null }> };
};
type HistoryClient = { from: (table: 'shift_workflow_round_actions') => {
  select: (columns: string, options: { count: 'exact' }) => { in: (column: 'round_id', ids: string[]) => HistoryQuery };
} };

export async function readShiftRoundHistory(scope: ShiftWorkflowScope, ids: string[], signal: AbortSignal): Promise<ShiftRoundAction[]> {
  if (signal.aborted) throw new DOMException('Čtení bylo přerušeno.', 'AbortError');
  if (ids.length === 0) return [];
  if (scope.source === 'local') return readLocalShiftRoundHistory(scope, ids).map((action) => ({
    id: action.id, roundId: action.roundId, action: action.action, label: labels[action.action] ?? action.action,
    note: action.note, eventId: action.eventId, createdAt: action.createdAt,
  }));
  if (!scope.userId || !scope.profileId || !supabase) throw new ShiftWorkflowError('denied', 'Přihlaste se znovu.');
  const invalid = () => new ShiftWorkflowError('invalid', 'Historii schvalování se nepodařilo načíst.');
  const rows: z.infer<typeof schema> = [];
  const seen = new Set<string>();
  for (let batchStart = 0; batchStart < ids.length; batchStart += 50) {
    const batchIds = ids.slice(batchStart, batchStart + 50);
    let batchCount = 0;
    let expectedCount: number | null = null;
    let previous: z.infer<typeof schema>[number] | undefined;
    do {
      if (signal.aborted) throw new DOMException('Čtení bylo přerušeno.', 'AbortError');
      const result = await (supabase as unknown as HistoryClient).from('shift_workflow_round_actions')
        .select('id,round_id,action,note,event_id,created_at', { count: 'exact' }).in('round_id', batchIds)
        .order('created_at').order('id').range(batchCount, batchCount + 99).abortSignal(signal);
      if (signal.aborted) throw new DOMException('Čtení bylo přerušeno.', 'AbortError');
      const parsed = schema.safeParse(result.data);
      if (result.error || !parsed.success || result.count === null || !Number.isSafeInteger(result.count)
        || result.count < 0 || (expectedCount !== null && expectedCount !== result.count)
        || (parsed.data.length === 0 && batchCount < result.count)
        || batchCount + parsed.data.length > result.count) throw invalid();
      expectedCount = result.count;
      for (const row of parsed.data) {
        if (!batchIds.includes(row.round_id) || seen.has(row.id) || (previous && (
          compareShiftWorkflowTimestamps(previous.created_at, row.created_at) > 0
          || (compareShiftWorkflowTimestamps(previous.created_at, row.created_at) === 0 && previous.id >= row.id)
        ))) throw invalid();
        seen.add(row.id); rows.push(row); previous = row;
      }
      batchCount += parsed.data.length;
    } while (batchCount < expectedCount);
  }
  rows.sort((a, b) => compareShiftWorkflowTimestamps(a.created_at, b.created_at) || a.id.localeCompare(b.id));
  return rows.map((row) => ({ id: row.id, roundId: row.round_id, action: row.action,
    label: labels[row.action] ?? row.action, note: row.note, eventId: row.event_id, createdAt: row.created_at }));
}
