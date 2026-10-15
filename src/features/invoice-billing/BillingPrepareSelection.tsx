import { useEffect, useState } from 'react';
import { billingPreparationGroups } from './preparation';
import type { BillingSnapshot } from './contract';
import type { Timelog } from '../../types';
import { Button } from '../../components/ui/button';
import { getInvoiceDependencies } from '../invoices/services/invoices.service';
import { makeBillingCommand, type BillingCommand } from './service';
export function BillingPrepareSelection({ busy, onCommand, snapshot, available, onDirtyChange }: { snapshot: BillingSnapshot | undefined; available: boolean; onDirtyChange?: (value: boolean) => void; busy: boolean; onCommand: (c: BillingCommand) => void }) {
  const [selection, setSelection] = useState<string[]>([]);
  useEffect(() => { onDirtyChange?.(selection.length > 0); return () => onDirtyChange?.(false); }, [onDirtyChange, selection]);
  const data = getInvoiceDependencies();
  const groups = billingPreparationGroups(snapshot, available, data.timelogs ?? []);
  const eligibleKey = JSON.stringify(groups.map((group) => group.map((t) => t.supabaseId!).sort()));
  useEffect(() => {
    const sets = JSON.parse(eligibleKey) as string[][];
    setSelection((prev) => { const next = sets.flatMap((ids) => ids.every((id) => prev.includes(id)) ? ids : []); return JSON.stringify(next) === JSON.stringify(prev) ? prev : next; });
  }, [eligibleKey]);
  const selected = groups.flatMap((group) => group.every((t) => selection.includes(t.supabaseId!)) ? group.map((t) => t.supabaseId!) : []);
  const prepare = () => {
    if (busy || !available || !snapshot) return;
    const current = billingPreparationGroups(snapshot, available, getInvoiceDependencies().timelogs);
    const ids = current.flatMap((group) => group.every((t) => selected.includes(t.supabaseId!)) ? group.map((t) => t.supabaseId!) : []).sort();
    if (ids.length) onCommand(makeBillingCommand({ kind: 'prepare', timelogIds: ids }));
  };
  const label = (t: Timelog) => {
    const event = data.events.find((e) => e.id === t.eid); const contractor = data.contractors.find((c) => c.profileId === t.contractorProfileId);
    return `${contractor?.name || 'Dodavatel'} · ${event?.name || 'Akce'} · ${event?.job || ''}`;
  };
  return <details className="nodu-panel rounded-2xl p-4"><summary>Připravit historický podklad</summary><p className="my-2 text-sm">Vyberte úplné schválené výkazy jednoho dodavatele a odběratele. Přesnou částku a schválené dny potvrdí server v podkladu. Výběr podkladu vždy zahrnuje všechny jeho výkazy. Vystavení pak potvrzuje dodavatel.</p>
    {(!available || !snapshot) && <p role="status">Nejprve načtěte a ověřte aktuální podklady.</p>}
    <div className="max-h-60 space-y-2 overflow-y-auto">{groups.map((group) => {
      const ids = group.map((t) => t.supabaseId!); const checked = ids.every((id) => selected.includes(id));
      return <label key={ids.join(':')} className="flex gap-2 text-sm"><input type="checkbox" disabled={busy} checked={checked} onChange={(e) => setSelection((prev) => e.target.checked ? [...new Set([...prev, ...ids])] : prev.filter((id) => !ids.includes(id)))} />{group.map(label).join('; ')}</label>;
    })}</div>
    <Button className="mt-3" disabled={busy || !selected.length || !available || !snapshot} onClick={prepare}>Připravit podklad</Button>
  </details>;
}
