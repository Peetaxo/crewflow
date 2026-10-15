import { Button } from '../../components/ui/button';
import { useBilling } from './useBilling';
import { BillingConsentPanel } from './BillingConsentPanel';
import { BillingOperationFeedback } from './BillingOperationFeedback';
export function BillingSettings() {
  const billing = useBilling();
  if (!billing.ready) return <p>Načítám přihlášení…</p>;
  if (billing.scope.role !== 'crew') return <p>Trvalý souhlas spravuje pouze člen crew ve vlastním účtu. Kontrola originálů a záznam úhrad jsou dostupné ve Fakturách.</p>;
  return <div key={billing.scopeKey} className="space-y-4"><BillingOperationFeedback billing={billing} />
    {billing.query.error && <p role="alert">Souhlas se nepodařilo načíst. <Button onClick={() => { void billing.reload().catch(() => {}); }}>Obnovit data</Button></p>}
    {billing.query.data ? <BillingConsentPanel key={`${billing.scopeKey}:${billing.query.data.consent.updatedAt}`} snapshot={billing.query.data} busy={billing.saving || billing.canRetry} onCommand={(c) => { void billing.execute(c).catch(() => {}); }} /> : <p>Načítám souhlas…</p>}
  </div>;
}
