import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight, Download, Files, FileText, Receipt } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../../../components/ui/dialog';
import type { Contractor, Event, ReceiptItem } from '../../../types';
import { formatCurrency } from '../../../utils';
import { formatProjectPeriod, type ProjectInvoiceRecord } from '../services/projects.service';
import { generateInvoicePdf, getInvoicePdfDownloadUrl } from '../../invoices/services/invoice-pdf.service';
import { openInvoicePdfUrl } from '../../invoices/services/invoice-pdf-download';

export type ProjectQueryState = { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
const receiptStatuses: Record<ReceiptItem['status'], string> = {
  draft: 'Koncept', submitted: 'Odesláno', approved: 'Schváleno', attached: 'Ve faktuře', reimbursed: 'Uhrazeno', rejected: 'Zamítnuto',
};
const invoiceStatuses = { draft: 'Koncept', sent: 'Odesláno', paid: 'Uhrazeno' };
const statusTone = (status: string) => ['paid', 'reimbursed', 'approved'].includes(status) ? 'success' : status === 'rejected' ? 'error' : ['sent', 'submitted', 'attached'].includes(status) ? 'info' : 'neutral';
const dateLabel = (date?: string) => date ? formatProjectPeriod({ startDate: date.slice(0, 10), endDate: date.slice(0, 10) }) : '—';

export const ProjectQueryMessage = ({ query, loadingLabel }: { query: ProjectQueryState; loadingLabel: string }) => (
  query.isError ? <div role="alert" className="py-4 text-sm">
    <p>{query.error instanceof Error ? query.error.message : 'Data se nepodařilo načíst.'}</p>
    <Button className="mt-3" variant="outline" size="sm" onClick={() => { void query.refetch(); }}>Zkusit znovu</Button>
  </div> : query.isPending ? <p role="status" className="py-4 text-sm text-[color:var(--nodu-text-soft)]">{loadingLabel}…</p> : null
);

type Props = {
  invoices: ProjectInvoiceRecord[]; receipts: ReceiptItem[]; events: Event[]; contractors: Contractor[];
  invoicesQuery: ProjectQueryState; receiptsQuery: ProjectQueryState;
};

const ProjectDocuments = ({ invoices, receipts, events, contractors, invoicesQuery, receiptsQuery }: Props) => {
  const descriptionPrefix = useId();
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptItem | null>(null);
  const [openingInvoiceId, setOpeningInvoiceId] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState('');
  const mounted = useRef(false);
  const activeRequest = useRef<symbol | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; activeRequest.current = null; };
  }, []);

  const openPdf = async (record: ProjectInvoiceRecord) => {
    if (activeRequest.current) return;
    const request = Symbol();
    activeRequest.current = request;
    setOpeningInvoiceId(record.invoice.id); setPdfError('');
    const isCurrent = () => mounted.current && activeRequest.current === request;
    try {
      const pdfPath = record.invoice.pdfPath || (await generateInvoicePdf(record.invoice.id)).pdfPath;
      if (!isCurrent()) return;
      const url = await getInvoicePdfDownloadUrl(pdfPath);
      if (isCurrent()) openInvoicePdfUrl(url);
    } catch (error) {
      if (isCurrent()) setPdfError(error instanceof Error ? error.message : 'PDF se nepodařilo otevřít.');
    } finally {
      if (isCurrent()) { activeRequest.current = null; setOpeningInvoiceId(null); }
    }
  };
  const receiptEvent = selectedReceipt ? events.find((event) => selectedReceipt.eventSupabaseId ? event.supabaseId === selectedReceipt.eventSupabaseId : event.id === selectedReceipt.eid) : undefined;
  const receiptMember = selectedReceipt ? contractors.find((contractor) => contractor.profileId === selectedReceipt.contractorProfileId) : undefined;

  return (
    <section aria-labelledby="project-documents-title" className="project-overview-section">
      <div className="project-overview-section-heading"><Files aria-hidden="true" /><h2 id="project-documents-title">Doklady projektu</h2></div>
      {pdfError && <p role="alert" className="mb-4 text-sm text-[color:var(--nodu-error-text)]">{pdfError}</p>}
      <h3 className="mb-3 text-sm font-semibold">Účtenky</h3>
      <ProjectQueryMessage query={receiptsQuery} loadingLabel="Načítání účtenek" />
      {!receiptsQuery.isPending && !receiptsQuery.isError && (receipts.length ? (
        <ul className="project-document-list" aria-label="Účtenky projektu">
          {receipts.map((receipt) => {
            const descriptionId = `${descriptionPrefix}-receipt-${receipt.supabaseId ?? receipt.id}`;
            return <li key={receipt.supabaseId ?? receipt.id}>
              <button className="project-document-card project-receipt-card" aria-label={receipt.title} aria-describedby={`${descriptionId}-date ${descriptionId}-value`} onClick={() => setSelectedReceipt(receipt)}>
                <span className="project-document-icon"><Receipt aria-hidden="true" /></span>
                <span className="project-document-main"><strong>{receipt.title}</strong><span id={`${descriptionId}-date`}>Účtenka · {dateLabel(receipt.paidAt)}</span></span>
                <span id={`${descriptionId}-value`} className="project-document-value"><strong>{formatCurrency(receipt.amount)}</strong><span className={`project-status project-status-${statusTone(receipt.status)}`}>{receiptStatuses[receipt.status]}</span></span>
                <ChevronRight className="project-document-arrow" aria-hidden="true" />
              </button>
            </li>;
          })}
        </ul>
      ) : <p className="py-4 text-sm text-[color:var(--nodu-text-soft)]">Projekt zatím nemá žádné účtenky.</p>)}
      <h3 className="mb-3 mt-6 text-sm font-semibold">Faktury</h3>
      <ProjectQueryMessage query={invoicesQuery} loadingLabel="Načítání faktur" />
      {!invoicesQuery.isPending && !invoicesQuery.isError && (invoices.length ? (
        <ul className="project-document-list" aria-label="Faktury projektu">
          {invoices.map((record) => <li className="project-document-card project-invoice-card" key={record.invoice.id}>
            <span className="project-document-icon"><FileText aria-hidden="true" /></span>
            <div className="project-document-main"><strong>{record.invoice.invoiceNumber || 'Bez čísla'}</strong><span>Splatnost {dateLabel(record.invoice.dueDate)}</span><span className={`project-status project-status-${statusTone(record.invoice.status)}`}>{invoiceStatuses[record.invoice.status]}</span></div>
            <div className="project-document-value"><span>Podíl projektu</span><strong>{record.share ? formatCurrency(record.share.total) : 'Podíl neznámý'}</strong></div>
            <Button variant="outline" size="sm" className="project-document-pdf text-xs" aria-label={`Otevřít PDF ${record.invoice.invoiceNumber || 'faktury bez čísla'}`} disabled={openingInvoiceId !== null} onClick={() => { void openPdf(record); }}><Download aria-hidden="true" />{openingInvoiceId === record.invoice.id ? 'Načítání…' : 'PDF'}</Button>
          </li>)}
        </ul>
      ) : <p className="py-4 text-sm text-[color:var(--nodu-text-soft)]">Projekt zatím nemá žádné faktury.</p>)}
      <Dialog open={Boolean(selectedReceipt)} onOpenChange={(open) => { if (!open) setSelectedReceipt(null); }}>
        {selectedReceipt && <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogTitle className="[overflow-wrap:anywhere]">{selectedReceipt.title}</DialogTitle><DialogDescription>Záznam účtenky</DialogDescription>
          <dl className="project-receipt-details grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
            <dt className="text-[color:var(--nodu-text-soft)]">Dodavatel</dt><dd>{selectedReceipt.vendor || '—'}</dd>
            <dt className="text-[color:var(--nodu-text-soft)]">Datum</dt><dd>{dateLabel(selectedReceipt.paidAt)}</dd>
            <dt className="text-[color:var(--nodu-text-soft)]">Částka</dt><dd>{formatCurrency(selectedReceipt.amount)}</dd>
            <dt className="text-[color:var(--nodu-text-soft)]">Stav</dt><dd>{receiptStatuses[selectedReceipt.status]}</dd>
            <dt className="text-[color:var(--nodu-text-soft)]">Akce</dt><dd>{receiptEvent?.name || '—'}</dd>
            <dt className="text-[color:var(--nodu-text-soft)]">Člen Crew</dt><dd>{receiptMember?.name || '—'}</dd>
            <dt className="text-[color:var(--nodu-text-soft)]">Poznámka</dt><dd className="whitespace-pre-wrap break-words">{selectedReceipt.note || '—'}</dd>
          </dl>
        </DialogContent>}
      </Dialog>
    </section>
  );
};
export default ProjectDocuments;
