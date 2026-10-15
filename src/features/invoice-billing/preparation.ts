import type { Timelog } from '../../types';
import type { BillingSnapshot } from './contract';
/** A current reservation is selectable only as a complete, verified source set. */
export function billingPreparationGroups(snapshot: BillingSnapshot | undefined, available: boolean, rows: Timelog[]): Timelog[][] {
  if (!available || !snapshot) return [];
  const approved = new Map(rows.filter((t) => t.status === 'approved' && t.supabaseId).map((t) => [t.supabaseId!, t]));
  const reserved = new Set(snapshot.statements.flatMap((s) => s.sources.map((x) => x.timelogId)));
  const historical = new Set(snapshot.supersededStatements.flatMap((s) => s.sources.map((x) => x.timelogId)));
  const groups: Timelog[][] = [];
  for (const s of snapshot.statements) {
    if (s.needsSourceVerification || s.supersededByStatementId || !['ready', 'blocked', 'document_returned'].includes(s.status)) continue;
    const reports = s.sources.map((source) => approved.get(source.timelogId));
    if (reports.every((t) => t && t.contractorProfileId === s.contractorId)) groups.push(reports as Timelog[]);
  }
  for (const [id, row] of approved) if (!reserved.has(id) && !historical.has(id)) groups.push([row]);
  return groups;
}
