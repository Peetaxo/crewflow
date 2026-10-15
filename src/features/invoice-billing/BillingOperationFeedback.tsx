import { Button } from '../../components/ui/button';
import type { BillingController } from './useBilling';
export function BillingOperationFeedback({ billing }: { billing: BillingController }) {
  return <>{billing.error && <div role="alert" className="rounded-xl border p-3"><p>{billing.error.message}</p>
    {billing.canRetry ? <Button disabled={billing.saving} onClick={() => { void billing.retry().catch(() => {}); }}>Opakovat stejný požadavek</Button>
      : <Button onClick={() => { void billing.reload().catch(() => {}); }}>Obnovit data</Button>}</div>}</>;
}
