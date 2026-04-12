import React, { useCallback, useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { Contractor, Event, Invoice } from '../types';
import { formatCurrency, formatShortDate, getCountdown } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';
import {
  approveInvoice,
  generateInvoices,
  getInvoiceDependencies,
  getInvoices,
  subscribeToInvoiceChanges,
} from '../features/invoices/services/invoices.service';

interface InvoicesViewProps {
  scope?: 'all' | 'mine';
}

const InvoicesView = ({ scope = 'all' }: InvoicesViewProps) => {
  const { role, searchQuery } = useAppContext();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  const loadData = useCallback(() => {
    setInvoices(getInvoices(searchQuery));
    const dependencies = getInvoiceDependencies();
    setContractors(dependencies.contractors);
    setEvents(dependencies.events);
  }, [searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => subscribeToInvoiceChanges(loadData), [loadData]);

  const findContractor = useCallback((id: number) => (
    contractors.find((contractor) => contractor.id === id) ?? null
  ), [contractors]);

  const findEvent = useCallback((id: number) => (
    events.find((event) => event.id === id) ?? null
  ), [events]);

  const visibleInvoices = scope === 'mine' ? invoices.filter((invoice) => invoice.cid === 1) : invoices;
  const drafts = visibleInvoices.filter((invoice) => invoice.status === 'draft');
  const isCrew = role === 'crew';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{scope === 'mine' ? 'Moje faktury' : 'Faktury'}</h1>
          <p className="mt-0.5 text-xs text-gray-500">Self-billing system</p>
        </div>
        {!isCrew && drafts.length > 0 ? (
          <button onClick={() => generateInvoices()} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
            Generovat {drafts.length} faktur {'->'}
          </button>
        ) : (
          <StatusBadge status="approved" label="Self-billing běží" />
        )}
      </div>

      <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-blue-800"><Info size={14} /> Self-billing je aktivní</div>
        <p className="text-[11px] leading-relaxed text-blue-700">Po finálním schválení dostane kontraktor fakturu e-mailem. Má 72 hodin na námitku. Bez reakce se faktura uzavře a jde k proplacení.</p>
      </div>

      <div className="space-y-2">
        {visibleInvoices.map((invoice) => {
          const contractor = findContractor(invoice.cid);
          const event = findEvent(invoice.eid);
          if (!contractor || !event) return null;
          const countdown = invoice.status === 'sent' ? getCountdown(invoice.sentAt) : null;

          return (
            <div key={invoice.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{invoice.id}</span>
                    <span className="jn">{invoice.job}</span>
                    <StatusBadge status={invoice.status} />
                    {countdown && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${countdown.exp ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                        ⏱ {countdown.text}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="av h-6 w-6 text-[9px]" style={{ backgroundColor: contractor.bg, color: contractor.fg }}>{contractor.ii}</div>
                    <span className="text-xs font-medium">{contractor.name}</span>
                    <span className="text-xs text-gray-500">· {event.name}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-gray-600">
                      <span className="font-semibold text-gray-800">Hodiny</span>
                      <span>{` ${invoice.hours}h x ${Math.round(invoice.hAmt / Math.max(invoice.hours, 1))} Kč/h = ${formatCurrency(invoice.hAmt)}`}</span>
                    </div>
                    {(invoice.receiptAmt || 0) > 0 && (
                      <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-700">
                        <span className="font-semibold text-amber-900">Účtenky</span>
                        <span>{` = ${formatCurrency(invoice.receiptAmt || 0)}`}</span>
                      </div>
                    )}
                    {invoice.km > 0 && (
                      <div className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-blue-700">
                        <span className="font-semibold text-blue-900">Cestovné</span>
                        <span>{` ${invoice.km} km = ${formatCurrency(invoice.kAmt)}`}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xl font-semibold">{formatCurrency(invoice.total)}</div>
                  <div className="mt-1 text-[10px] text-gray-500">{invoice.sentAt ? formatShortDate(invoice.sentAt) : 'Bez data'}</div>
                </div>
              </div>

              {invoice.status === 'sent' && (
                <div className="mt-3 flex gap-2">
                  <button className="rounded-md border border-gray-200 px-3 py-1 text-[11px] hover:bg-gray-50">PDF ke stažení</button>
                  <button className="rounded-md border border-red-100 px-3 py-1 text-[11px] text-red-600 hover:bg-red-50">Rozporovat</button>
                  {!isCrew && countdown && !countdown.exp && (
                    <button onClick={() => approveInvoice(invoice.id)} className="ml-auto rounded-md bg-emerald-600 px-3 py-1 text-[11px] text-white hover:bg-emerald-700">
                      Uzavřít ručně {'->'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {visibleInvoices.length === 0 && (
          <div className="rounded-xl border border-gray-100 bg-white p-10 text-center text-sm text-gray-400">Zatím žádné faktury</div>
        )}
      </div>
    </motion.div>
  );
};

export default InvoicesView;
