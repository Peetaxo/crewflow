import { Button } from '../../components/ui/button';
import { useBilling } from './useBilling';
import { BillingPrepareSelection } from './BillingPrepareSelection';
import { BillingOperationFeedback } from './BillingOperationFeedback';
export function BillingPrepareModal({ onClose, onDirtyChange, onSubmitSuccess }: { onClose: () => void; onDirtyChange?: (dirty: boolean) => void; onSubmitSuccess?: () => void }) {
  const billing = useBilling();
  if (!billing.ready || billing.scope.role !== 'coo') return <p>Podklady připravuje COO po přihlášení.</p>;
  return <div key={billing.scopeKey} className="space-y-4"><BillingOperationFeedback billing={billing} />
    <BillingPrepareSelection busy={billing.saving || billing.canRetry} onDirtyChange={onDirtyChange}
      excludedIds={billing.query.data?.statements.filter((s) => s.needsSourceVerification).flatMap((s) => s.sources.map((x) => x.timelogId)) ?? []}
      onCommand={(command) => { const isCurrent = billing.capture(); void billing.execute(command).then(() => { if (isCurrent()) onSubmitSuccess?.(); }).catch(() => {}); }} />
    <Button variant="outline" onClick={onClose}>Zpět na faktury</Button></div>;
}
