import { FileText, Receipt } from 'lucide-react';
import type { Contractor, Event, Invoice, Role, Timelog } from '../../../types';
import StatusBadge from '../../../components/shared/StatusBadge';
import { Button } from '../../../components/ui/button';
import { calculateTotalHours, formatCurrency, formatShortDate } from '../../../utils';
import { canEditTimelog } from '../../timelogs/services/timelog-permissions';
import { calculateCrewTimelogEstimate, findCrewTimelogEvent } from '../services/crew-presentation';

export function CrewTimelogRecords({ timelogs, events, contractor, role, onEdit }: {
  timelogs: Timelog[]; events: Event[]; contractor: Contractor; role: Role; onEdit: (timelog: Timelog) => void;
}) {
  if (!timelogs.length) return null;
  return <div className="space-y-3 lg:space-y-0">
    <div className="hidden grid-cols-[minmax(0,1fr)_6rem_8rem_10rem_2.75rem] gap-3 border-b border-[var(--nodu-border)] px-3 pb-3 text-xs text-[var(--nodu-text-soft)] lg:grid">
      <span>Akce</span><span>Hodiny / km</span><span>Odhad odměny</span><span>Stav</span><span />
    </div>
    {timelogs.map((timelog) => {
      const event = findCrewTimelogEvent(timelog, events);
      const name = event?.name ?? 'Nedostupná akce';
      const hours = calculateTotalHours(timelog.days);
      return <article key={timelog.supabaseId ?? timelog.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-2xl border border-[var(--nodu-border)] p-4 lg:grid-cols-[minmax(0,1fr)_6rem_8rem_10rem_2.75rem] lg:items-center lg:rounded-none lg:border-x-0 lg:border-t-0 lg:p-3">
        <div className="min-w-0"><h3 className="break-words text-sm font-semibold text-[var(--nodu-text)]">{name}</h3>
          <p className="mt-1 break-words text-xs text-[var(--nodu-text-soft)]">{event?.job}{timelog.days[0]?.d && ` · ${formatShortDate(timelog.days[0].d)}`}</p>
        </div>
        <div className="col-start-1 row-start-2 text-sm text-[var(--nodu-text)] lg:col-start-2 lg:row-start-1">{hours.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} h<span className="ml-2 text-xs text-[var(--nodu-text-soft)] lg:ml-0 lg:block">{timelog.km} km</span></div>
        <div className="col-start-2 row-start-2 text-right text-sm font-semibold text-[var(--nodu-text)] lg:col-start-3 lg:row-start-1 lg:text-left"><span className="mb-0.5 block text-[10px] font-normal text-[var(--nodu-text-soft)] lg:hidden">Odhad odměny</span>{formatCurrency(calculateCrewTimelogEstimate(timelog, contractor, event))}</div>
        <div className="col-start-2 row-start-1 max-w-[10rem] text-right lg:col-start-4 lg:text-left"><StatusBadge status={timelog.status} /></div>
        {canEditTimelog(timelog, role) && <div className="col-span-2 lg:col-span-1 lg:col-start-5 lg:row-start-1">
          <Button type="button" variant="outline" className="h-11 w-full px-3 lg:w-11 lg:px-0" aria-label={`Upravit výkaz ${name}`} onClick={() => onEdit(timelog)}><FileText size={15} /><span className="lg:hidden">Otevřít výkaz</span></Button>
        </div>}
      </article>;
    })}
  </div>;
}

export function CrewInvoiceRecords({ invoices }: { invoices: Invoice[] }) {
  if (!invoices.length) return <div className="rounded-2xl border border-dashed border-[var(--nodu-border)] py-12 text-center">
    <Receipt size={25} className="mx-auto mb-3 text-[var(--nodu-text-soft)]" /><h3 className="text-sm font-semibold text-[var(--nodu-text)]">Zatím žádné faktury</h3><p className="mt-2 text-xs text-[var(--nodu-text-soft)]">Vystavené faktury tohoto člověka se objeví tady.</p>
  </div>;
  return <div className="space-y-3">{invoices.map((invoice) => <article key={invoice.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-2xl border border-[var(--nodu-border)] p-4 sm:flex sm:items-center sm:justify-between">
    <div className="min-w-0"><h3 className="break-all text-sm font-semibold text-[var(--nodu-text)]">{invoice.invoiceNumber || invoice.id}</h3><p className="mt-1 break-words text-xs text-[var(--nodu-text-soft)]">{invoice.job}{invoice.sentAt ? ` · ${formatShortDate(invoice.sentAt)}` : ' · Koncept'}</p></div>
    <div className="text-right"><p className="whitespace-nowrap text-sm font-semibold text-[var(--nodu-text)]">{formatCurrency(invoice.total)}</p><p className="mt-1 text-xs text-[var(--nodu-text-soft)]">{invoice.hours} h · {invoice.km} km</p></div>
    <div className="col-span-2 sm:shrink-0"><StatusBadge status={invoice.status} /></div>
  </article>)}</div>;
}
