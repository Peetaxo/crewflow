import React, { useEffect, useRef, useState } from 'react';
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
    <section aria-labelledby="project-documents-title" className="min-w-0 rounded-[28px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.98)] p-5 md:p-6">
      <h2 id="project-documents-title" className="mb-5 text-lg font-semibold">Doklady projektu</h2>
      {pdfError && <p role="alert" className="mb-4 text-sm text-[#c45c39]">{pdfError}</p>}
      <h3 className="mb-2 text-sm font-semibold">Účtenky</h3>
      <ProjectQueryMessage query={receiptsQuery} loadingLabel="Načítání účtenek" />
      {!receiptsQuery.isPending && !receiptsQuery.isError && (receipts.length ? (
        <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[500px] text-left text-xs">
          <thead><tr className="border-b border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)]"><th className="py-3 pr-4">Název</th><th className="py-3 pr-4">Datum</th><th className="py-3 pr-4">Stav</th><th className="py-3 text-right">Částka</th></tr></thead>
          <tbody>{receipts.map((receipt) => <tr key={receipt.supabaseId ?? receipt.id} className="border-b border-[color:var(--nodu-border)] last:border-0">
            <td className="py-3 pr-4"><button className="text-left font-semibold text-[color:var(--nodu-accent)] hover:underline" onClick={() => setSelectedReceipt(receipt)}>{receipt.title}</button></td>
            <td className="whitespace-nowrap py-3 pr-4">{dateLabel(receipt.paidAt)}</td><td className="py-3 pr-4">{receiptStatuses[receipt.status]}</td><td className="whitespace-nowrap py-3 text-right font-semibold">{formatCurrency(receipt.amount)}</td>
          </tr>)}</tbody>
        </table></div>
      ) : <p className="py-4 text-sm text-[color:var(--nodu-text-soft)]">Projekt zatím nemá žádné účtenky.</p>)}
      <h3 className="mb-2 mt-6 text-sm font-semibold">Faktury</h3>
      <ProjectQueryMessage query={invoicesQuery} loadingLabel="Načítání faktur" />
      {!invoicesQuery.isPending && !invoicesQuery.isError && (invoices.length ? (
        <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[580px] text-left text-xs">
          <thead><tr className="border-b border-[color:var(--nodu-border)] text-[color:var(--nodu-text-soft)]"><th className="py-3 pr-4">Číslo faktury</th><th className="py-3 pr-4">Stav</th><th className="py-3 pr-4">Splatnost</th><th className="py-3 pr-4 text-right">Podíl projektu</th><th className="py-3 text-right">Doklad</th></tr></thead>
          <tbody>{invoices.map((record) => <tr key={record.invoice.id} className="border-b border-[color:var(--nodu-border)] last:border-0">
            <td className="py-3 pr-4 font-semibold">{record.invoice.invoiceNumber || 'Bez čísla'}</td><td className="py-3 pr-4">{invoiceStatuses[record.invoice.status]}</td><td className="whitespace-nowrap py-3 pr-4">{dateLabel(record.invoice.dueDate)}</td>
            <td className="whitespace-nowrap py-3 pr-4 text-right font-semibold">{record.share ? formatCurrency(record.share.total) : 'Podíl neznámý'}</td>
            <td className="py-3 text-right"><Button variant="outline" size="sm" className="text-xs" aria-label={`Otevřít PDF ${record.invoice.invoiceNumber || 'faktury bez čísla'}`} disabled={openingInvoiceId !== null} onClick={() => { void openPdf(record); }}>{openingInvoiceId === record.invoice.id ? 'Načítání…' : 'PDF'}</Button></td>
          </tr>)}</tbody>
        </table></div>
      ) : <p className="py-4 text-sm text-[color:var(--nodu-text-soft)]">Projekt zatím nemá žádné faktury.</p>)}
      <Dialog open={Boolean(selectedReceipt)} onOpenChange={(open) => { if (!open) setSelectedReceipt(null); }}>
        {selectedReceipt && <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogTitle>{selectedReceipt.title}</DialogTitle><DialogDescription>Záznam účtenky</DialogDescription>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
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
