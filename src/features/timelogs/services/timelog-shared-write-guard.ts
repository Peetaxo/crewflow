import { appDataSource } from '../../../lib/app-config';
import { supabase } from '../../../lib/supabase';
import type { Timelog } from '../../../types';
import { localShiftWorkflowId, readLocalShiftWorkflows } from '../../shift-workflows/shift-workflows.local';
import { canonicalUuid } from '../../shift-workflows/shift-workflows.contract';

const sharedWriteRequired = () => new Error('Otevřete celý společný výkaz a potvrďte akci v jeho detailu.');
type MembershipClient = { from: (table: 'shift_workflow_round_items' | 'shift_workflow_events') => {
  select: (columns: string) => { in: (column: string, ids: string[]) => PromiseLike<{ data: unknown[] | null; error: unknown }> };
} };

/** Refusal only: this cannot authorize a write or infer a shared batch from old list selections. */
export async function assertLegacyTimelogWrite(reports: Array<Omit<Timelog, 'id'> & { id?: number }>): Promise<void> {
  if (!reports.length) return;
  if (appDataSource === 'local') {
    // Internal inspection must also find another user's rounds. The manager read
    // only rejects unsafe old writes and never publishes this snapshot to a UI.
    const snapshot = readLocalShiftWorkflows({ source: 'local', userId: null, profileId: null, role: 'coo' });
    if (reports.some((report) => snapshot.workflows.some((workflow) => workflow.eventIds.includes(localShiftWorkflowId('event', report.eid)))
      || (report.id !== undefined && snapshot.rounds.some((round) => round.timelogIds.includes(localShiftWorkflowId('timelog', report.id!)))))) {
      throw sharedWriteRequired();
    }
    return;
  }
  if (reports.some((report) => !canonicalUuid.safeParse(report.eventSupabaseId).success
    || (report.id !== undefined && !canonicalUuid.safeParse(report.supabaseId).success))) {
    throw new Error('Nepodařilo se ověřit identitu výkazu. Obnovte data a otevřete jeho detail.');
  }
  if (!supabase) throw new Error('Členství společného výkazu se nepodařilo načíst.');
  const ids = reports.flatMap((report) => report.supabaseId ? [report.supabaseId] : []);
  const eventIds = reports.flatMap((report) => report.eventSupabaseId ? [report.eventSupabaseId] : []);
  const client = supabase as unknown as MembershipClient;
  const results = await Promise.all([
    ids.length ? client.from('shift_workflow_round_items').select('timelog_id').in('timelog_id', ids) : null,
    eventIds.length ? client.from('shift_workflow_events').select('event_id').in('event_id', eventIds) : null,
  ]);
  if (results.some((result) => result && (result.error || !Array.isArray(result.data)))) {
    throw new Error('Členství společného výkazu se nepodařilo načíst.');
  }
  if (results.some((result) => result?.data?.length)) throw sharedWriteRequired();
}
