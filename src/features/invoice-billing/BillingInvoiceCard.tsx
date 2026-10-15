import { billingActorName, type BillingActor } from './billing-actors';
import type { Invoice } from '../../types';
import { Button } from '../../components/ui/button';
import { formatBillingHours, formatBillingMoney, type BillingJob } from './contract';
export function BillingInvoiceCard({ invoice: i, role, busy, jobs, onDownload, onLegacyPdf, onPaid, onRetry, actors = [] }: {
  actors?: readonly BillingActor[];
  invoice: Invoice; role: string; busy: boolean; jobs: BillingJob[]; onDownload: (path: string) => void;
  onLegacyPdf: (id: string) => void; onPaid: (id: string) => void; onRetry: (job: BillingJob) => void;
}) {
  const known = i.hasKnownAmounts !== false;
  const money = (v: number | undefined) => formatBillingMoney(known ? v : null);
  const uploaded = i.billingKind === 'uploaded';
  const pendingPdf = jobs.find((j) => j.invoiceId === i.id && j.kind === 'pdf' && ['queued', 'running'].includes(j.status));
  return <article className="nodu-panel space-y-3 rounded-2xl p-5"><div className="flex justify-between gap-3"><div>
    <h3 className="font-semibold">{i.invoiceNumber || 'Faktura bez čísla'} · {i.job}</h3>
    <p><span>{uploaded ? 'Přijatý originál PDF' : 'Faktura vystavená jménem dodavatele'}</span> · {i.status === 'paid' ? 'Úhrada zaznamenána' : i.status === 'draft' ? 'Historický koncept' : 'K úhradě'}</p>
    <p><span>{i.supplierSnapshot?.name || 'Dodavatel neznámý'}</span> → {i.customerSnapshot?.name || 'Odběratel neznámý'}</p>
  </div><strong>{money(i.total)}</strong></div>
    <p>Práce: {formatBillingHours(i.hours)} · {money(i.hAmt)} · Cestovné: {money(i.kAmt)} · Stravné: {money(i.mealAmt)}</p>
    <p>Vystavení: {i.issueDate || 'Neznámé'} · Splatnost: {i.dueDate || 'Neznámá'}</p>
    {i.status === 'paid' && <p>Úhradu zaznamenal/a: {billingActorName(actors, { profileId: i.paidByProfileId, userId: i.paidByUserId })} · {i.paymentRecordedAt || i.paidAt ? new Date((i.paymentRecordedAt || i.paidAt)!).toLocaleString('cs-CZ') : 'Čas není zaznamenán'}</p>}
    <div className="flex flex-wrap gap-2">
      {i.pdfPath && <Button variant="outline" onClick={() => onDownload(i.pdfPath!)}>{uploaded ? 'Stáhnout originál PDF' : 'Stáhnout PDF'}</Button>}
      {!i.billingStatementId && !uploaded && <Button disabled={busy} variant="outline" onClick={() => onLegacyPdf(i.id)}>{i.pdfPath ? 'Přegenerovat historické PDF' : 'Vygenerovat historické PDF'}</Button>}
      {i.billingStatementId && !i.pdfPath && <p>{pendingPdf ? 'PDF se zpracovává.' : 'PDF zatím není dostupné.'}</p>}
      {jobs.filter((j) => j.invoiceId === i.id && j.kind === 'pdf' && j.canRetry && ['crew', 'coo'].includes(role)).map((j) => <Button key={j.id} disabled={busy} variant="outline" onClick={() => onRetry(j)}>Znovu zpracovat PDF stejné faktury</Button>)}
      {role === 'coo' && i.status === 'sent' && <Button disabled={busy} onClick={() => onPaid(i.id)}>Zaznamenat přijatou úhradu</Button>}
    </div>
  </article>;
}
