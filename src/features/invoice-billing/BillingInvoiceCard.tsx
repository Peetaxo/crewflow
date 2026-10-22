import { billingActorName, type BillingActor } from './billing-actors';
import type { Invoice } from '../../types';
import { Button } from '../../components/ui/button';
import { formatBillingHours, formatBillingMoney, type BillingJob } from './contract';
import styles from './BillingPresentation.module.css';
import { formatBillingDate } from './billing-presentation';
export function BillingInvoiceCard({ invoice: i, role, busy, jobs, onDownload, onLegacyPdf, onPaid, onRetry, actors = [] }: {
  actors?: readonly BillingActor[];
  invoice: Invoice; role: string; busy: boolean; jobs: BillingJob[]; onDownload: (path: string) => void;
  onLegacyPdf: (id: string) => void; onPaid: (id: string) => void; onRetry: (job: BillingJob) => void;
}) {
  const known = i.hasKnownAmounts !== false;
  const money = (v: number | undefined) => formatBillingMoney(known ? v : null);
  const uploaded = i.billingKind === 'uploaded';
  const pendingPdf = jobs.find((j) => j.invoiceId === i.id && j.kind === 'pdf' && ['queued', 'running'].includes(j.status));
  return <article className={`nodu-panel ${styles.card}`}>
    <header className={styles.cardHeader}>
      <div className={styles.identity}>
        <span className={`${styles.badge} ${i.status === 'paid' ? styles.success : i.status === 'draft' ? styles.warning : ''}`}>{i.status === 'paid' ? 'Úhrada zaznamenána' : i.status === 'draft' ? 'Historický koncept' : 'K úhradě'}</span>
        <h3>{i.invoiceNumber || 'Faktura bez čísla'} · {i.job}</h3>
        <p className={styles.muted}>{uploaded ? 'Přijatý originál PDF' : 'Faktura vystavená jménem dodavatele'}</p>
      </div>
      <div className={styles.amount}><span className={styles.amountLabel}>Celkem</span><strong>{money(i.total)}</strong></div>
    </header>
    <dl className={styles.facts}>
      <div><dt>Dodavatel</dt><dd>{i.supplierSnapshot?.name || 'Dodavatel neznámý'}</dd></div>
      <div><dt>Odběratel</dt><dd>{i.customerSnapshot?.name || 'Odběratel neznámý'}</dd></div>
      <div><dt>Práce</dt><dd>{formatBillingHours(i.hours)}</dd></div>
      <div><dt>Splatnost</dt><dd>{formatBillingDate(i.dueDate)}</dd></div>
    </dl>
    <p className={styles.muted}>Vystavení: {formatBillingDate(i.issueDate)}</p>
    <details className={styles.disclosure}>
      <summary>Podrobnosti faktury</summary>
      <dl className={styles.facts}>
        <div><dt>Práce</dt><dd>{money(i.hAmt)}</dd></div>
        <div><dt>Cestovné</dt><dd>{money(i.kAmt)}</dd></div>
        <div><dt>Stravné</dt><dd>{money(i.mealAmt)}</dd></div>
      </dl>
      {i.status === 'paid' && <p className={styles.muted}>Úhradu zaznamenal/a: {billingActorName(actors, { profileId: i.paidByProfileId, userId: i.paidByUserId })} · {i.paymentRecordedAt || i.paidAt ? new Date((i.paymentRecordedAt || i.paidAt)!).toLocaleString('cs-CZ') : 'Čas není zaznamenán'}</p>}
    </details>
    <div className={styles.actions}>
      {i.pdfPath && <Button variant="outline" onClick={() => onDownload(i.pdfPath!)}>{uploaded ? 'Stáhnout originál PDF' : 'Stáhnout PDF'}</Button>}
      {!i.billingStatementId && !uploaded && <Button disabled={busy} variant="outline" onClick={() => onLegacyPdf(i.id)}>{i.pdfPath ? 'Přegenerovat historické PDF' : 'Vygenerovat historické PDF'}</Button>}
      {i.billingStatementId && !i.pdfPath && <p>{pendingPdf ? 'PDF se zpracovává.' : 'PDF zatím není dostupné.'}</p>}
      {jobs.filter((j) => j.invoiceId === i.id && j.kind === 'pdf' && j.canRetry && ['crew', 'coo'].includes(role)).map((j) => <Button key={j.id} disabled={busy} variant="outline" onClick={() => onRetry(j)}>Znovu zpracovat PDF stejné faktury</Button>)}
      {role === 'coo' && i.status === 'sent' && <Button disabled={busy} onClick={() => onPaid(i.id)}>Zaznamenat přijatou úhradu</Button>}
    </div>
  </article>;
}
