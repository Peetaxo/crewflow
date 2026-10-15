import { useEffect, useState } from 'react';
import type { Timelog } from '../../types';
import { Button } from '../../components/ui/button';
import { getInvoiceDependencies } from '../invoices/services/invoices.service';
import { makeBillingCommand, type BillingCommand } from './service';
export function BillingPrepareSelection({ busy, onCommand, excludedIds = [], onDirtyChange }: { onDirtyChange?: (value: boolean) => void; excludedIds?: string[]; busy: boolean; onCommand: (c: BillingCommand) => void }) {
  const [selection, setSelection] = useState<string[]>([]);
  useEffect(() => { onDirtyChange?.(selection.length > 0); return () => onDirtyChange?.(false); }, [onDirtyChange, selection]);
  const data = getInvoiceDependencies();
  const reports = (data.timelogs ?? []).filter((t) => t.status === 'approved' && t.supabaseId && !excludedIds.includes(t.supabaseId));
  const label = (t: Timelog) => {
    const event = data.events.find((e) => e.id === t.eid); const contractor = data.contractors.find((c) => c.profileId === t.contractorProfileId);
    return `${contractor?.name || 'Dodavatel'} · ${event?.name || 'Akce'} · ${event?.job || ''}`;
  };
  return <details className="nodu-panel rounded-2xl p-4"><summary>Připravit historický podklad</summary><p className="my-2 text-sm">Vyberte úplné schválené výkazy jednoho dodavatele a odběratele. Přesnou částku a schválené dny potvrdí server v podkladu. Vystavení pak potvrzuje dodavatel.</p>
    <div className="max-h-60 space-y-2 overflow-y-auto">{reports.map((t) => <label key={t.supabaseId} className="flex gap-2 text-sm"><input type="checkbox" disabled={busy} checked={selection.includes(t.supabaseId!)} onChange={(e) => setSelection((prev) => e.target.checked ? [...prev, t.supabaseId!] : prev.filter((id) => id !== t.supabaseId))} />{label(t)}</label>)}</div>
    <Button className="mt-3" disabled={busy || !selection.length} onClick={() => onCommand(makeBillingCommand({ kind: 'prepare', timelogIds: [...selection].sort() }))}>Připravit podklad</Button>
  </details>;
}
