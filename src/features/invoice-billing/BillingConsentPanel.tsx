import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { standingConsentWording, type BillingSnapshot } from './contract';
import { makeBillingCommand, type BillingCommand } from './service';
export function BillingConsentPanel({ snapshot, onCommand, busy }: { snapshot: BillingSnapshot; onCommand: (command: BillingCommand) => void; busy: boolean }) {
  const [confirmed, setConfirmed] = useState(false);
  const { consent, consentHistory } = snapshot;
  const grant = consentHistory.find((h) => h.id === consent.activeGrantId);
  return <section className="nodu-panel space-y-4 rounded-2xl p-5">
    <h2 className="text-lg font-semibold">Fakturace</h2>
    <p>Po úplném finálním schválení práce na akci vznikne podklad k fakturaci. U každého podkladu můžete nahrát svůj originál PDF nebo jednotlivě potvrdit vystavení vaším jménem.</p>
    <p>Volitelný trvalý souhlas platí pouze pro budoucí úplná finální schválení. Již schválené historické podklady se jeho zapnutím nevystaví. Souhlas můžete kdykoli odvolat.</p>
    <p className="font-semibold">Trvalý souhlas: {consent.enabled ? 'Zapnutý' : 'Vypnutý'}</p>
    {grant && <p>Zapnuto {new Date(grant.createdAt).toLocaleString('cs-CZ')}</p>}
    {!consent.enabled && <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} /><span>{standingConsentWording}</span></label>}
    <Button disabled={busy || (!consent.enabled && !confirmed)} onClick={() => onCommand(makeBillingCommand({ kind: 'consent', enabled: !consent.enabled,
      expectedUpdatedAt: consent.updatedAt, nonVatConfirmed: !consent.enabled && confirmed }))}>{consent.enabled ? 'Odvolat trvalý souhlas' : 'Zapnout trvalý souhlas'}</Button>
    <details><summary>Historie souhlasu ({consentHistory.length})</summary><ol className="mt-2 space-y-2">{consentHistory.map((entry) => <li key={entry.id}>
      <p>{entry.enabled ? 'Zapnuto' : 'Odvoláno'} · {new Date(entry.createdAt).toLocaleString('cs-CZ')}</p><p>{entry.wording}</p><p>Potvrzení neplátce DPH: {entry.nonVatConfirmed ? 'Ano' : 'Ne'} · Změna potvrzená vlastníkem účtu</p>
    </li>)}</ol></details>
  </section>;
}
