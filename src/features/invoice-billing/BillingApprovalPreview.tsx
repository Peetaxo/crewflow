import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { BillingError, formatBillingMoney, type BillingQuote } from './contract';
import { billingService } from './service';
import { BillingFinancePreview } from './BillingFinancePreview';
export function BillingApprovalPreview({ timelogIds, onApprove, onCancel, retryApproval, onStale }: {
  timelogIds: string[]; onApprove: (quote: BillingQuote) => Promise<unknown>; onCancel: () => void;
  retryApproval?: () => Promise<unknown>; onStale?: () => void;
}) {
  const ids = useRef([...timelogIds]); const [quote, setQuote] = useState<BillingQuote | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [ambiguous, setAmbiguous] = useState(false); const [stale, setStale] = useState(false); const [generation, setGeneration] = useState(0);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true; setError(null); setQuote(null);
    void billingService.quote(ids.current).then((result) => { if (active) setQuote(result); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Náhled se nepodařilo načíst.'); });
    return () => { active = false; };
  }, [generation]);
  const approve = async () => {
    if (!quote || busy || stale) return; setBusy(true); setError(null);
    try { if (ambiguous && retryApproval) await retryApproval(); else await onApprove(quote); }
    catch (cause) {
      if (!alive.current) return;
      setError(cause instanceof Error ? cause.message : 'Výsledek schválení není potvrzen.');
      if (cause instanceof BillingError && cause.kind !== 'ambiguous' || (cause as { kind?: string })?.kind === 'conflict') { setStale(true); setAmbiguous(false); }
      else setAmbiguous(true);
    } finally { if (alive.current) setBusy(false); }
  };
  return <section aria-label="Serverový náhled před schválením" className="space-y-3 rounded-2xl border p-4">
    <h2 className="text-lg font-semibold">Finální kontrola podkladů k fakturaci</h2>
    <p>Schválení uzavře práci v celém výběru. Server z tohoto náhledu připraví samostatné podklady podle dodavatele a koncového odběratele.</p>
    {quote ? <><BillingFinancePreview finance={quote.preview} /><p className="font-semibold">Součet všech vybraných výkazů: {formatBillingMoney(quote.preview.totalAmount)}</p></> : !error && <p>Načítám přesné ceny…</p>}
    {error && <p role="alert">{error}</p>}
    {stale ? <Button disabled={busy} onClick={() => { if (onStale) onStale(); else { setStale(false); setGeneration((g) => g + 1); } }}>Obnovit data a připravit nový náhled</Button>
      : quote ? <Button disabled={busy} onClick={() => { void approve(); }}>{ambiguous ? 'Opakovat stejné schválení' : 'Potvrdit schválení s touto částkou'}</Button>
        : error && <Button onClick={() => setGeneration((g) => g + 1)}>Znovu načíst ceny</Button>}
    <Button disabled={busy || ambiguous} variant="outline" onClick={onCancel}>Zrušit kontrolu</Button>
  </section>;
}
