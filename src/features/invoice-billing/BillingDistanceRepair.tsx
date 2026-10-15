import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import type { BillingStatement } from './contract';
import { makeBillingCommand, type BillingCommand } from './service';
export function BillingDistanceRepair({ statement, busy, onCommand }: { statement: BillingStatement; busy: boolean; onCommand: (command: BillingCommand) => void }) {
  const invalid = statement.financialSnapshot.reports.filter((r) => r.km === null);
  const [values, setValues] = useState<Record<string, string>>({});
  if (!invalid.length) return null;
  const valid = invalid.every((r) => /^\d+(?:[.,]\d{1,2})?$/.test(values[r.timelogId] ?? '') && Number(values[r.timelogId].replace(',', '.')) <= 99999999.99);
  return <form className="space-y-3 rounded-xl border p-3" onSubmit={(e) => { e.preventDefault(); if (!valid) return;
    onCommand(makeBillingCommand({ kind: 'repair', statementId: statement.id, contractorId: statement.contractorId, expectedUpdatedAt: statement.updatedAt,
      sources: statement.sources.map((s) => ({ timelogId: s.timelogId, expectedUpdatedAt: s.reportUpdatedAt,
        km: statement.financialSnapshot.reports.find((r) => r.timelogId === s.timelogId)!.km ?? Number(values[s.timelogId].replace(',', '.')) })) })); }}>
    <p>Doplňte pouze neplatné kilometry. Schválené hodiny, platné kilometry a sazby se zachovají.</p>
    {invalid.map((r) => <label key={r.timelogId} className="block">Kilometry · {r.eventName}<Input inputMode="decimal" value={values[r.timelogId] ?? ''} disabled={busy}
      onChange={(e) => setValues((prev) => ({ ...prev, [r.timelogId]: e.target.value }))} /></label>)}
    <Button disabled={busy || !valid} type="submit">Opravit neplatné kilometry</Button>
  </form>;
}
