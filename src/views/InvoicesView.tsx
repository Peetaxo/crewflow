import React from 'react';
import { Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { formatCurrency, formatShortDate, getCountdown } from '../utils';
import StatusBadge from '../components/shared/StatusBadge';

interface InvoicesViewProps {
  scope?: 'all' | 'mine';
}

const InvoicesView = ({ scope = 'all' }: InvoicesViewProps) => {
  const { filteredInvoices, findContractor, findEvent, generateInvoices, approveInvoice, role } = useAppContext();
  const invoices = scope === 'mine' ? filteredInvoices.filter((i) => i.cid === 1) : filteredInvoices;
  const drafts = invoices.filter((i) => i.status === 'draft');
  const isCrew = role === 'crew';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-lg font-semibold">{scope === 'mine' ? 'Moje faktury' : 'Faktury'}</h1>
          <p className="text-xs text-gray-500 mt-0.5">Self-billing system</p>
        </div>
        {!isCrew && drafts.length > 0 ? (
          <button onClick={generateInvoices} className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700">
            Generovat {drafts.length} faktur →
          </button>
        ) : (
          <StatusBadge status="approved" label="Self-billing bezi" />
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 text-blue-800 font-semibold text-xs mb-1"><Info size={14} /> Self-billing je aktivni</div>
        <p className="text-[11px] text-blue-700 leading-relaxed">Po finalnim schvaleni dostane kontraktor fakturu e-mailem. Ma 72 hodin na namitku. Bez reakce se faktura uzavira a jde k proplaceni.</p>
      </div>

      <div className="space-y-2">
        {invoices.map((inv) => {
          const c = findContractor(inv.cid);
          const e = findEvent(inv.eid);
          if (!c || !e) return null;
          const cd = inv.status === 'sent' ? getCountdown(inv.sentAt) : null;
          return (
            <div key={inv.id} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-mono text-xs font-semibold">{inv.id}</span>
                    <span className="jn">{inv.job}</span>
                    <StatusBadge status={inv.status} />
                    {cd && <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${cd.exp ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>⏱ {cd.text}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="av w-6 h-6 text-[9px]" style={{ backgroundColor: c.bg, color: c.fg }}>{c.ii}</div>
                    <span className="text-xs font-medium">{c.name}</span>
                    <span className="text-xs text-gray-500">· {e.name}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <div className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-gray-600">
                      <span className="font-semibold text-gray-800">Hodiny</span>
                      <span>{` ${inv.hours}h x ${Math.round(inv.hAmt / Math.max(inv.hours, 1))} Kc/h = ${formatCurrency(inv.hAmt)}`}</span>
                    </div>
                    {(inv.receiptAmt || 0) > 0 && (
                      <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-700">
                        <span className="font-semibold text-amber-900">Uctenky</span>
                        <span>{` = ${formatCurrency(inv.receiptAmt || 0)}`}</span>
                      </div>
                    )}
                    {inv.km > 0 && (
                      <div className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-blue-700">
                        <span className="font-semibold text-blue-900">Cestovne</span>
                        <span>{` ${inv.km} km = ${formatCurrency(inv.kAmt)}`}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0"><div className="text-xl font-semibold">{formatCurrency(inv.total)}</div><div className="text-[10px] text-gray-500 mt-1">{inv.sentAt ? formatShortDate(inv.sentAt) : 'Bez data'}</div></div>
              </div>
              {inv.status === 'sent' && (
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-1 border border-gray-200 rounded-md text-[11px] hover:bg-gray-50">PDF ke stazeni</button>
                  <button className="px-3 py-1 border border-red-100 text-red-600 rounded-md text-[11px] hover:bg-red-50">Rozporovat</button>
                  {!isCrew && cd && !cd.exp && <button onClick={() => approveInvoice(inv.id)} className="ml-auto px-3 py-1 bg-emerald-600 text-white rounded-md text-[11px] hover:bg-emerald-700">Uzavrit rucne →</button>}
                </div>
              )}
            </div>
          );
        })}
        {invoices.length === 0 && <div className="bg-white border border-gray-100 rounded-xl p-10 text-center text-gray-400 text-sm">Zatim zadne faktury</div>}
      </div>
    </motion.div>
  );
};

export default InvoicesView;
