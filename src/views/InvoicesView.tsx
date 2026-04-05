import React from 'react';
import { Info } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import { calculateTotalHours, formatCurrency, formatShortDate, getCountdown } from '../utils';
import { KM_RATE } from '../data';
import StatusBadge from '../components/shared/StatusBadge';

const InvoicesView = () => {
  const { filteredInvoices, findContractor, findEvent, generateInvoices, approveInvoice } = useAppContext();
  const drafts = filteredInvoices.filter(i => i.status === 'draft');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex justify-between items-center mb-4">
        <div><h1 className="text-lg font-semibold">Faktury</h1><p className="text-xs text-gray-500 mt-0.5">Self-billing systém</p></div>
        {drafts.length > 0 ? (
          <button onClick={generateInvoices} className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700">Generovat {drafts.length} faktur →</button>
        ) : (
          <StatusBadge status="approved" label="Vše vygenerováno" />
        )}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 text-blue-800 font-semibold text-xs mb-1"><Info size={14} /> Self-billing je aktivní</div>
        <p className="text-[11px] text-blue-700 leading-relaxed">Po generování dostane kontraktor PDF e-mailem. Má <strong>72 hodin</strong> na rozporování. Bez reakce → automaticky schváleno a odesláno do účtárny.</p>
      </div>

      <div className="space-y-2">
        {filteredInvoices.map(inv => {
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
                  <div className="text-[11px] text-gray-500 mt-2">{inv.hours}h × {Math.round(inv.hAmt / inv.hours)} Kč/h = {formatCurrency(inv.hAmt)}{inv.km > 0 && ` · cestovné ${inv.km} km = ${formatCurrency(inv.kAmt)}`}</div>
                </div>
                <div className="text-right shrink-0"><div className="text-xl font-semibold">{formatCurrency(inv.total)}</div></div>
              </div>
              {inv.status === 'sent' && (
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-1 border border-gray-200 rounded-md text-[11px] hover:bg-gray-50">PDF ke stažení</button>
                  <button className="px-3 py-1 border border-red-100 text-red-600 rounded-md text-[11px] hover:bg-red-50">Rozporovat</button>
                  {cd && !cd.exp && <button onClick={() => approveInvoice(inv.id)} className="ml-auto px-3 py-1 bg-emerald-600 text-white rounded-md text-[11px] hover:bg-emerald-700">Schválit ručně →</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default InvoicesView;
