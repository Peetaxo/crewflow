import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { formatBillingDate } from '../invoice-billing/billing-presentation';
import { shiftInvoicePdfError } from './shift-invoice-attachment';
import type { useShiftInvoiceDraft } from './useShiftInvoiceDraft';

export function ShiftInvoiceAttachment({ invoice, editable, waiting, locked, onChange }: {
  invoice: ReturnType<typeof useShiftInvoiceDraft>; editable: boolean; waiting: boolean; locked: boolean; onChange: () => void;
}) {
  const [askedToAttach, setAskedToAttach] = useState(false);
  const { attachment, result, draft } = invoice;
  const replacement = editable && draft?.kind === 'replace' ? draft : null;
  const removal = editable && draft?.kind === 'remove';
  const fileError = replacement?.file ? shiftInvoicePdfError(replacement.file) : null;
  const choose = () => { setAskedToAttach(true); invoice.startReplacement(); onChange(); };
  const cancel = () => { setAskedToAttach(false); invoice.reset(); onChange(); };

  if (!attachment && (!editable || result?.customer_id && !result.eligible)) return null;
  return <section aria-label="Vlastní faktura" className="space-y-3 rounded-2xl border border-[var(--nodu-border)] p-4 text-sm">
    <h2 className="font-semibold">Vlastní faktura</h2>
    {attachment && <div className="space-y-2">
      <p className="break-words">Číslo faktury {attachment.invoice_number} · {attachment.total_amount.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' })}</p>
      <p className="text-[var(--nodu-text-soft)]">Vystaveno {formatBillingDate(attachment.issue_date)} · Splatnost {formatBillingDate(attachment.due_date)}</p>
      {waiting && <p role="status">Příloha čeká na schválení hodin.</p>}
      {editable && !draft && <p>Přiložená faktura zůstane u výkazu.</p>}
      <Button type="button" variant="outline" size="sm" disabled={invoice.downloadStatus === 'busy'} onClick={() => { void invoice.download(); }}>Stáhnout přiložené PDF</Button>
      {invoice.downloadStatus === 'error' && <p role="alert">PDF se nepodařilo stáhnout. Zkuste to znovu.</p>}
    </div>}
    {editable && removal && <div className="space-y-2">
      <p>Příloha se odebere při odeslání výkazu.</p>
      <Button type="button" variant="outline" size="sm" disabled={locked} onClick={cancel}>Ponechat přílohu</Button>
    </div>}
    {replacement && <fieldset disabled={locked} className="grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <p>Odběratel <strong className="break-words">{result.customer_name}</strong></p>
        <p className="text-[var(--nodu-text-soft)]">Vyberte jeden originál PDF do 5 MiB. Nahraje se při odeslání výkazu.</p>
      </div>
      <label className="grid min-w-0 gap-1 sm:col-span-2">Originál faktury PDF
        <Input type="file" accept="application/pdf,.pdf" onChange={(event) => { invoice.editReplacement({ file: event.target.files?.[0] ?? null }); onChange(); }} />
      </label>
      {fileError && <p role="alert" className="text-red-700 sm:col-span-2">{fileError}</p>}
      <label className="grid gap-1">Číslo originální faktury
        <Input value={replacement.invoiceNumber} onChange={(event) => { invoice.editReplacement({ invoiceNumber: event.target.value }); onChange(); }} />
      </label>
      <label className="grid gap-1">Celková částka (Kč)
        <Input inputMode="decimal" value={replacement.totalAmount} onChange={(event) => { invoice.editReplacement({ totalAmount: event.target.value }); onChange(); }} />
      </label>
      <label className="grid gap-1">Datum vystavení
        <Input type="date" value={replacement.issueDate} onChange={(event) => { invoice.editReplacement({ issueDate: event.target.value }); onChange(); }} />
      </label>
      <label className="grid gap-1">Datum splatnosti
        <Input type="date" value={replacement.dueDate} onChange={(event) => { invoice.editReplacement({ dueDate: event.target.value }); onChange(); }} />
      </label>
      <Button type="button" variant="outline" size="sm" className="justify-self-start sm:col-span-2" onClick={cancel}>Zrušit výběr PDF</Button>
    </fieldset>}
    {editable && !draft && <div className="flex flex-wrap gap-2">
      {invoice.canChoose && <Button type="button" variant="outline" size="sm" disabled={locked} onClick={choose}>
        {attachment ? 'Vyměnit PDF' : 'Přiložit vlastní fakturu (PDF)'}
      </Button>}
      {attachment && <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => { invoice.remove(); onChange(); }}>Odebrat přílohu</Button>}
      {invoice.loading && <p role="status">Načítání údajů k příloze…</p>}
      {invoice.loadError && (askedToAttach ? <div className="space-y-2">
        <p role="alert">Přílohu se nepodařilo načíst. Hodiny můžete odeslat i bez změny přílohy.</p>
        <Button type="button" variant="outline" size="sm" disabled={locked} onClick={invoice.reload}>Zkusit načíst údaje k příloze znovu</Button>
      </div> : <Button type="button" variant="outline" size="sm" disabled={locked} onClick={choose}>Přiložit vlastní fakturu (PDF)</Button>)}
      {result && !result.customer_id && <p>Pro tento výkaz nelze jednoznačně určit odběratele. Fakturu můžete přiložit po přípravě podkladu.</p>}
    </div>}
  </section>;
}
