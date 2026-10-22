import { useState } from 'react';
import { useBillingActors } from './useBillingActors';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { useAppContext } from '../../context/useAppContext';
import { useInvoicesQuery } from '../invoices/queries/useInvoicesQuery';
import { approveInvoice } from '../invoices/services/invoices.service';
import { generateInvoicePdf, getInvoicePdfDownloadUrl } from '../invoices/services/invoice-pdf.service';
import { openInvoicePdfUrl } from '../invoices/services/invoice-pdf-download';
import { useBilling, type BillingController } from './useBilling';
import { BillingStatementCard } from './BillingStatementCard';
import { BillingInvoiceCard } from './BillingInvoiceCard';
import { BillingOperationFeedback } from './BillingOperationFeedback';
import { BillingPrepareSelection } from './BillingPrepareSelection';
import { makeBillingCommand, type BillingCommand } from './service';
import styles from './BillingPresentation.module.css';
function BillingContents({ billing, scope }: { billing: BillingController; scope: 'all' | 'mine' }) {
  const actual = useInvoicesQuery(); const context = useAppContext(); const [busy, setBusy] = useState(false);
  const actorQuery = useBillingActors();
  const actors = actorQuery.error ? [] : actorQuery.data ?? [];
  const data = billing.query.data; const query = context.searchQuery.trim().toLowerCase();
  const owned = (profileId?: string) => scope !== 'mine' || profileId === billing.scope.profileId;
  const matches = (texts: (string | undefined | null)[]) => !query || texts.some((v) => v?.toLowerCase().includes(query));
  const invoices = (actual.data ?? []).filter((i) => owned(i.contractorProfileId) && matches([i.invoiceNumber, i.job, i.supplierSnapshot?.name, i.customerSnapshot?.name]));
  const pending = (data?.statements ?? []).filter((s) => s.status !== 'issued' && owned(s.contractorId) && matches([s.supplierSnapshot.name, s.customerSnapshot.name, ...s.financialSnapshot.reports.map((r) => `${r.eventName} ${r.jobNumber}`)]));
  const onSettings = () => { context.setSettingsSection('billing'); context.setCurrentTab('settings'); };
  const run = async (operation: () => Promise<unknown>) => {
    if (busy) return; const isCurrent = billing.capture(); if (!isCurrent()) return; setBusy(true);
    try { await operation(); } catch (error) { if (isCurrent()) toast.error(error instanceof Error ? error.message : 'Operaci se nepodařilo dokončit.'); }
    finally { if (isCurrent()) setBusy(false); }
  };
  const download = (path: string) => {
    const isCurrent = billing.capture();
    void run(async () => { const url = await getInvoicePdfDownloadUrl(path); if (isCurrent()) openInvoicePdfUrl(url); });
  };
  const command = (c: BillingCommand) => {
    if (!billing.capture()() || !billing.query.data || billing.query.error) return;
    void billing.execute(c).catch(() => {});
  };
  const locked = busy || billing.saving || billing.canRetry;
  return <div className={styles.view}>
    <header className={styles.pageHeader}><div><h1>{scope === 'mine' ? 'Moje faktury' : 'Faktury'}</h1><p>Schválené podklady, originály a vystavené faktury.</p></div><Button variant="outline" onClick={onSettings}>Nastavení → Fakturace</Button></header>
    <details className={styles.guide}><summary>Jak funguje fakturace</summary><p>Po finálním schválení celého výkazu vznikne přesný podklad. Crew zvolí originál PDF nebo vystavení svým jménem.</p></details>
    <BillingOperationFeedback billing={billing} />
    {billing.query.error && <p role="alert">Podklady se nepodařilo načíst. <Button onClick={() => { void billing.reload().catch(() => {}); }}>Obnovit podklady</Button></p>}
    {actual.error && <p role="alert">Faktury se nepodařilo načíst.</p>}
    {billing.scope.role === 'coo' && <BillingPrepareSelection snapshot={data} available={billing.ready && !billing.query.error} busy={locked} onCommand={command} />}
    <section className={styles.section} aria-label="Podklady k fakturaci"><header className={styles.sectionHeader}><h2>K fakturaci ({pending.length})</h2><p>Schválené výkazy a kontrola originálů</p></header>
      {!data ? <p className={styles.empty}>Načítám podklady…</p> : pending.length === 0 && <p className={styles.empty}>Žádné podklady k fakturaci.</p>}
      <div className={styles.cardList}>{pending.map((s) => <BillingStatementCard actors={actors} key={`${billing.scopeKey}:${s.id}:${s.updatedAt}`} statement={s} scope={billing.scope} documents={data!.documents} jobs={data!.jobs} busy={locked} onCommand={command} onDownload={download} onBillingSettings={onSettings} />)}</div>
    </section>
    <section className={styles.section} aria-label="Skutečné faktury"><header className={styles.sectionHeader}><h2>Vystavené a přijaté faktury ({invoices.length})</h2><p>Dokumenty a přijaté úhrady</p></header>
      <div className={styles.cardList}>{invoices.map((invoice) => <div key={invoice.id} id={`notification-invoice-${invoice.id}`} tabIndex={-1}><BillingInvoiceCard actors={actors} invoice={invoice} role={billing.scope.role} busy={locked} jobs={(data?.jobs ?? []).filter((j) => !data?.statements.find((s) => s.id === j.statementId)?.needsSourceVerification)} onDownload={download}
        onLegacyPdf={(id) => { void run(async () => { await generateInvoicePdf(id); await actual.refetch(); }); }}
        onPaid={(id) => { void run(async () => {
          const isCurrent = billing.capture();
          let result;
          try { result = await approveInvoice(id, invoice); } finally { if (isCurrent()) await actual.refetch(); }
          if (!result) throw new Error('Úhradu se nepodařilo potvrdit. Zkontrolujte obnovený stav faktury.');
          if (isCurrent()) toast.success('Úhrada byla zaznamenána.');
        }); }}
        onRetry={(job) => { const s = data?.statements.find((s) => s.id === job.statementId); if (s) command(makeBillingCommand({ kind: 'retry', statementId: s.id, jobId: job.id, expectedUpdatedAt: s.updatedAt, expectedJobUpdatedAt: job.updatedAt })); }} />
        {data?.statements.filter((s) => s.invoiceId === invoice.id).map((s) => <details key={s.id} className={styles.disclosure}><summary>Schválený podklad a historie</summary><BillingStatementCard actors={actors} readOnly statement={s} scope={billing.scope} documents={data.documents} jobs={[]} busy={locked} onCommand={command} onDownload={download} onBillingSettings={onSettings} /></details>)}
      </div>)}</div>
      {invoices.length === 0 && <p className={styles.empty}>Zatím žádné faktury.</p>}
    </section>
    {Boolean(data?.supersededStatements.length) && <details className={styles.disclosure}><summary>Historie nahrazených podkladů</summary><div className={styles.cardList}>{data!.supersededStatements.filter((s) => owned(s.contractorId)).map((s) => <BillingStatementCard actors={actors} key={s.id} readOnly statement={s} scope={billing.scope} documents={data!.documents} jobs={[]} busy={false} onCommand={command} onDownload={download} onBillingSettings={onSettings} />)}</div></details>}
  </div>;
}
export default function InvoiceBillingView({ scope = 'all' }: { scope?: 'all' | 'mine' }) {
  const billing = useBilling();
  return billing.ready ? <BillingContents key={billing.scopeKey} billing={billing} scope={scope} /> : <p>Načítám přihlášení…</p>;
}
